import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync,gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { McpProtocol } from '../src/mcp/protocol.mjs';
import { authoringFixture,completeProposal,readAll,publishFixture,markdownPlan } from './fixtures/authoring.mjs';

test('directory identity groups multiple plans without generating nodes or grouping by Git root',()=>{const r=authoringFixture();try{
  fs.mkdirSync(path.join(r.dir,'.git'));const first=r.service.startPlanGraphWorkflow({plan_file_path:r.plan});const repeat=r.service.startPlanGraphWorkflow({plan_file_path:r.plan});assert.equal(first.project.id,repeat.project.id);assert.equal(repeat.reused,true);
  const other=path.join(r.dir,'SECOND.md');fs.writeFileSync(other,'# Second specification\nMore website requirements.');assert.equal(r.service.startPlanGraphWorkflow({plan_file_path:other}).project.id,first.project.id);
  const nested=path.join(r.dir,'sub');fs.mkdirSync(nested);const third=path.join(nested,'THIRD.md');fs.writeFileSync(third,'# Separate workspace\nIndependent requirements.');assert.notEqual(r.service.startPlanGraphWorkflow({plan_file_path:third}).project.id,first.project.id);
  assert.equal(r.store.listNodes(first.project.id).length,0);assert.equal(r.store.listImportSessions(first.project.id).length,0);
  assert.throws(()=>r.service.startPlanGraphWorkflow({}),/required/);
  const outside=path.join(r.dir,'..','outside.md');assert.throws(()=>r.service.startPlanGraphWorkflow({plan_file_path:r.plan,workspace_directory:nested}),/outside/);
}finally{r.close();}});

test('full source reading, valid coverage and per-node plans gate atomic publication',()=>{const r=authoringFixture();try{
  const start=r.service.startPlanGraphWorkflow({plan_file_path:r.plan}),args={project_id:start.project.id,run_id:start.run_id},proposal=completeProposal(start.source);
  r.service.authoring.stage({...args,batch_key:'website.complete',proposal});assert.throws(()=>r.service.authoring.finalize(args),e=>e.code==='SOURCE_NOT_FULLY_READ');assert.equal(r.store.listNodes(start.project.id).length,0);
  readAll(r.service,start.project.id,start.run_id,start.sources);
  proposal.coverage=[];r.service.authoring.stage({...args,batch_key:'website.complete',proposal});assert.throws(()=>r.service.authoring.finalize(args),e=>e.code==='SOURCE_COVERAGE_INCOMPLETE');
  proposal.coverage=completeProposal(start.source).coverage;proposal.features[0].implementation_plan='# TODO';r.service.authoring.stage({...args,batch_key:'website.complete',proposal});assert.throws(()=>r.service.authoring.finalize(args),e=>e.code==='MISSING_IMPLEMENTATION_PLAN');
  proposal.features[0].implementation_plan=markdownPlan('Frontend');r.service.authoring.stage({...args,batch_key:'website.complete',proposal});const preview=r.service.authoring.finalize({...args,review_only:true});assert.equal(preview.status,'staged');assert.equal(r.store.listNodes(start.project.id).length,0);
  const result=r.service.authoring.finalize(args);assert.equal(result.status,'committed');assert.equal(result.missing_plans,0);assert.equal(r.service.authoring.status(args).complete,true);
  const features=r.service.getSemanticFeatureList({project_id:start.project.id}).features;assert.equal(features.length,3);assert.equal(new Set(features.map(f=>f.metadata.display_id)).size,3);for(const f of features){assert.equal(f.implemented,false);assert.ok(r.store.getNodeDocument(f.id).file_name.startsWith(f.metadata.display_id));assert.equal(f.edge_cases[0].metadata.architecture_key,f.metadata.architecture_key);}
  assert.equal(r.service.getFrontier({project_id:start.project.id}).mode,'semantic');assert.equal(r.service.workspace.progress({project_id:start.project.id}).combined_total,6);
}finally{r.close();}});

