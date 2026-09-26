import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LsgStore } from '../src/core/db.mjs';
import { LsgService } from '../src/core/service.mjs';
import { McpProtocol } from '../src/mcp/protocol.mjs';

function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-plan-workflow-'));
  const store=new LsgStore(path.join(dir,'data','lsg.sqlite'));
  const service=new LsgService(store,{workspaceRoot:dir});
  return {dir,store,service,close(){store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}

function writePlan(root,relative,body='- Build a robust save system'){
  const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,`# ${path.basename(file,'.md')}\n\n${body}\n`,'utf8');return file;
}

test('plan graph workflow keys projects by canonical master-plan file and reuses unchanged imports',()=>{
  const r=fixture();try{
    const repo=path.join(r.dir,'game');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});
    const first=writePlan(repo,'plans/master-a.md'),other=writePlan(repo,'plans/master-b.md'),nested=writePlan(repo,'other/master.md');
    const a=r.service.startPlanGraphWorkflow({plan_file_path:first});
    assert.equal(a.status,'prepared');assert.equal(a.project.metadata.master_plan_path,fs.realpathSync(first));
    assert.ok(a.source_import.committed);assert.equal(a.semantic_run.status,'prepared');assert.ok(a.brief.source_node_catalog.length>0);
    const repeated=r.service.startPlanGraphWorkflow({plan_file_path:first});
    assert.equal(repeated.project.id,a.project.id);assert.equal(repeated.source_import.reused,true);
    assert.equal(r.store.listImportSessions(a.project.id).length,1);
    const b=r.service.startPlanGraphWorkflow({plan_file_path:other});
    const c=r.service.startPlanGraphWorkflow({plan_file_path:nested});
    assert.notEqual(a.project.id,b.project.id);assert.notEqual(a.project.id,c.project.id);assert.notEqual(b.project.id,c.project.id);
    assert.throws(()=>r.service.resolveWorkspaceProject({working_directory:repo}),error=>error.code==='AMBIGUOUS_PROJECT'&&/multiple master-plan projects/i.test(error.message));
    assert.equal(r.service.resolveWorkspaceProject({working_directory:repo,project_id:a.project.id}).project.id,a.project.id);
    assert.throws(()=>r.service.startPlanGraphWorkflow({}),error=>error.code==='PLAN_PATH_REQUIRED');
    assert.throws(()=>r.service.startPlanGraphWorkflow({plan_file_path:path.join(repo,'missing.md')}),error=>error.code==='INVALID_ARGUMENT');
  }finally{r.close();}
});

test('plan workflow resumes after a semantic preparation failure and refreshes changed sources',()=>{
  const r=fixture();try{
    const repo=path.join(r.dir,'project');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});
    const file=writePlan(repo,'MASTER.md');const original=r.service.prepareSemanticFeatureSet.bind(r.service);
    r.service.prepareSemanticFeatureSet=()=>{throw new Error('temporary semantic failure');};
    const interrupted=r.service.startPlanGraphWorkflow({plan_file_path:file});
    assert.equal(interrupted.status,'incomplete');assert.ok(interrupted.project_id);assert.ok(interrupted.source_import.committed);
    r.service.prepareSemanticFeatureSet=original;
    const resumed=r.service.startPlanGraphWorkflow({plan_file_path:file});
    assert.equal(resumed.status,'prepared');assert.equal(resumed.source_import.reused,true);
    const firstRun=resumed.semantic_run.run_id;
    fs.appendFileSync(file,'\n- Recover saves after process interruption\n');
    const updated=r.service.startPlanGraphWorkflow({plan_file_path:file});
    assert.equal(updated.status,'prepared');assert.equal(updated.source_import.reused,false);
    assert.equal(r.store.getSemanticRun(firstRun).status,'stale');
  }finally{r.close();}
});

test('plan workflow resumes a validated lexical import after a failed source commit',()=>{
  const r=fixture();try{
    const repo=path.join(r.dir,'project');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});const file=writePlan(repo,'MASTER.md');
    const commit=r.service.commitPlanImport.bind(r.service);r.service.commitPlanImport=()=>{throw new Error('temporary commit failure');};
    const interrupted=r.service.startPlanGraphWorkflow({plan_file_path:file});assert.equal(interrupted.status,'incomplete');assert.equal(interrupted.source_import.status,'analyzed');const pendingId=interrupted.source_import.id;
    r.service.commitPlanImport=commit;const resumed=r.service.startPlanGraphWorkflow({plan_file_path:file});assert.equal(resumed.status,'prepared');assert.equal(resumed.source_import.id,pendingId);assert.equal(resumed.source_import.reused,true);assert.equal(r.store.listImportSessions(resumed.project.id).length,1);
  }finally{r.close();}
});

