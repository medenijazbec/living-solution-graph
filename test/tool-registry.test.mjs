import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LsgStore} from '../src/core/db.mjs';
import {LsgService} from '../src/core/service.mjs';
import {buildRegistry,validateArgs} from '../src/mcp/registry.mjs';
import {McpProtocol} from '../src/mcp/protocol.mjs';

function runtime(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-tool-audit-')),store=new LsgStore(path.join(dir,'lsg.sqlite')),service=new LsgService(store,{workspaceRoot:dir});return{dir,store,service,close(){store.close();fs.rmSync(dir,{recursive:true,force:true});}};}

test('every registered MCP tool has a strict valid contract and reaches dispatch',async()=>{const r=runtime();try{
  const registry=buildRegistry(r.service),names=registry.map(tool=>tool.name),protocol=new McpProtocol(r.service);
  assert.equal(names.length,76);assert.equal(new Set(names).size,names.length);
  const validValue=rule=>{if(rule.enum)return rule.enum[0];if(rule.type==='string')return 'x';if(rule.type==='boolean')return false;if(rule.type==='integer'||rule.type==='number')return rule.minimum??1;if(rule.type==='array')return Array.from({length:rule.minItems??0},()=>validValue(rule.items||{}));if(rule.type==='object'){const value={};for(const key of rule.required||[])value[key]=validValue(rule.properties?.[key]||{});return value;}return null;};
  for(const tool of registry){
    assert.match(tool.name,/^(solution|memory)\.[a-z0-9_]+$/);assert.ok(tool.description.length>=20,tool.name);assert.equal(tool.inputSchema.type,'object',tool.name);assert.equal(tool.inputSchema.additionalProperties,false,tool.name);assert.equal(typeof tool.handler,'function',tool.name);
    for(const required of tool.inputSchema.required||[])assert.ok(Object.hasOwn(tool.inputSchema.properties,required),`${tool.name}.${required}`);
    assert.match(validateArgs(tool.inputSchema,{__unexpected:true}),/^(?:missing required argument|unknown argument):/,tool.name);
    const args={};for(const required of tool.inputSchema.required||[])args[required]=validValue(tool.inputSchema.properties[required]);
    const response=await protocol.handle({jsonrpc:'2.0',id:tool.name,method:'tools/call',params:{name:tool.name,arguments:args}},{era:'legacy'});
    assert.doesNotMatch(response.result.content[0].text,/^Input validation error:/,tool.name);
  }
}finally{r.close();}});

test('shared validation rejects bounds, non-finite values and malformed nested data',()=>{const r=runtime();try{
  const tools=new Map(buildRegistry(r.service).map(tool=>[tool.name,tool]));
  assert.match(validateArgs(tools.get('solution.select_node_cascade').inputSchema,{project_id:'p',cascade_depth:-1}),/at least 0/);
  assert.match(validateArgs(tools.get('solution.select_node_cascade').inputSchema,{project_id:'p',cascade_depth:6}),/at most 5/);
  assert.match(validateArgs(tools.get('solution.run_program').inputSchema,{project_id:'p',program:'overview',limit:11}),/at most 10/);
  assert.match(validateArgs({type:'object',properties:{score:{type:'number'}},additionalProperties:false},{score:Number.NaN}),/finite number/);
  assert.match(validateArgs({type:'object',properties:{rows:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false}}},additionalProperties:false},{rows:[{}]}),/rows\[0\]\.name/);
  assert.match(validateArgs(tools.get('solution.stage_semantic_feature_set').inputSchema,{project_id:'p',run_id:'r',proposal:{}}),/proposal\.features/);
  assert.match(validateArgs(tools.get('solution.stage_plan_batch').inputSchema,{project_id:'p',expected_graph_version:1,plans:[]}),/at least 1 item/);
  assert.equal(validateArgs(tools.get('solution.stage_semantic_feature_set').inputSchema,{project_id:'p',run_id:'r',proposal:{features:[{key:'gap',title:'Gap',priority:'P2',importance_rationale:'Useful',outcome:'Outcome',proposed_gap:true,acceptance_criteria:['Pass']}]}}),null);
  assert.equal(validateArgs(tools.get('solution.stage_semantic_feature_set').inputSchema,{project_id:'p',run_id:'r',proposal:{features:[{key:'existing',title:'Existing',priority:'P1',outcome:'Updated outcome',source_node_ids:['source'],acceptance_criteria:['Pass']}]}}),null);
  assert.match(validateArgs(tools.get('solution.update_work').inputSchema,{project_id:'p',work_id:'w',owner:'a',expected_version:1,action:'submit',result:{summary:'Done',patch:'unbounded'}}),/unknown argument: result\.patch/);
  assert.match(validateArgs(tools.get('solution.review_work').inputSchema,{project_id:'p',work_id:'w',expected_version:1,reviewer:'r',approved:true,evidence:{kind:'guess',summary:'Maybe'}}),/must be one of/);
}finally{r.close();}});

test('protocol does not coerce false arguments into an empty object',async()=>{const r=runtime();try{const response=await new McpProtocol(r.service).handle({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'solution.get_tool_catalog',arguments:false}},{era:'legacy'});assert.equal(response.result.isError,true);assert.match(response.result.content[0].text,/arguments must be an object/);}finally{r.close();}});

