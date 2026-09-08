import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LsgStore } from '../src/core/db.mjs';
import { LsgService } from '../src/core/service.mjs';

function runtime(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-core-'));const store=new LsgStore(path.join(dir,'lsg.sqlite'));const service=new LsgService(store,{workspaceRoot:dir});return {dir,store,service,close(){store.close();fs.rmSync(dir,{recursive:true,force:true});}};}

const websitePlan=`# Acme Shop\n\n## Product\n- Build a responsive storefront\n- Users can create accounts and sign in\n- Store products and orders in a database\n- Accept card payments and handle refunds\n- Send order confirmation email\n\n## Implementation\n- [x] Create initial frontend shell\n- [ ] Checkout flow\n`;

test('Markdown bootstrap seeds domain-aware graph and preserves source claims as claims',()=>{
  const r=runtime();try{
    const p=r.service.createProject({project_id:'shop',title:'Shop'});
    const preview=r.service.previewMarkdownPlan({project_id:p.id,markdown:websitePlan,file_name:'plan.md',expected_graph_version:p.graph_version,starter_pack_mode:'auto'});
    assert.equal(preview.status,'analyzed');
    assert.ok(preview.analysis.candidates.length>10);
    assert.ok(preview.analysis.detected_archetypes.some(x=>['website','ecommerce'].includes(x.pack_id)));
    const commit=r.service.commitPlanImport({project_id:p.id,import_session_id:preview.id,expected_graph_version:preview.expected_graph_version});
    assert.ok(commit.created_nodes>0);
    const audit=r.service.auditImplementationStatus({project_id:p.id});
    assert.ok(audit.total>10);
    assert.ok(audit.source_claimed_implemented.length>=1);
    assert.ok(audit.source_claimed_implemented.some(x=>!x.implemented));
    assert.ok(audit.not_implemented.length>0);
  } finally {r.close();}
});

test('model can add edge case, implement it, verify it, and audit the whole graph',()=>{
  const r=runtime();try{
    const p=r.service.createProject({project_id:'game',title:'Game'});
    const feature=r.store.insertNode({project_id:p.id,type:'feature',title:'Save system'});r.store.bumpGraphVersion(p.id);
    let gv=r.store.getProject(p.id).graph_version;
    const ec=r.service.addEdgeCase({project_id:p.id,parent_feature_id:feature.id,title:'Crash during atomic save replacement',expected_graph_version:gv,origin:'model_discovery'});
    assert.equal(ec.implemented,false);
    assert.equal(ec.verification_state,'unverified');
    gv=r.store.getProject(p.id).graph_version;
    const impl=r.service.setImplementationState({project_id:p.id,node_id:ec.id,implemented:true,expected_graph_version:gv,expected_node_version:ec.version,commit_sha:'abc1234',reason:'Implemented temp-file + fsync + atomic rename'});
    assert.equal(impl.implemented,true);assert.equal(impl.commit_sha,'abc1234');assert.ok(impl.implemented_at);
    gv=r.store.getProject(p.id).graph_version;
    const ver=r.service.setVerificationState({project_id:p.id,node_id:ec.id,verification_state:'verified',expected_graph_version:gv,expected_node_version:impl.version,evidence:{kind:'e2e',summary:'Killed process during write; prior save recovered'}});
    assert.equal(ver.verification_state,'verified');assert.ok(ver.verified_at);
    const audit=r.service.auditImplementationStatus({project_id:p.id});
    assert.ok(audit.implemented.some(x=>x.id===ec.id));assert.ok(audit.verified.some(x=>x.id===ec.id));
  } finally {r.close();}
});

test('verification cannot be true before implementation and stale verification reopens when implementation is reverted',()=>{
  const r=runtime();try{
    const p=r.service.createProject({project_id:'p',title:'P'});const n=r.store.insertNode({project_id:p.id,type:'feature',title:'Payments'});r.store.bumpGraphVersion(p.id);
    let gv=r.store.getProject(p.id).graph_version;
    assert.throws(()=>r.service.setVerificationState({project_id:p.id,node_id:n.id,verification_state:'verified',expected_graph_version:gv}),/Cannot verify/);
    let u=r.service.setImplementationState({project_id:p.id,node_id:n.id,implemented:true,expected_graph_version:gv,expected_node_version:n.version});
    gv=r.store.getProject(p.id).graph_version;u=r.service.setVerificationState({project_id:p.id,node_id:n.id,verification_state:'verified',expected_graph_version:gv,expected_node_version:u.version});
    gv=r.store.getProject(p.id).graph_version;u=r.service.setImplementationState({project_id:p.id,node_id:n.id,implemented:false,expected_graph_version:gv,expected_node_version:u.version});
    assert.equal(u.verification_state,'stale');assert.equal(u.implemented,false);assert.ok(u.last_invalidated_at);
  } finally {r.close();}
});

test('child edge case inherits parent commit when no direct commit is assigned',()=>{
  const r=runtime();try{
    const p=r.service.createProject({project_id:'p',title:'P'});const parent=r.store.insertNode({project_id:p.id,type:'feature',title:'Backend',implemented:true,commit_sha:'deadbeef'});const child=r.store.insertNode({project_id:p.id,type:'edge_case',title:'Backend unavailable',parent_id:parent.id});r.store.bumpGraphVersion(p.id);
    const view=r.service.getGraphView({project_id:p.id});const c=view.nodes.find(x=>x.id===child.id);assert.deepEqual(c.effective_commit,{sha:'deadbeef',source_node_id:parent.id,inherited:true});
  } finally {r.close();}
});

test('user memory is separate, correctable, forgettable, and compressed to budget',()=>{
  const r=runtime();try{
    const a=r.service.remember({user_id:'u1',text:'I prefer C# and self-hosted services',kind:'preference',subject:'development'});assert.equal(a.state,'active');
    const b=r.service.memoryCorrect({user_id:'u1',memory_id:a.id,value:'I prefer Rust for new systems'});assert.equal(b.replacement.state,'active');assert.equal(r.store.getMemory(a.id).state,'superseded');
    const ctx=r.service.memoryContext({user_id:'u1',budget_tokens:30});assert.ok(ctx.summary.includes('Rust'));assert.ok(!ctx.summary.includes('C#'));
    r.service.memoryForget({user_id:'u1',memory_id:b.replacement.id});const after=r.service.memoryContext({user_id:'u1',budget_tokens:30});assert.equal(after.items.length,0);
  } finally {r.close();}
});

test('workspace plan import blocks traversal outside configured workspace',()=>{
  const r=runtime();try{const p=r.service.createProject({project_id:'p',title:'P'});assert.throws(()=>r.service.previewMarkdownPlan({project_id:p.id,file_uri:'../outside.md',expected_graph_version:p.graph_version}),/outside LSG_WORKSPACE_ROOT/);}finally{r.close();}
});

test('stale plan preview cannot overwrite a graph that changed before commit',()=>{
  const r=runtime();try{const p=r.service.createProject({project_id:'race',title:'Race'});const preview=r.service.previewMarkdownPlan({project_id:p.id,markdown:'# App\n- frontend\n- backend',expected_graph_version:p.graph_version});const n=r.store.insertNode({project_id:p.id,type:'feature',title:'Concurrent change'});r.store.bumpGraphVersion(p.id);assert.ok(n);assert.throws(()=>r.service.commitPlanImport({project_id:p.id,import_session_id:preview.id,expected_graph_version:preview.expected_graph_version}),/Graph version conflict/);}finally{r.close();}
});

test('reimport deduplicates existing graph nodes rather than blindly cloning the plan',()=>{
  const r=runtime();try{let p=r.service.createProject({project_id:'dedupe',title:'Dedupe'});const md='# API\n- Backend API\n- Database\n- Authentication';let a=r.service.previewMarkdownPlan({project_id:p.id,markdown:md,expected_graph_version:p.graph_version});let c=r.service.commitPlanImport({project_id:p.id,import_session_id:a.id,expected_graph_version:a.expected_graph_version});const first=r.store.listNodes(p.id).length;p=r.store.getProject(p.id);a=r.service.previewMarkdownPlan({project_id:p.id,markdown:md,expected_graph_version:p.graph_version});c=r.service.commitPlanImport({project_id:p.id,import_session_id:a.id,expected_graph_version:a.expected_graph_version});const second=r.store.listNodes(p.id).length;assert.ok(c.reused_nodes>0);assert.equal(second,first);}finally{r.close();}
});

test('game starter coverage seeds engine/platform/save concerns and online concerns when plan signals them',()=>{
  const r=runtime();try{const p=r.service.createProject({project_id:'online-game',title:'Online game'});const md='# Co-op game\n- Build in Unity\n- Online multiplayer\n- player accounts\n- backend server\n- database progression\n- purchases';const a=r.service.previewMarkdownPlan({project_id:p.id,markdown:md,expected_graph_version:p.graph_version});assert.ok(a.analysis.archetypes.some(x=>x.pack_id==='game'));const titles=a.analysis.candidates.map(x=>x.title.toLowerCase());assert.ok(titles.some(t=>t.includes('engine')||t.includes('runtime')));assert.ok(titles.some(t=>t.includes('save')));assert.ok(titles.some(t=>t.includes('backend')||t.includes('network')));}finally{r.close();}
});

test('Codex semantic feature sets stage, commit, drive the frontier, and become stale after a plan update',()=>{
  const r=runtime();try{
    let p=r.service.createProject({project_id:'semantic',title:'Semantic project'});
    const baseline=r.service.previewMarkdownPlan({project_id:p.id,markdown:'# Game\n- Build a physical cockpit\n- Support co-op networking\n- Save expedition state',expected_graph_version:p.graph_version,starter_pack_mode:'disabled',allow_model_edge_case_expansion:false});
    r.service.commitPlanImport({project_id:p.id,import_session_id:baseline.id,expected_graph_version:baseline.expected_graph_version});
    const sourceNodes=r.store.listNodes(p.id).filter(n=>n.metadata.layer==='source');
    const prepared=r.service.prepareSemanticFeatureSet({project_id:p.id,max_features:5});
    assert.equal(prepared.status,'prepared');assert.ok(prepared.brief.source_node_catalog.length>0);
    const proposal={features:[
      {key:'cockpit.foundation',title:'Physical cockpit foundation',priority:'P0',outcome:'Players inhabit and operate a real cockpit.',source_node_ids:[sourceNodes[0].id],acceptance_criteria:['A player can enter and exit the cockpit.'],non_goals:['Heavy-frame crew split'],depends_on:[],edge_cases:[{key:'cockpit.disconnect',title:'Pilot disconnects while seated',trigger:'The owning client disconnects.',expected_behavior:'Server safely releases control.',severity:'high',validation_scenario:'Disconnect a seated client during a session.'}]},
      {key:'cockpit.coop',parent_key:'cockpit.foundation',title:'Cockpit co-op control routing',priority:'P1',outcome:'Crew members share bounded control channels.',source_node_ids:[sourceNodes[1].id],acceptance_criteria:['Pilot and gunner can control separate channels.'],non_goals:[],depends_on:['cockpit.foundation'],edge_cases:[]}
    ]};
    const staged=r.service.stageSemanticFeatureSet({project_id:p.id,run_id:prepared.run_id,proposal,auto_commit:false});assert.equal(staged.status,'staged');assert.equal(staged.auto_committed,false);assert.equal(staged.diff.created.length,2);assert.deepEqual(staged.diff.superseded,[]);
    p=r.store.getProject(p.id);const committed=r.service.commitSemanticFeatureSet({project_id:p.id,run_id:prepared.run_id,expected_graph_version:p.graph_version});assert.equal(committed.status,'committed');
    const semantic=r.service.getSemanticFeatureList({project_id:p.id});assert.equal(semantic.features.length,2);assert.equal(semantic.features[0].metadata.display_id,'F1');assert.equal(semantic.features[1].metadata.display_id,'F1.1');assert.equal(semantic.features[0].edge_cases.length,1);assert.equal(semantic.features[0].edge_cases[0].metadata.display_id,'F1.E1');
    const reference=r.service.resolveSemanticFeatureReference({project_id:p.id,reference:'1'});assert.equal(reference.feature.metadata.semantic_key,'cockpit.foundation');assert.equal(reference.descendants.length,1);
    const frontier=r.service.getFrontier({project_id:p.id,limit:5});assert.equal(frontier.mode,'semantic');assert.equal(frontier.frontier[0].metadata.semantic_key,'cockpit.foundation');
    p=r.store.getProject(p.id);const revised=r.service.previewMarkdownPlan({project_id:p.id,markdown:'# Game\n- Build a physical cockpit\n- Support co-op networking\n- Save expedition state\n- Add recovery logistics',expected_graph_version:p.graph_version,starter_pack_mode:'disabled',allow_model_edge_case_expansion:false});
    r.service.commitPlanImport({project_id:p.id,import_session_id:revised.id,expected_graph_version:revised.expected_graph_version});
    assert.equal(r.store.getSemanticRun(prepared.run_id).status,'stale');
  } finally {r.close();}
});

test('semantic feature proposals reject dependency cycles and unsupported source references',()=>{
  const r=runtime();try{
    const p=r.service.createProject({project_id:'semantic-invalid',title:'Semantic invalid'});const preview=r.service.previewMarkdownPlan({project_id:p.id,markdown:'# Plan\n- Feature A',expected_graph_version:p.graph_version,starter_pack_mode:'disabled'});r.service.commitPlanImport({project_id:p.id,import_session_id:preview.id,expected_graph_version:preview.expected_graph_version});const run=r.service.prepareSemanticFeatureSet({project_id:p.id});
    const common={title:'Feature',priority:'P1',outcome:'Outcome',source_node_ids:['missing'],acceptance_criteria:['Pass'],non_goals:[],edge_cases:[]};
    assert.throws(()=>r.service.stageSemanticFeatureSet({project_id:p.id,run_id:run.run_id,proposal:{features:[{...common,key:'feature.a',depends_on:['feature.b']},{...common,key:'feature.b',depends_on:['feature.a']} ]}}),/invalid source node|cycle/);
  } finally {r.close();}
});

test('workspace resolution adopts the matching repository project and isolates other directories',()=>{
  const r=runtime();try{
    const edenRoot=path.join(r.dir,'Eden-Above');const otherRoot=path.join(r.dir,'Other-Project');
    fs.mkdirSync(path.join(edenRoot,'.git'),{recursive:true});fs.mkdirSync(path.join(otherRoot,'.git'),{recursive:true});
    r.service.createProject({project_id:'eden-above',title:'Eden Above'});
    const eden=r.service.resolveWorkspaceProject({working_directory:path.join(edenRoot,'src')});
    assert.equal(eden.project.id,'eden-above');assert.equal(eden.created,false);assert.equal(eden.workspace_root,path.resolve(edenRoot));
    const other=r.service.resolveWorkspaceProject({working_directory:otherRoot});
    assert.equal(other.created,true);assert.notEqual(other.project.id,'eden-above');
    assert.equal(r.service.resolveWorkspaceProject({working_directory:path.join(otherRoot,'nested')}).project.id,other.project.id);
  }finally{r.close();}
});

test('semantic staging auto-commits by default and returns recursive feature and edge-case counts',()=>{
  const r=runtime();try{
    let p=r.service.createProject({project_id:'semantic-auto',title:'Semantic auto'});
    const baseline=r.service.previewMarkdownPlan({project_id:p.id,markdown:'# Product\n- Build feature A\n- Build feature B',expected_graph_version:p.graph_version,starter_pack_mode:'disabled',allow_model_edge_case_expansion:false});
    r.service.commitPlanImport({project_id:p.id,import_session_id:baseline.id,expected_graph_version:baseline.expected_graph_version});
    const sources=r.store.listNodes(p.id).filter(n=>n.metadata.layer==='source');
    const run=r.service.prepareSemanticFeatureSet({project_id:p.id,max_features:5});
    const ec=(key,title)=>({key,title,trigger:'Trigger',expected_behavior:'Recover safely',severity:'high',validation_scenario:'Exercise the trigger'});
    const result=r.service.stageSemanticFeatureSet({project_id:p.id,run_id:run.run_id,proposal:{features:[
      {key:'feature.root',title:'Root feature',priority:'P0',outcome:'Root outcome',source_node_ids:[sources[0].id],acceptance_criteria:['Root passes'],non_goals:[],depends_on:[],edge_cases:[ec('feature.root.case','Root case')]},
      {key:'feature.child',parent_key:'feature.root',title:'Child feature',priority:'P1',outcome:'Child outcome',source_node_ids:[sources[1].id],acceptance_criteria:['Child passes'],non_goals:[],depends_on:[],edge_cases:[ec('feature.child.case.one','Child case one'),ec('feature.child.case.two','Child case two')]}
    ]}});
    assert.equal(result.status,'committed');assert.equal(result.auto_committed,true);
    assert.deepEqual(result.counts,{features_total:2,root_features:1,subfeatures:1,edge_cases_total:3});
    const list=r.service.getSemanticFeatureList({project_id:p.id});
    assert.deepEqual(list.counts,result.counts);
    assert.equal(list.features[0].direct_edge_case_count,1);assert.equal(list.features[0].recursive_edge_case_count,3);assert.equal(list.features[0].count_label,'F1 → 3 EC');
    assert.equal(list.features[1].recursive_edge_case_count,2);assert.equal(list.features[1].count_label,'F1.1 → 2 EC');
    p=r.store.getProject(p.id);const discovered=r.service.addEdgeCase({project_id:p.id,parent_feature_id:list.features[0].id,title:'Newly discovered root failure',expected_graph_version:p.graph_version,origin:'user_discovery'});
    assert.equal(discovered.metadata.layer,'semantic');assert.equal(discovered.metadata.display_id,'F1.E2');
    assert.equal(r.service.getSemanticFeatureList({project_id:p.id}).features[0].recursive_edge_case_count,4);
  }finally{r.close();}
});

test('semantic feature fields are editable while identity and numbering remain stable',()=>{
  const r=runtime();try{
    let p=r.service.createProject({project_id:'semantic-edit',title:'Semantic edit'});
    const baseline=r.service.previewMarkdownPlan({project_id:p.id,markdown:'# Product\n- Build feature A',expected_graph_version:p.graph_version,starter_pack_mode:'disabled',allow_model_edge_case_expansion:false});
    r.service.commitPlanImport({project_id:p.id,import_session_id:baseline.id,expected_graph_version:baseline.expected_graph_version});
    const source=r.store.listNodes(p.id).find(n=>n.metadata.layer==='source');const run=r.service.prepareSemanticFeatureSet({project_id:p.id});
    r.service.stageSemanticFeatureSet({project_id:p.id,run_id:run.run_id,proposal:{features:[{key:'feature.editable',title:'Before',priority:'P2',outcome:'Before outcome',source_node_ids:[source.id],acceptance_criteria:['Old criterion'],non_goals:[],depends_on:[],edge_cases:[]}]}});
    let feature=r.service.getSemanticFeatureList({project_id:p.id}).features[0];p=r.store.getProject(p.id);
    const updated=r.service.updateSemanticFeature({project_id:p.id,node_id:feature.id,expected_graph_version:p.graph_version,expected_node_version:feature.version,title:'After',outcome:'After outcome',priority:'P0',acceptance_criteria:['Criterion one','Criterion two'],non_goals:['Out of scope']});
    assert.equal(updated.title,'After');assert.equal(updated.description,'After outcome');assert.equal(updated.metadata.display_id,'F1');assert.equal(updated.acceptance_tests.length,2);assert.deepEqual(updated.metadata.non_goals,['Out of scope']);
  }finally{r.close();}
});

test('feature and edge-case implementation plans persist as Markdown documents',()=>{
  const r=runtime();try{
    const p=r.service.createProject({project_id:'plans',title:'Plans'});const feature=r.store.insertNode({project_id:p.id,type:'feature',title:'Feature'});const edgeCase=r.store.insertNode({project_id:p.id,type:'edge_case',title:'Edge case',parent_id:feature.id});
    const saved=r.service.setNodeImplementationPlan({project_id:p.id,node_id:feature.id,file_name:'F1-plan.md',markdown:'# Build F1\n\n- [ ] Implement **core** path',actor:'codex'});
    assert.equal(saved.file_name,'F1-plan.md');assert.match(saved.markdown,/\*\*core\*\*/);assert.equal(r.service.getNodeImplementationPlan({project_id:p.id,node_id:feature.id}).sha256,saved.sha256);
    assert.equal(r.service.setNodeImplementationPlan({project_id:p.id,node_id:edgeCase.id,file_name:'F1-E1.md',markdown:'# Recovery',actor:'codex'}).node_id,edgeCase.id);
    const testNode=r.store.insertNode({project_id:p.id,type:'test',title:'Test'});assert.throws(()=>r.service.setNodeImplementationPlan({project_id:p.id,node_id:testNode.id,markdown:'# invalid'}),/features and edge cases/);
  }finally{r.close();}
});