test('6.3 file-keyed projects coexist with v9 data and preserve legacy node IDs and plans on reopen',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-compatibility-')),dbPath=path.join(dir,'data','lsg.sqlite');let store=new LsgStore(dbPath),service=new LsgService(store,{workspaceRoot:dir});
  try{
    const prior=service.createProject({project_id:'legacy-project',title:'Legacy project',metadata:{workspace_root:dir,custom_flag:'preserve'}}),node=store.insertNode({project_id:prior.id,type:'feature',title:'Existing feature',metadata:{display_id:'F14.1'}});
    service.setNodeImplementationPlan({project_id:prior.id,node_id:node.id,file_name:'F14.1-implementation-plan.md',markdown:'# Existing plan\n\nKeep this document.'});const oldSchema=store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value;store.close();
    store=new LsgStore(dbPath);service=new LsgService(store,{workspaceRoot:dir});const repo=path.join(dir,'new-game');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});const plan=writePlan(repo,'MASTER.md');const result=service.startPlanGraphWorkflow({plan_file_path:plan});
    assert.equal(oldSchema,'9');assert.equal(store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value,'9');
    assert.equal(store.getProject(prior.id).metadata.custom_flag,'preserve');assert.equal(store.getNode(node.id).id,node.id);assert.equal(store.getNode(node.id).metadata.display_id,'F14.1');assert.equal(store.getNodeDocument(node.id).file_name,'F14.1-implementation-plan.md');assert.notEqual(result.project.id,prior.id);
  }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing plan pages filter semantic items by progress and bind cursors to status and graph version',()=>{
  const r=fixture();try{
    const project=r.service.createProject({project_id:'coverage',title:'Coverage'});
    const add=(display_id,title,parent_id=null)=>r.store.insertNode({project_id:project.id,type:'feature',title,parent_id,metadata:{layer:'semantic',semantic_key:`feature.${display_id.toLowerCase()}`,display_id,priority:'P1',acceptance_criteria:['Pass']}});
    const f1=add('F1','Not started'),f2=add('F2','Partial parent'),child=add('F2.1','Implemented child',f2.id),f3=add('F3','Implemented awaiting verification'),f4=add('F4','Fully complete');
    const ec=r.store.insertNode({project_id:project.id,type:'edge_case',title:'Missing recovery case',parent_id:f1.id,metadata:{layer:'semantic',semantic_key:'feature.f1.case',display_id:'F1.E1'}});
    r.store.insertEdge({project_id:project.id,source_id:f1.id,target_id:ec.id,type:'has_edge_case'});
    for(const node of [child,f3,f4])r.store.updateNode(node.id,{implemented:true,implementation_state:'implemented',implemented_at:new Date().toISOString()});
    r.store.updateNode(f4.id,{verification_state:'verified',verified_at:new Date().toISOString()});
    r.store.updateNode(child.id,{verification_state:'verified',verified_at:new Date().toISOString()});
    r.store.bumpGraphVersion(project.id);
    r.service.setNodeImplementationPlan({project_id:project.id,node_id:f4.id,markdown:'# Already planned'});

    const notStarted=r.service.getMissingPlansByStatus({project_id:project.id,status:'not_implemented',limit:10});
    assert.deepEqual(notStarted.items.map(item=>item.display_id),['F1','F1.E1']);
    const partial=r.service.getMissingPlansByStatus({project_id:project.id,status:'partially_implemented',limit:10});
    assert.deepEqual(partial.items.map(item=>item.display_id),['F2']);
    const implemented=r.service.getMissingPlansByStatus({project_id:project.id,status:'implemented',limit:1});
    assert.deepEqual(implemented.items.map(item=>item.display_id),['F2.1']);
    assert.equal(implemented.missing_total,2);assert.ok(implemented.next_cursor);
    const next=r.service.getMissingPlansByStatus({project_id:project.id,status:'implemented',limit:1,cursor:implemented.next_cursor});
    assert.deepEqual(next.items.map(item=>item.display_id),['F3']);assert.equal(next.next_cursor,null);
    assert.throws(()=>r.service.getMissingPlansByStatus({project_id:project.id,status:'partially_implemented',cursor:implemented.next_cursor}),error=>error.code==='STALE_CURSOR');
    const cursor=r.service.getMissingPlansByStatus({project_id:project.id,status:'not_implemented',limit:1});
    r.store.bumpGraphVersion(project.id);
    assert.throws(()=>r.service.getMissingPlansByStatus({project_id:project.id,status:'not_implemented',limit:1,cursor:cursor.next_cursor}),error=>error.code==='STALE_CURSOR');
    assert.deepEqual(r.service.getMissingPlansByStatus({project_id:project.id,status:'implemented',limit:10}).items.map(item=>item.display_id),['F2.1','F3']);
    assert.throws(()=>r.service.getMissingPlansByStatus({project_id:project.id,status:'unknown'}),error=>error.code==='INVALID_ARGUMENT');
  }finally{r.close();}
});

