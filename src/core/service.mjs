import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { analyzeMarkdownPlan, commitAnalysis, detectArchetypes, getStarterCatalog, getStarterPack } from './bootstrap.mjs';
import { newId, normalizeTitle, nowIso } from './db.mjs';
import { SemanticLayer } from './semantic.mjs';

function sha256(s){return createHash('sha256').update(s).digest('hex');}
function approxTokens(s){return Math.ceil(String(s).length/4);}
function toolError(message,code='LSG_ERROR',extra={}){const e=new Error(message);e.code=code;Object.assign(e,extra);return e;}

export class LsgService {
  constructor(store,{workspaceRoot='.'}={}) {
    this.store=store;
    this.workspaceRoot=path.resolve(workspaceRoot);
    this.semantic=new SemanticLayer(store);
  }

  createProject(input={}) { return this.store.createProject({id:input.project_id||input.id,title:input.title||input.project_id||'Untitled project',description:input.description||'',metadata:input.metadata||{}}); }
  ensureProject(projectId,title='Imported project') { return this.store.getProject(projectId)||this.store.createProject({id:projectId,title}); }

  readWorkspaceFile(fileUri) {
    if(!fileUri) throw toolError('file_uri is required','INVALID_ARGUMENT');
    let candidate=String(fileUri);
    if(candidate.startsWith('file://')) candidate=fileURLToPath(candidate);
    if(/^https?:\/\//i.test(candidate)) throw toolError('Network URLs are not allowed for plan import','FILE_ACCESS_DENIED');
    const resolved=path.resolve(this.workspaceRoot,candidate);
    const root=this.workspaceRoot.endsWith(path.sep)?this.workspaceRoot:this.workspaceRoot+path.sep;
    if(resolved!==this.workspaceRoot && !resolved.startsWith(root)) throw toolError('Path is outside LSG_WORKSPACE_ROOT','FILE_ACCESS_DENIED');
    const st=fs.statSync(resolved); if(!st.isFile()) throw toolError('file_uri does not reference a file','FILE_ACCESS_DENIED');
    if(st.size>2*1024*1024) throw toolError('Plan file exceeds 2 MiB import limit','FILE_TOO_LARGE');
    return {text:fs.readFileSync(resolved,'utf8'),fileName:path.basename(resolved),resolved};
  }

  resolvePlanInput(input) {
    if(typeof input.markdown==='string') return {markdown:input.markdown,fileName:input.file_name||'plan.md',source:'inline'};
    if(input.file_uri){const r=this.readWorkspaceFile(input.file_uri);return {markdown:r.text,fileName:input.file_name||r.fileName,source:r.resolved};}
    throw toolError('Provide markdown + file_name, or file_uri','INVALID_ARGUMENT');
  }

  previewMarkdownPlan(input) {
    const project=this.ensureProject(input.project_id,input.project_title||input.file_name||'Imported plan');
    if(input.expected_graph_version!=null) this.store.assertGraphVersion(project.id,input.expected_graph_version);
    const {markdown,fileName,source}=this.resolvePlanInput(input);
    const analysis=analyzeMarkdownPlan({
      markdown,fileName,
      minArchetypeConfidence:input.min_archetype_confidence??input.policy?.min_archetype_confidence??0.55,
      starterPackMode:input.starter_pack_mode??input.policy?.starter_pack_mode??'auto',
      starterPackIds:input.starter_pack_ids??input.policy?.starter_pack_ids??null,
      allowEdgeCaseExpansion:input.allow_model_edge_case_expansion??input.policy?.allow_model_edge_case_expansion??true,
      maxEdgeCasesPerFeature:input.max_edge_cases_per_feature_per_pass??input.policy?.max_edge_cases_per_feature_per_pass??12
    });
    analysis.source.input_source=source;
    analysis.policy={implementation_truth:input.implementation_truth??input.policy?.implementation_truth??'strict_evidence'};
    const session=this.store.createImportSession({project_id:project.id,file_name:fileName,source_hash:analysis.source.sha256,source_text:markdown,mode:input.mode||'preview_only',status:'analyzed',expected_graph_version:project.graph_version,analysis});
    this.store.event({project_id:project.id,kind:'plan_import.previewed',actor:'mcp',entity_id:session.id,data:{source_hash:analysis.source.sha256,candidates:analysis.candidates.length}});
    return {...session,analysis};
  }

  bootstrapFromMarkdownPlan(input) {
    const mode=input.mode||'preview_only'; const preview=this.previewMarkdownPlan(input);
    if(mode==='preview_only') return preview;
    if(mode==='create_project_baseline' || mode==='merge_update') return {...preview,commit:this.commitPlanImport({project_id:input.project_id,import_session_id:preview.id,expected_graph_version:preview.expected_graph_version,reason:`Bootstrap mode ${mode}`})};
    throw toolError(`Unsupported mode: ${mode}`,'INVALID_ARGUMENT');
  }

  commitPlanImport(input){return commitAnalysis(this.store,{projectId:input.project_id,importSessionId:input.import_session_id,expectedGraphVersion:input.expected_graph_version,actor:'mcp',reason:input.reason||'Commit Markdown plan import'});}
  getPlanImport(input){const s=this.store.getImportSession(input.import_session_id);if(!s||s.project_id!==input.project_id)throw toolError('Import session not found','IMPORT_NOT_FOUND');return {...s,source_text_sha256:s.source_hash};}
  getBootstrapReport(input){const s=this.getPlanImport(input);return {project:this.store.getProject(input.project_id),import_session:s,analysis:s.analysis,starter_evaluations:this.store.listStarterEvaluations(input.project_id,input.import_session_id),audit:this.auditImplementationStatus({project_id:input.project_id})};}
  reconcilePlanImport(input){const s=this.getPlanImport(input);const audit=this.auditImplementationStatus({project_id:input.project_id});return {import_session_id:s.id,graph_version:this.store.getProject(input.project_id).graph_version,source_claims:audit.source_claimed_implemented,implemented:audit.implemented,claim_mismatches:audit.source_claimed_implemented.filter(n=>!n.implemented)};}

  setImplementationState(input) {
    const n=this.store.getNode(input.node_id); if(!n||n.project_id!==input.project_id) throw toolError('Node not found','NODE_NOT_FOUND');
    this.store.assertGraphVersion(input.project_id,input.expected_graph_version);
    const implemented=!!input.implemented; const nextState=implemented?'implemented':(input.implementation_state||'not_implemented'); const allowed=['not_implemented','implementing','implemented','stale','blocked','excluded']; if(!allowed.includes(nextState))throw toolError('Invalid implementation_state','INVALID_ARGUMENT'); const patch={implemented,implementation_state:nextState,commit_sha:input.commit_sha??n.commit_sha,metadata:{last_state_reason:input.reason||'',last_state_actor:input.actor||'model'}};
    if(implemented && !n.implemented) patch.implemented_at=nowIso();
    if(!implemented) {patch.implemented_at=null;if(n.verification_state==='verified') {patch.verification_state='stale';patch.last_invalidated_at=nowIso();}}
    const updated=this.store.updateNode(n.id,patch,input.expected_node_version??null);
    this.store.event({project_id:n.project_id,kind:'node.implementation_state_changed',actor:input.actor||'model',entity_id:n.id,data:{implemented,commit_sha:patch.commit_sha,reason:input.reason||''}});
    return {...updated,effective_commit:this.effectiveCommit(updated)};
  }

  setVerificationState(input) {
    const n=this.store.getNode(input.node_id); if(!n||n.project_id!==input.project_id) throw toolError('Node not found','NODE_NOT_FOUND');
    this.store.assertGraphVersion(input.project_id,input.expected_graph_version);
    const state=input.verification_state; if(!['unverified','verifying','verified','failed','stale'].includes(state))throw toolError('Invalid verification_state','INVALID_ARGUMENT');
    if(state==='verified'&&!n.implemented)throw toolError('Cannot verify a node that is not implemented','INVALID_STATE');
    const evidence=[...(n.metadata.evidence||[])]; if(input.evidence) evidence.push({at:nowIso(),...input.evidence});
    const patch={verification_state:state,verified_at:state==='verified'?nowIso():null,metadata:{evidence,last_verification_reason:input.reason||''}};
    const updated=this.store.updateNode(n.id,patch,input.expected_node_version??null);
    this.store.event({project_id:n.project_id,kind:'node.verification_state_changed',actor:input.actor||'model',entity_id:n.id,data:{verification_state:state,evidence:input.evidence||null}});
    return updated;
  }

  recordEvidence(input){
    const n=this.store.getNode(input.node_id);if(!n||n.project_id!==input.project_id)throw toolError('Node not found','NODE_NOT_FOUND');
    this.store.assertGraphVersion(input.project_id,input.expected_graph_version);
    const evidence=[...(n.metadata.evidence||[]),{id:newId('evid'),at:nowIso(),kind:input.kind||'note',summary:input.summary,commit_sha:input.commit_sha||null,artifact_uri:input.artifact_uri||null,details:input.details||null}];
    const updated=this.store.updateNode(n.id,{metadata:{evidence}},input.expected_node_version??null);
    this.store.event({project_id:n.project_id,kind:'evidence.recorded',actor:input.actor||'model',entity_id:n.id,data:evidence.at(-1)});
    return evidence.at(-1);
  }

  addEdgeCase(input) {
    this.store.assertGraphVersion(input.project_id,input.expected_graph_version);
    const parent=this.store.getNode(input.parent_feature_id);if(!parent||parent.project_id!==input.project_id)throw toolError('Parent feature not found','NODE_NOT_FOUND');
    const norm=normalizeTitle(input.title); const existing=this.store.findNodeByNormalizedTitle(input.project_id,'edge_case',norm,parent.id); if(existing)return {...existing,created:false};
    const node=this.store.insertNode({project_id:input.project_id,type:'edge_case',title:input.title,description:input.description||'',origin:input.origin||'model_discovery',implemented:false,implementation_state:'not_implemented',verification_state:'unverified',disposition:input.disposition||'required',parent_id:parent.id,metadata:{category:input.category||null,severity:input.severity||'medium',reason:input.reason||'',discovered_by:input.actor||'model'}});
    this.store.insertEdge({project_id:input.project_id,source_id:parent.id,target_id:node.id,type:'has_edge_case',origin:input.origin||'model_discovery'}); const gv=this.store.bumpGraphVersion(input.project_id);
    this.store.event({project_id:input.project_id,kind:'edge_case.created',actor:input.actor||'model',entity_id:node.id,data:{parent_feature_id:parent.id,title:node.title}});
    return {...node,created:true,graph_version:gv};
  }

  auditImplementationStatus(input) {
    const p=this.store.requireProject(input.project_id); const all=this.store.listNodes(p.id,{types:input.types||['feature','edge_case','requirement','decision','test']});
    const excluded=all.filter(n=>n.status==='excluded'||n.implementation_state==='excluded'||n.disposition==='not_applicable');
    const excludedIds=new Set(excluded.map(n=>n.id)); const nodes=all.filter(n=>!excludedIds.has(n.id));
    const implemented=nodes.filter(n=>n.implemented); const notImplemented=nodes.filter(n=>!n.implemented); const stale=nodes.filter(n=>n.implementation_state==='stale'||n.verification_state==='stale'); const blocked=nodes.filter(n=>n.implementation_state==='blocked'); const verified=nodes.filter(n=>n.verification_state==='verified'); const unverified=nodes.filter(n=>n.implemented&&n.verification_state!=='verified'); const sourceClaims=all.filter(n=>n.source_claimed_implemented); const unresolved=nodes.filter(n=>['conditional','unresolved'].includes(n.disposition));
    const slim=n=>({id:n.id,type:n.type,title:n.title,implemented:n.implemented,implementation_state:n.implementation_state,verification_state:n.verification_state,disposition:n.disposition,parent_id:n.parent_id,commit_sha:n.commit_sha,effective_commit:this.effectiveCommit(n),updated_at:n.updated_at});
    return {project_id:p.id,graph_version:p.graph_version,total:all.length,actionable_total:nodes.length,counts:{implemented:implemented.length,not_implemented:notImplemented.length,verified:verified.length,unverified_implemented:unverified.length,stale:stale.length,blocked:blocked.length,excluded:excluded.length,unresolved:unresolved.length,source_claimed_implemented:sourceClaims.length},implemented:implemented.map(slim),not_implemented:notImplemented.map(slim),verified:verified.map(slim),unverified_implemented:unverified.map(slim),stale:stale.map(slim),blocked:blocked.map(slim),excluded:excluded.map(slim),unresolved:unresolved.map(slim),source_claimed_implemented:sourceClaims.map(slim)};
  }

  effectiveCommit(node) { let n=node,depth=0; while(n&&depth++<20){if(n.commit_sha)return {sha:n.commit_sha,source_node_id:n.id,inherited:n.id!==node.id};n=n.parent_id?this.store.getNode(n.parent_id):null;}return null; }

  getGraphView(input) {
    const p=this.store.requireProject(input.project_id); const all=this.store.listNodes(p.id); const include=input.include_types||['feature','edge_case','requirement','decision','test','risk','constraint','scope_rule']; const nodes=all.filter(n=>include.includes(n.type)); const ids=new Set(nodes.map(n=>n.id)); const edges=this.store.listEdges(p.id).filter(e=>ids.has(e.source_id)&&ids.has(e.target_id));
    return {project:{id:p.id,title:p.title,graph_version:p.graph_version},nodes:nodes.map(n=>({...n,effective_commit:this.effectiveCommit(n)})),edges,generated_at:nowIso()};
  }

  search(input) {
    const q=normalizeTitle(input.query); const terms=q.split(' ').filter(Boolean); const rows=this.store.listNodes(input.project_id); const scored=rows.map(n=>{const t=normalizeTitle(`${n.title} ${n.description}`);let s=0;for(const x of terms)if(t.includes(x))s++;return {n,s};}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.n.title.localeCompare(b.n.title)).slice(0,input.limit||50); return scored.map(x=>({...x.n,score:x.s}));
  }
  findGaps(input){const a=this.auditImplementationStatus({project_id:input.project_id});return {project_id:input.project_id,graph_version:a.graph_version,gaps:[...a.not_implemented,...a.stale,...a.unverified_implemented].filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i)};}
  getFrontier(input){const semantic=this.semantic.frontier(input.project_id,input.limit||25);if(semantic)return semantic;const gaps=this.findGaps(input).gaps;const priority=gaps.sort((a,b)=>((a.type==='edge_case'?1:0)-(b.type==='edge_case'?1:0))||a.title.localeCompare(b.title));return {project_id:input.project_id,mode:'lexical_fallback',frontier:priority.slice(0,input.limit||25)};}