test('compact tool catalog supports search, categories and stable pagination',()=>{const r=runtime();try{
  const registry=buildRegistry(r.service),catalog=registry.find(tool=>tool.name==='solution.get_tool_catalog');
  const first=catalog.handler({limit:5}),second=catalog.handler({limit:5,cursor:first.next_cursor}),semantic=catalog.handler({category:'semantic',query:'edge case',limit:25});
  assert.equal(first.items.length,5);assert.equal(second.cursor,5);assert.equal(new Set([...first.items,...second.items].map(item=>item.name)).size,10);assert.ok(first.total>=75);assert.ok(semantic.items.some(item=>item.name==='solution.get_semantic_edge_cases'));assert.ok(semantic.items.every(item=>item.category==='semantic'));assert.equal(catalog.handler({query:'no-such-tool'}).total,0);
  assert.equal(catalog.handler({query:'resolve_workspace_project'}).items[0].category,'projects_and_imports');
}finally{r.close();}});

test('project integrity audit detects semantic identity, evidence and dependency corruption',()=>{const r=runtime();try{
  r.service.createProject({project_id:'p',title:'Project',metadata:{workspace_root:r.dir}});
  const source=r.store.insertNode({project_id:'p',type:'requirement',title:'Source',metadata:{layer:'source'}});
  const feature=r.store.insertNode({project_id:'p',type:'feature',title:'Feature',metadata:{layer:'semantic',semantic_key:'feature.one',display_id:'F1',priority:'P0',importance_rationale:'Foundation',source_node_ids:[source.id],acceptance_criteria:['Observable result']}});
  const edgeCase=r.store.insertNode({project_id:'p',type:'edge_case',title:'Failure',description:'Recover safely',parent_id:feature.id,metadata:{layer:'semantic',semantic_key:'feature.one.failure',display_id:'F1.E1',trigger:'Collision',validation_scenario:'Force collision'}});
  r.store.insertEdge({project_id:'p',source_id:feature.id,target_id:source.id,type:'derived_from'});r.store.insertEdge({project_id:'p',source_id:feature.id,target_id:edgeCase.id,type:'has_edge_case'});
  let audit=r.service.validateProjectIntegrity({project_id:'p'});assert.equal(audit.ok,true,JSON.stringify(audit.issues));assert.equal(audit.counts.total,0);
  const duplicate=r.store.insertNode({project_id:'p',type:'feature',title:'Duplicate',metadata:{layer:'semantic',semantic_key:'feature.one',display_id:'F1',priority:'P0',importance_rationale:'Duplicate',source_node_ids:['missing-source']}});
  r.store.insertEdge({project_id:'p',source_id:duplicate.id,target_id:duplicate.id,type:'depends_on'});
  r.service.workspace.put('files',duplicate.id,'p',{node_id:'missing-node',project_id:'p',paths:['../escape']});
  audit=r.service.validateProjectIntegrity({project_id:'p',limit:100});const codes=new Set(audit.issues.map(issue=>issue.code));
  for(const code of ['duplicate_semantic_key','duplicate_display_id','missing_source_evidence','self_dependency','dependency_cycle','orphan_file_mapping','unsafe_file_mapping'])assert.ok(codes.has(code),code);
  assert.equal(audit.ok,false);assert.ok(audit.counts.errors>=7);assert.deepEqual(r.service.validateProjectIntegrity({project_id:'p',include_details:false}).issues,[]);
}finally{r.close();}});

test('project integrity audit reports malformed mapping records instead of throwing',()=>{const r=runtime();try{r.service.createProject({project_id:'p',title:'Project',metadata:{workspace_root:r.dir}});r.store.db.prepare("INSERT INTO workspace_records(kind,id,project_id,data,updated_at) VALUES('files','broken','p','null',?)").run(new Date().toISOString());const audit=r.service.validateProjectIntegrity({project_id:'p'});assert.ok(audit.issues.some(issue=>issue.code==='invalid_file_mapping'));}finally{r.close();}});

test('project integrity audit applies the canonical symlink workspace boundary',()=>{const r=runtime(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-tool-outside-'));try{r.service.createProject({project_id:'p',title:'Project',metadata:{workspace_root:r.dir}});const feature=r.store.insertNode({project_id:'p',type:'feature',title:'Feature',metadata:{layer:'semantic',semantic_key:'feature',display_id:'F1',priority:'P0',importance_rationale:'Foundation',proposed_gap:true,acceptance_criteria:['Pass']}});fs.writeFileSync(path.join(outside,'secret.txt'),'secret');fs.symlinkSync(outside,path.join(r.dir,'linked'),'junction');r.service.workspace.put('files',feature.id,'p',{node_id:feature.id,project_id:'p',paths:['linked/secret.txt']});const audit=r.service.validateProjectIntegrity({project_id:'p'});assert.ok(audit.issues.some(issue=>issue.code==='unsafe_file_mapping'));}finally{r.close();fs.rmSync(outside,{recursive:true,force:true});}});

test('project integrity audit reports an unavailable workspace root without throwing',()=>{const r=runtime();try{r.service.createProject({project_id:'p',title:'Project'});const feature=r.store.insertNode({project_id:'p',type:'feature',title:'Feature',metadata:{layer:'semantic',semantic_key:'feature',display_id:'F1',priority:'P0',importance_rationale:'Foundation',proposed_gap:true,acceptance_criteria:['Pass']}});r.service.workspace.put('files',feature.id,'p',{node_id:feature.id,project_id:'p',paths:['src/file.mjs']});const audit=r.service.validateProjectIntegrity({project_id:'p'});assert.ok(audit.issues.some(issue=>issue.code==='unsafe_file_mapping'));}finally{r.close();}});