test('batches resume, sources stale unfinished runs, and source references belong to the project',()=>{const r=authoringFixture();try{
  const a=r.service.startPlanGraphWorkflow({plan_file_path:r.plan}),args={project_id:a.project.id,run_id:a.run_id};let first=r.service.authoring.read({...args,source_id:a.source.id,limit:1});assert.ok(first.next_cursor);
  const p=completeProposal(a.source);r.service.authoring.stage({...args,batch_key:'website.partial',proposal:{architectures:p.architectures,features:p.features.slice(0,1),coverage:p.coverage}});r.service.authoring.stage({...args,batch_key:'website.rest',proposal:{features:p.features.slice(1)}});readAll(r.service,a.project.id,a.run_id,a.sources);assert.equal(r.service.authoring.status(args).batches.length,2);
  fs.appendFileSync(r.plan,'\nNew requirement\n');const updated=r.service.startPlanGraphWorkflow({plan_file_path:r.plan});assert.equal(updated.source.version,2);assert.throws(()=>r.service.authoring.finalize(args),e=>e.code==='AUTHORING_RUN_STALE');assert.equal(r.service.authoring.records('plan_source_revision',a.project.id).length,1);
  const fresh={project_id:a.project.id,run_id:updated.run_id};readAll(r.service,a.project.id,updated.run_id,updated.sources);r.service.authoring.stage({...fresh,batch_key:'website.old',proposal:p});assert.throws(()=>r.service.authoring.finalize(fresh),e=>e.code==='INVALID_SOURCE_CITATION');
}finally{r.close();}});

test('architecture-scoped updates preserve other nodes and plans; filters retain cross-group readiness',()=>{const r=authoringFixture();try{
  const {start,proposal}=publishFixture(r),project_id=start.project.id,original=r.service.getSemanticFeatureList({project_id}).features,backend=original.find(n=>n.metadata.architecture_key==='backend');
  assert.equal(r.service.getSemanticFeatureList({project_id,architecture_key:'frontend'}).features.length,1);assert.equal(r.service.workspace.progress({project_id,architecture_key:'frontend'}).combined_total,2);
  assert.equal(r.service.workspace.remaining({project_id,architecture_key:'frontend'}).items.find(i=>i.type==='feature').dependency_ready,false);
  const run=r.service.authoring.prepare({project_id,architecture_keys:['frontend']});readAll(r.service,project_id,run.run_id,run.sources);const partial={features:[{...proposal.features[0],title:'Updated frontend'}],coverage:proposal.coverage};r.service.authoring.stage({project_id,run_id:run.run_id,batch_key:'frontend.update',proposal:partial});r.service.authoring.finalize({project_id,run_id:run.run_id});
  assert.equal(r.store.getNode(backend.id).status,'active');assert.equal(r.store.getNode(backend.id).version,backend.version);assert.equal(r.store.getNodeDocument(backend.id).version,1);assert.equal(r.service.getSemanticFeatureList({project_id}).features.length,3);
  const updated=r.service.getSemanticFeatureList({project_id}).features.find(f=>f.metadata.architecture_key==='frontend');assert.equal(updated.id,original.find(f=>f.metadata.architecture_key==='frontend').id);assert.equal(updated.metadata.display_id,original.find(f=>f.metadata.architecture_key==='frontend').metadata.display_id);
  assert.equal(r.service.runCompactProgram({project_id,program:'architectures'}).architectures.length,3);assert.equal(r.service.runCompactProgram({project_id,program:'overview',architecture_key:'frontend'}).plans.written,2);
  const moved=r.service.authoring.move({project_id,reference:updated.metadata.display_id,architecture_key:'backend',expected_graph_version:r.store.getProject(project_id).graph_version});assert.equal(moved.moved_ids.length,3);assert.equal(r.store.getNode(updated.id).metadata.display_id,updated.metadata.display_id);
}finally{r.close();}});

