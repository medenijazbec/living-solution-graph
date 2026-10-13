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

test('v9 migration preserves legacy node IDs and plans while adding directory authoring',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-compatibility-')),dbPath=path.join(dir,'data','lsg.sqlite');let store=new LsgStore(dbPath),service=new LsgService(store,{workspaceRoot:dir});
  try{
    const prior=service.createProject({project_id:'legacy-project',title:'Legacy project',metadata:{workspace_root:dir,custom_flag:'preserve'}}),node=store.insertNode({project_id:prior.id,type:'feature',title:'Existing feature',metadata:{display_id:'F14.1'}});
    service.setNodeImplementationPlan({project_id:prior.id,node_id:node.id,file_name:'F14.1-implementation-plan.md',markdown:'# Existing plan\n\nKeep this document.'});store.db.prepare("UPDATE meta SET value='9' WHERE key='schema_version'").run();const oldSchema=store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value;store.close();
    store=new LsgStore(dbPath);service=new LsgService(store,{workspaceRoot:dir});const repo=path.join(dir,'new-game');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});const plan=writePlan(repo,'MASTER.md');const result=service.startPlanGraphWorkflow({plan_file_path:plan});
    assert.equal(oldSchema,'9');assert.equal(store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value,'10');
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