  listStarterPacks(){return getStarterCatalog();}
  detectProjectArchetypes(input){return {archetypes:detectArchetypes(input.markdown||'',input.min_archetype_confidence??0.55)};}
  applyStarterPack(input){
    const pack=getStarterPack(input.pack_id);if(!pack)throw toolError('Starter pack not found','PACK_NOT_FOUND');
    const project=this.store.requireProject(input.project_id);this.store.assertGraphVersion(project.id,input.expected_graph_version);
    const md=`# ${project.title}\n\n${project.description||''}`;const analysis=analyzeMarkdownPlan({markdown:md,fileName:`starter-${pack.id}.md`,starterPackMode:'auto',starterPackIds:[pack.id],allowEdgeCaseExpansion:false,minArchetypeConfidence:1});
    const session=this.store.createImportSession({project_id:project.id,file_name:`starter-${pack.id}.md`,source_hash:sha256(md),source_text:md,mode:'merge_update',status:'analyzed',expected_graph_version:project.graph_version,analysis});
    const commit=commitAnalysis(this.store,{projectId:project.id,importSessionId:session.id,expectedGraphVersion:project.graph_version,actor:'mcp',reason:`Apply starter pack ${pack.id}`});return {pack_id:pack.id,import_session_id:session.id,commit};
  }
  getStarterPackEvaluation(input){return {project_id:input.project_id,evaluations:this.store.listStarterEvaluations(input.project_id,input.import_session_id||null)};}