test('missing-plan status cursors become stale when plan edits change earlier page membership',()=>{
  const r=fixture();try{
    const project=r.service.createProject({project_id:'coverage-mutation',title:'Coverage mutation'});
    const add=display_id=>r.store.insertNode({project_id:project.id,type:'feature',title:display_id,metadata:{layer:'semantic',semantic_key:`feature.${display_id}`,display_id,priority:'P1'}});
    const planned=add('F1'),second=add('F2');add('F3');
    r.service.setNodeImplementationPlan({project_id:project.id,node_id:planned.id,markdown:'# Existing plan'});
    const first=r.service.getMissingPlansByStatus({project_id:project.id,status:'not_implemented',limit:1});
    assert.equal(first.items[0].display_id,'F2');assert.ok(first.next_cursor);
    const graphVersion=r.store.getProject(project.id).graph_version;
    r.service.deleteNodeImplementationPlan({project_id:project.id,node_id:planned.id,confirm_file_name:'F1-implementation-plan.md',expected_document_version:1});
    assert.equal(r.store.getProject(project.id).graph_version,graphVersion,'deleting a plan for an unimplemented feature does not alter the semantic graph version');
    assert.throws(()=>r.service.getMissingPlansByStatus({project_id:project.id,status:'not_implemented',limit:1,cursor:first.next_cursor}),error=>error.code==='STALE_CURSOR');
  }finally{r.close();}
});

test('kickoff through MCP publishes an authored semantic set and verifies its live frontier',async()=>{
  const r=fixture();try{
    const repo=path.join(r.dir,'game');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});
    const plan=writePlan(repo,'MASTER.md','- The player can save expedition progress');
    const protocol=new McpProtocol(r.service);
    const call=async(id,name,args)=>protocol.handle({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}},{era:'legacy'});
    const kickoff=await call(1,'solution.start_plan_graph_workflow',{plan_file_path:plan,max_features:5});
    const start=kickoff.result.structuredContent;assert.equal(start.status,'prepared');
    const source=start.brief.source_node_catalog.find(node=>node.type==='feature');assert.ok(source);
    const staged=await call(2,'solution.stage_semantic_feature_set',{project_id:start.project.id,run_id:start.semantic_run.run_id,auto_commit:true,proposal:{features:[{key:'save.expedition',title:'Save expedition progress',priority:'P1',importance_rationale:'Required to preserve the central player outcome.',outcome:'Players can resume a saved expedition.',source_node_ids:[source.id],acceptance_criteria:['Reload restores the saved expedition.'],non_goals:[],depends_on:[],edge_cases:[]}]}});
    assert.equal(staged.result.structuredContent.status,'committed');assert.equal(staged.result.structuredContent.auto_committed,true);
    const list=await call(3,'solution.get_semantic_feature_list',{project_id:start.project.id});
    const frontier=await call(4,'solution.get_frontier',{project_id:start.project.id,limit:5});
    assert.equal(list.result.structuredContent.features.length,1);assert.equal(frontier.result.structuredContent.mode,'semantic');
    const missing=await call(5,'solution.get_missing_plans_by_status',{project_id:start.project.id,status:'not_implemented',limit:10});
    assert.equal(missing.result.structuredContent.items.length,1);assert.equal(missing.result.structuredContent.items[0].display_id,'F1');
    const compact=await call(6,'solution.run_program',{project_id:start.project.id,program:'missing_plans',status:'not_implemented',limit:10});
    assert.equal(compact.result.structuredContent.items.length,1);
  }finally{r.close();}
});