test('templates are idempotent structure only and retired MCP tools cannot generate a graph',async()=>{const r=authoringFixture();try{
  const start=r.service.startPlanGraphWorkflow({plan_file_path:r.plan});const args={project_id:start.project.id,template_id:'fullstack-typescript-aspnet-mysql'};assert.equal(r.service.authoring.applyTemplate(args).architectures.length,3);const version=r.store.getProject(start.project.id).graph_version;r.service.authoring.applyTemplate(args);assert.equal(r.store.getProject(start.project.id).graph_version,version);assert.equal(r.store.listNodes(start.project.id).length,0);
  const protocol=new McpProtocol(r.service),call=async(name,arguments_)=>protocol.handle({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:arguments_}},{era:'legacy'});
  const result=await call('solution.preview_markdown_plan',{project_id:start.project.id,markdown:'# Generated? ',expected_graph_version:version});assert.equal(result.result.isError,true);assert.equal(result.result.structuredContent.code,'LEGACY_GENERATION_RETIRED');
  const retired=await call('solution.apply_starter_pack',{project_id:start.project.id,pack_id:'game',expected_graph_version:version});assert.equal(retired.result.structuredContent.code,'LEGACY_GENERATION_RETIRED');
  const templates=await call('solution.list_workflow_templates',{});assert.equal(templates.result.structuredContent.templates[0].id,args.template_id);
}finally{r.close();}});

test('project snapshots v2 preserve sources/architectures/plans and restore v1 snapshots',()=>{const r=authoringFixture();try{
  const {start}=publishFixture(r),snapshot=r.service.exportProjectSnapshot({project_id:start.project.id});const data=JSON.parse(gunzipSync(fs.readFileSync(snapshot.file_path)));assert.equal(data.version,2);r.service.deleteProject({project_id:start.project.id,confirm_title:start.project.title});r.service.restoreProjectSnapshot({...snapshot,expected_sha256:snapshot.sha256,confirm_title:start.project.title});assert.equal(r.service.authoring.listArchitectures({project_id:start.project.id}).architectures.length,3);assert.equal(r.service.getImplementationPlanCoverage({project_id:start.project.id}).with_plan,6);
  r.service.deleteProject({project_id:start.project.id,confirm_title:start.project.title});data.version=1;const bytes=gzipSync(JSON.stringify(data));fs.writeFileSync(snapshot.file_path,bytes);r.service.restoreProjectSnapshot({...snapshot,expected_sha256:createHash('sha256').update(bytes).digest('hex'),confirm_title:start.project.title});assert.equal(r.service.getImplementationPlanCoverage({project_id:start.project.id}).with_plan,6);
}finally{r.close();}});

test('publication rolls back all nodes, documents and architectures on a storage failure',()=>{const r=authoringFixture();try{
  const start=r.service.startPlanGraphWorkflow({plan_file_path:r.plan}),args={project_id:start.project.id,run_id:start.run_id};readAll(r.service,start.project.id,start.run_id,start.sources);r.service.authoring.stage({...args,batch_key:'website.complete',proposal:completeProposal(start.source)});
  const save=r.store.upsertNodeDocument.bind(r.store);let calls=0;r.store.upsertNodeDocument=a=>{if(++calls===2)throw new Error('simulated storage failure');return save(a);};assert.throws(()=>r.service.authoring.finalize(args),/storage failure/);assert.equal(r.store.listNodes(start.project.id).length,0);assert.equal(r.service.authoring.listArchitectures({project_id:start.project.id}).architectures.length,0);r.store.upsertNodeDocument=save;assert.equal(r.service.authoring.finalize(args).status,'committed');
}finally{r.close();}});