  prepareSemanticFeatureSet(input){return this.semantic.prepare(input);}
  stageSemanticFeatureSet(input){return this.semantic.stage(input);}
  commitSemanticFeatureSet(input){return this.semantic.commit(input);}
  getSemanticFeatureList(input){return this.semantic.listFeatures(input.project_id);}
  getSemanticEdgeCases(input){return this.semantic.listEdgeCases(input.project_id,input);}
  getSemanticDiff(input){return this.semantic.getDiff(input.project_id,input.run_id);}

  remember(input){
    if(input.text && !input.value) return this.store.insertMemory({user_id:input.user_id,kind:input.kind||'note',subject:input.subject||'user_input',value:input.text,scope:input.scope||'global',project_id:input.project_id||null,confidence:input.confidence??0.85,salience:input.salience??0.55,source:input.source||'conversation'});
    return this.store.insertMemory({user_id:input.user_id,kind:input.kind||'note',subject:input.subject||null,value:input.value,scope:input.scope||'global',project_id:input.project_id||null,confidence:input.confidence??0.85,salience:input.salience??0.55,source:input.source||'conversation',metadata:input.metadata||{}});
  }
  memorySearch(input){return this.store.listMemories(input.user_id,{projectId:input.project_id||null,includeInactive:!!input.include_inactive,query:input.query||null,limit:input.limit||100});}
  memoryCorrect(input){const old=this.store.getMemory(input.memory_id);if(!old||old.user_id!==input.user_id)throw toolError('Memory not found','MEMORY_NOT_FOUND');const replacement=this.store.insertMemory({user_id:old.user_id,kind:input.kind||old.kind,subject:input.subject||old.subject,value:input.value,scope:input.scope||old.scope,project_id:input.project_id??old.project_id,confidence:input.confidence??old.confidence,salience:input.salience??old.salience,source:input.source||'correction',supersedes_id:old.id});this.store.updateMemory(old.id,{state:'superseded'});return {superseded:old.id,replacement};}
  memoryForget(input){const old=this.store.getMemory(input.memory_id);if(!old||old.user_id!==input.user_id)throw toolError('Memory not found','MEMORY_NOT_FOUND');return this.store.updateMemory(old.id,{state:'forgotten'});}
  memoryContext(input){
    const items=this.store.listMemories(input.user_id,{projectId:input.project_id||null,limit:500});const budget=input.budget_tokens||1200;const selected=[];let used=0;
    for(const m of items){const line=`- [${m.kind}${m.subject?`/${m.subject}`:''}] ${m.value}`;const cost=approxTokens(line);if(used+cost>budget)continue;selected.push({...m,rendered:line});used+=cost;}
    return {user_id:input.user_id,project_id:input.project_id||null,budget_tokens:budget,estimated_tokens:used,summary:selected.map(x=>x.rendered).join('\n'),memory_ids:selected.map(x=>x.id),items:selected};
  }

  getContext(input){
    const p=this.store.requireProject(input.project_id);const mem=input.user_id?this.memoryContext({user_id:input.user_id,project_id:p.id,budget_tokens:input.memory_budget_tokens||800}):{summary:'',memory_ids:[]};const frontier=this.getFrontier({project_id:p.id,limit:input.frontier_limit||20});const graph=this.getGraphView({project_id:p.id});const semantic=this.getSemanticFeatureList({project_id:p.id});
    const context={project:{id:p.id,title:p.title,description:p.description,graph_version:p.graph_version},user_memory:mem.summary,frontier_mode:frontier.mode||'lexical_fallback',frontier:frontier.frontier,semantic_features:semantic.features.slice(0,input.max_nodes||150),nodes:semantic.features.length?graph.nodes.filter(n=>n.metadata?.layer==='semantic').slice(0,input.max_nodes||150):graph.nodes.slice(0,input.max_nodes||150),edges:graph.edges.slice(0,input.max_edges||250)};
    return {...context,context_hash:sha256(JSON.stringify(context))};
  }
}