test('revisions preserve numbering, manual cases, importance overrides and document history',()=>{const r=authoringFixture();try{
  const {start,proposal}=publishFixture(r),project_id=start.project.id,frontend=r.service.getSemanticFeatureList({project_id}).features.find(f=>f.metadata.architecture_key==='frontend');
  r.service.workspace.setImportance({project_id,reference:frontend.metadata.display_id,priority:'P3',rationale:'Developer deferred this feature',expected_node_version:frontend.version});
  const human=r.service.addEdgeCase({project_id,parent_feature_id:frontend.id,title:'Manual failure discovery',expected_graph_version:r.store.requireProject(project_id).graph_version});r.service.setNodeImplementationPlan({project_id,node_id:human.id,markdown:markdownPlan('Manual recovery')});assert.equal(human.metadata.architecture_key,'frontend');
  const run=r.service.authoring.prepare({project_id});readAll(r.service,project_id,run.run_id,run.sources);proposal.features[0].implementation_plan=markdownPlan('Revised frontend');r.service.authoring.stage({project_id,run_id:run.run_id,batch_key:'website.revision',proposal});const result=r.service.authoring.finalize({project_id,run_id:run.run_id});assert.equal(result.missing_plans,0);
  const updated=r.store.getNode(frontend.id);assert.equal(updated.metadata.display_id,frontend.metadata.display_id);assert.equal(updated.metadata.priority,'P3');assert.equal(r.store.getNode(human.id).status,'active');assert.ok(r.store.listEdges(project_id).some(e=>e.type==='has_edge_case'&&e.target_id===human.id));assert.equal(r.store.getNodeDocument(frontend.id).version,2);assert.equal(r.service.authoring.finalize({project_id,run_id:run.run_id}).already_committed,true);
}finally{r.close();}});

test('scoped updates reject cross-architecture cycles and removal of referenced features',()=>{const r=authoringFixture();try{
  const {start,proposal}=publishFixture(r),project_id=start.project.id;
  const run=r.service.authoring.prepare({project_id,architecture_keys:['database']});readAll(r.service,project_id,run.run_id,run.sources);const args={project_id,run_id:run.run_id,batch_key:'database.update'};
  r.service.authoring.stage({...args,proposal:{features:[{...proposal.features[2],depends_on:['frontend.outcome']}],coverage:proposal.coverage}});assert.throws(()=>r.service.authoring.finalize(args),e=>e.code==='SEMANTIC_DEPENDENCY_CYCLE');
  r.service.authoring.stage({...args,proposal:{features:[{...proposal.features[2],key:'database.replacement'}],coverage:[{...proposal.coverage[0],feature_keys:['database.replacement','frontend.outcome','backend.outcome']}]}});assert.throws(()=>r.service.authoring.finalize(args),/Unknown or superseded dependency/);assert.equal(r.service.getSemanticFeatureList({project_id}).features.length,3);
}finally{r.close();}});

test('source updates stale linked verification and old cursors without changing node IDs or plans',()=>{const r=authoringFixture();try{
  const {start}=publishFixture(r),project_id=start.project.id,nodes=r.store.listNodes(project_id),feature=nodes.find(n=>n.type==='feature');r.store.updateNode(feature.id,{implemented:true,implementation_state:'implemented',verification_state:'verified',verified_at:new Date().toISOString()});
  const priorPlan=r.store.getNodeDocument(feature.id),reading=r.service.authoring.prepare({project_id}),page=r.service.authoring.read({project_id,run_id:reading.run_id,source_id:start.source.id,limit:1});
  fs.appendFileSync(r.plan,'New requirement\n');assert.equal(r.service.authoring.status({project_id,run_id:start.run_id}).complete,false);assert.throws(()=>r.service.authoring.finalize({project_id,run_id:reading.run_id}),e=>e.code==='AUTHORING_RUN_STALE');
  const changed=r.service.startPlanGraphWorkflow({plan_file_path:r.plan});assert.equal(changed.project.id,project_id);assert.equal(r.store.getNode(feature.id).verification_state,'stale');assert.equal(r.store.getNodeDocument(feature.id).sha256,priorPlan.sha256);assert.throws(()=>r.service.authoring.read({project_id,run_id:changed.run_id,source_id:start.source.id,cursor:page.next_cursor}),e=>e.code==='STALE_CURSOR');
}finally{r.close();}});
