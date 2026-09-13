import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { analyzeMarkdownPlan, commitAnalysis, detectArchetypes, getStarterCatalog, getStarterPack } from './bootstrap.mjs';
import { newId, normalizeTitle, nowIso } from './db.mjs';
import { SemanticLayer } from './semantic.mjs';
import { Workspace } from './workspace.mjs';
import { Activity } from './activity.mjs';
import { PlanBatches } from './plan-batches.mjs';
import { ProjectSnapshots } from './project-snapshots.mjs';

function sha256(s){return createHash('sha256').update(s).digest('hex');}
function normalizePlanText(s){return String(s).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trimEnd();}
function approxTokens(s){return Math.ceil(String(s).length/4);}
function toolError(message,code='LSG_ERROR',extra={}){const e=new Error(message);e.code=code;Object.assign(e,extra);return e;}
function canonicalWorkspace(value){const resolved=path.resolve(String(value||'.'));return process.platform==='win32'?resolved.toLowerCase():resolved;}
function isWithin(candidate,root){return candidate===root||candidate.startsWith(root.endsWith(path.sep)?root:root+path.sep);}
function workspaceBaseId(root){return path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'workspace';}
function workspaceSlug(root){return `${workspaceBaseId(root)}-${sha256(canonicalWorkspace(root)).slice(0,10)}`;}

export class LsgService {
  constructor(store,{workspaceRoot='.'}={}) {
    this.store=store;
    this.workspaceRoot=path.resolve(workspaceRoot);
    this.semantic=new SemanticLayer(store);
    this.workspace=new Workspace(this);
    this.activity=new Activity(this);
    this.planBatches=new PlanBatches(this);
    this.snapshots=new ProjectSnapshots(this);
    store.activity=this.activity;
  }

  createProject(input={}) { return this.store.createProject({id:input.project_id||input.id,title:input.title||input.project_id||'Untitled project',description:input.description||'',metadata:input.metadata||{}}); }
  ensureProject(projectId,title='Imported project') { return this.store.getProject(projectId)||this.store.createProject({id:projectId,title}); }

  resolveWorkspaceProject(input={}) {
    if(!input.working_directory)throw toolError('working_directory is required','INVALID_ARGUMENT');
    const supplied=path.resolve(String(input.working_directory));const requested=fs.existsSync(supplied)&&fs.statSync(supplied).isFile()?path.dirname(supplied):supplied;const key=canonicalWorkspace(requested);const projects=this.store.listProjects();
    let root=requested;while(!fs.existsSync(path.join(root,'.git'))){const parent=path.dirname(root);if(parent===root)break;root=parent;}if(!fs.existsSync(path.join(root,'.git')))root=requested;
    const rootKey=canonicalWorkspace(root);
    const requestedProject=input.project_id?this.store.getProject(input.project_id):null;
    if(requestedProject){const project=this.store.updateProjectMetadata(requestedProject.id,{workspace_root:root,workspace_key:rootKey,repository_root:requestedProject.metadata?.repository_root||root});return {project,workspace_root:root,workspace_key:rootKey,created:false};}
    const matchingUnboundProject=projects.find(project=>project.id===workspaceBaseId(root)&&!project.metadata?.workspace_root&&!project.metadata?.repository_root);
    if(matchingUnboundProject){const project=this.store.updateProjectMetadata(matchingUnboundProject.id,{workspace_root:root,workspace_key:rootKey,repository_root:root});return {project,workspace_root:root,workspace_key:rootKey,created:false};}
    const bound=projects.map(project=>({project,root:project.metadata?.workspace_root||project.metadata?.repository_root})).filter(x=>x.root).map(x=>({...x,canonical:canonicalWorkspace(x.root)})).filter(x=>isWithin(key,x.canonical)).sort((a,b)=>b.canonical.length-a.canonical.length)[0];
    if(bound){const project=bound.project.metadata?.workspace_root?bound.project:this.store.updateProjectMetadata(bound.project.id,{workspace_root:path.resolve(bound.root),workspace_key:bound.canonical});return {project,workspace_root:path.resolve(bound.root),workspace_key:bound.canonical,created:false};}
    const exact=projects.find(project=>canonicalWorkspace(project.metadata?.workspace_root||project.metadata?.repository_root||'')===rootKey);
    if(exact){const project=this.store.updateProjectMetadata(exact.id,{workspace_root:root,workspace_key:rootKey});return {project,workspace_root:root,workspace_key:rootKey,created:false};}
    const id=input.project_id||workspaceSlug(root);const project=this.store.getProject(id)||this.store.createProject({id,title:input.project_title||path.basename(root)||id,description:input.description||'',metadata:{workspace_root:root,workspace_key:rootKey,repository_root:root,auto_created_from_workspace:true}});
    return {project,workspace_root:root,workspace_key:rootKey,created:true};
  }

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
    const planPath=input.source_file_path||(source!=='inline'?source:null);
    if(planPath){const resolved=path.resolve(String(planPath));if(path.extname(resolved).toLowerCase()!=='.md'||!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())throw toolError('source_file_path must identify an existing Markdown file','INVALID_ARGUMENT');if(normalizePlanText(fs.readFileSync(resolved,'utf8'))!==normalizePlanText(markdown))throw toolError('Plan text does not match source_file_path','SOURCE_FILE_MISMATCH');this.resolveWorkspaceProject({working_directory:path.dirname(resolved),project_id:project.id});}
    const analysis=analyzeMarkdownPlan({
      markdown,fileName,
      minArchetypeConfidence:input.min_archetype_confidence??input.policy?.min_archetype_confidence??0.55,
      starterPackMode:input.starter_pack_mode??input.policy?.starter_pack_mode??'auto',
      starterPackIds:input.starter_pack_ids??input.policy?.starter_pack_ids??null,
      allowEdgeCaseExpansion:input.allow_model_edge_case_expansion??input.policy?.allow_model_edge_case_expansion??true,
      maxEdgeCasesPerFeature:input.max_edge_cases_per_feature_per_pass??input.policy?.max_edge_cases_per_feature_per_pass??12
    });
    analysis.source.input_source=planPath?path.resolve(String(planPath)):source;
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
    const norm=normalizeTitle(input.title); const existing=this.store.listNodes(input.project_id,{types:['edge_case'],status:'active'}).find(node=>normalizeTitle(node.title)===norm&&node.parent_id===parent.id); if(existing)return {...existing,created:false};
    const semanticParent=parent.metadata?.layer==='semantic';const directSemanticCases=semanticParent?this.store.listNodes(input.project_id,{types:['edge_case']}).filter(node=>node.parent_id===parent.id&&node.metadata?.layer==='semantic').map(node=>Number(node.metadata?.display_id?.match(/\.E(\d+)$/)?.[1]||0)):[];
    const semanticMetadata=semanticParent?{layer:'semantic',semantic_key:`${parent.metadata.semantic_key}.user_edge_case.${newId('key')}`,feature_key:parent.metadata.semantic_key,display_id:`${parent.metadata.display_id}.E${Math.max(0,...directSemanticCases)+1}`,source_node_ids:parent.metadata.source_node_ids||[],trigger:input.trigger||'A newly discovered implementation or runtime condition occurs.',expected_behavior:input.expected_behavior||'The feature remains safe and reports a recoverable outcome.',validation_scenario:input.validation_scenario||'Exercise the discovered condition with a repeatable regression scenario.'}:{};
    const node=this.store.insertNode({project_id:input.project_id,type:'edge_case',title:input.title,description:input.description||'',origin:input.origin||'model_discovery',implemented:false,implementation_state:'not_implemented',verification_state:'unverified',disposition:input.disposition||'required',parent_id:parent.id,metadata:{category:input.category||null,severity:input.severity||'medium',reason:input.reason||'',discovered_by:input.actor||'model',...semanticMetadata}});
    this.store.insertEdge({project_id:input.project_id,source_id:parent.id,target_id:node.id,type:'has_edge_case',origin:input.origin||'model_discovery'}); const gv=this.store.bumpGraphVersion(input.project_id);
    this.store.event({project_id:input.project_id,kind:'edge_case.created',actor:input.actor||'model',entity_id:node.id,data:{parent_feature_id:parent.id,title:node.title}});
    return {...node,created:true,graph_version:gv};
  }

  updateSemanticEdgeCase(input){const project=this.store.assertGraphVersion(input.project_id,input.expected_graph_version);const node=this.store.getNode(input.node_id);if(!node||node.project_id!==project.id||node.type!=='edge_case'||node.metadata?.layer!=='semantic'||node.status!=='active')throw toolError('Semantic edge case not found','SEMANTIC_EDGE_CASE_NOT_FOUND');if(input.expected_node_version!=null&&node.version!==input.expected_node_version)throw toolError('Node version conflict','NODE_VERSION_CONFLICT',{current_node_version:node.version});const title=String(input.title??node.title).trim();if(!title)throw toolError('Edge case title is required','INVALID_ARGUMENT');const patch={title,description:String(input.description??node.description),metadata:{edge_case_override:true,trigger:String(input.trigger??node.metadata.trigger??''),expected_behavior:String(input.expected_behavior??node.metadata.expected_behavior??''),validation_scenario:String(input.validation_scenario??node.metadata.validation_scenario??''),severity:String(input.severity??node.metadata.severity??'medium')}};const updated=this.store.updateNode(node.id,patch,input.expected_node_version??null);this.store.event({project_id:project.id,kind:'semantic.edge_case_updated',actor:input.actor||'user',entity_id:node.id,data:{display_id:node.metadata.display_id}});return updated;}
  deleteSemanticEdgeCase(input){const project=this.store.assertGraphVersion(input.project_id,input.expected_graph_version);const node=this.store.getNode(input.node_id);if(!node||node.project_id!==project.id||node.type!=='edge_case'||node.metadata?.layer!=='semantic'||node.status!=='active')throw toolError('Semantic edge case not found','SEMANTIC_EDGE_CASE_NOT_FOUND');if(input.expected_node_version!=null&&node.version!==input.expected_node_version)throw toolError('Node version conflict','NODE_VERSION_CONFLICT',{current_node_version:node.version});if(input.confirm_display_id!==node.metadata.display_id)throw toolError(`Confirm deletion with ${node.metadata.display_id}`,'CONFIRMATION_REQUIRED');const updated=this.store.updateNode(node.id,{status:'deleted',verification_state:'stale',verified_at:null,last_invalidated_at:nowIso()},input.expected_node_version??null);this.store.event({project_id:project.id,kind:'semantic.edge_case_deleted',actor:input.actor||'user',entity_id:node.id,data:{display_id:node.metadata.display_id}});return {project_id:project.id,node_id:node.id,display_id:node.metadata.display_id,status:updated.status,graph_version:this.store.getProject(project.id).graph_version};}
  deleteProject(input){const project=this.store.requireProject(input.project_id);if(input.confirm_title!==project.title)throw toolError(`Confirm deletion with the exact project title: ${project.title}`,'CONFIRMATION_REQUIRED');if(this.activity.sessions.has(project.id))this.activity.enable({project_id:project.id,enabled:false});this.store.deleteProject(project.id);return {project_id:project.id,title:project.title,deleted:true};}

  setNodeImplementationPlan(input){const project=this.store.requireProject(input.project_id);const node=this.store.getNode(input.node_id);if(!node||node.project_id!==project.id)throw toolError('Node not found','NODE_NOT_FOUND');if(!['feature','edge_case'].includes(node.type))throw toolError('Implementation plans can only be attached to features and edge cases','INVALID_NODE_TYPE');const markdown=String(input.markdown??'');if(Buffer.byteLength(markdown,'utf8')>2*1024*1024)throw toolError('Implementation plan exceeds 2 MiB','DOCUMENT_TOO_LARGE');const fileName=String(input.file_name||`${node.metadata?.display_id||node.id}-implementation-plan.md`).trim();if(!fileName.toLowerCase().endsWith('.md'))throw toolError('Implementation plan file_name must end in .md','INVALID_ARGUMENT');const previousDocument=this.store.getNodeDocument(node.id);const document=this.store.upsertNodeDocument({project_id:project.id,node_id:node.id,kind:'implementation_plan',file_name:fileName,markdown,sha256:sha256(markdown),expected_version:input.expected_document_version,actor:input.actor||'user'});if(previousDocument?.markdown!==markdown&&node.implemented)this.store.updateNode(node.id,{verification_state:'stale',verified_at:null,last_invalidated_at:nowIso()});this.store.event({project_id:project.id,kind:'node.implementation_plan_saved',actor:input.actor||'user',entity_id:node.id,data:{document_id:document.id,file_name:fileName,sha256:document.sha256,version:document.version}});this.activity.emit(project.id,[node.id],'plan_update',input.actor||'mcp');return document;}
  getNodeImplementationPlan(input){const node=this.store.getNode(input.node_id);if(!node||node.project_id!==input.project_id)throw toolError('Node not found','NODE_NOT_FOUND');this.activity.emit(input.project_id,[node.id],'read','mcp');return this.store.getNodeDocument(node.id,'implementation_plan')||{project_id:input.project_id,node_id:node.id,kind:'implementation_plan',file_name:`${node.metadata?.display_id||node.id}-implementation-plan.md`,markdown:'',sha256:sha256(''),version:0,created_at:null,updated_at:null};}
  appendNodeImplementationPlan(input){const current=this.getNodeImplementationPlan(input);const addition=String(input.markdown||'').trim();if(!addition)throw toolError('Markdown to append is required','INVALID_ARGUMENT');return this.setNodeImplementationPlan({...input,file_name:input.file_name||current.file_name,markdown:[current.markdown.trim(),addition].filter(Boolean).join('\n\n'),expected_document_version:input.expected_document_version??current.version});}
  deleteNodeImplementationPlan(input){const node=this.store.getNode(input.node_id);if(!node||node.project_id!==input.project_id||!['feature','edge_case'].includes(node.type))throw toolError('Node not found','NODE_NOT_FOUND');const current=this.store.getNodeDocument(node.id);if(!current)return {project_id:input.project_id,node_id:node.id,deleted:false};if(input.confirm_file_name!==current.file_name)throw toolError(`Confirm deletion with ${current.file_name}`,'CONFIRMATION_REQUIRED');const deleted=this.store.deleteNodeDocument(node.id,input.expected_document_version);if(node.implemented)this.store.updateNode(node.id,{verification_state:'stale',verified_at:null,last_invalidated_at:nowIso()});this.store.event({project_id:input.project_id,kind:'node.implementation_plan_deleted',actor:input.actor||'user',entity_id:node.id,data:{file_name:current.file_name}});this.activity.emit(input.project_id,[node.id],'plan_update',input.actor||'mcp');return {project_id:input.project_id,node_id:node.id,deleted:true,file_name:deleted.file_name};}
  getImplementationPlanCoverage(input){this.store.requireProject(input.project_id);const nodes=this.store.listNodes(input.project_id).filter(node=>node.status==='active'&&['feature','edge_case'].includes(node.type)&&(input.include_source||node.metadata?.layer==='semantic')&&!node.metadata?.semantic_root);const collator=new Intl.Collator('en',{numeric:true});const items=nodes.map(node=>{const plan=this.store.getNodeDocument(node.id),hasPlan=!!plan?.markdown?.trim();return {node_id:node.id,type:node.type,display_id:node.metadata?.display_id||null,title:node.title,has_plan:hasPlan,plan_status:hasPlan?'written':'missing',file_name:plan?.file_name||`${node.metadata?.display_id||node.id}-implementation-plan.md`,document_version:plan?.version||0};}).sort((a,b)=>collator.compare(a.display_id||a.title,b.display_id||b.title));return {project_id:input.project_id,total:items.length,with_plan:items.filter(item=>item.has_plan).length,missing_plan:items.filter(item=>!item.has_plan).length,features_with_plan:items.filter(item=>item.type==='feature'&&item.has_plan).length,features_missing_plan:items.filter(item=>item.type==='feature'&&!item.has_plan).length,edge_cases_with_plan:items.filter(item=>item.type==='edge_case'&&item.has_plan).length,edge_cases_missing_plan:items.filter(item=>item.type==='edge_case'&&!item.has_plan).length,items:input.missing_only?items.filter(item=>!item.has_plan):items};}
  getNextMissingPlans(input){return this.planBatches.nextMissing(input);}
  stagePlanBatch(input){return this.planBatches.stage(input);}
  getPlanBatch(input){return this.planBatches.get(input);}
  applyPlanBatch(input){return this.planBatches.apply(input);}
  exportProjectSnapshot(input){return this.snapshots.export(input);}
  restoreProjectSnapshot(input){return this.snapshots.restore(input);}

  runCompactProgram(input){
    const project=this.store.requireProject(input.project_id),program=String(input.program||'overview'),limit=Math.max(1,Math.min(10,Number(input.limit)||5));
    const nodeSummary=node=>({node_id:node.id,display_id:node.metadata?.display_id||null,type:node.type,title:node.title,priority:node.metadata?.priority||null,implementation_state:node.implementation_state,verification_state:node.verification_state,version:node.version,has_plan:!!this.store.getNodeDocument(node.id)?.markdown?.trim()});
    if(program==='overview'){const progress=this.workspace.progress({project_id:project.id}),coverage=this.getImplementationPlanCoverage({project_id:project.id});return {program,project:{id:project.id,title:project.title,graph_version:project.graph_version},counts:{features:progress.features_total,roots:progress.root_features,subfeatures:progress.subfeatures,edge_cases:progress.edge_cases_total,combined:progress.combined_total},completion:progress.counts,plans:{written:coverage.with_plan,missing:coverage.missing_plan},next:['feature','next_work','missing_plans','search']};}
    if(program==='feature'){if(!input.reference)throw toolError('reference is required for the feature program','INVALID_ARGUMENT');const resolved=this.semantic.resolveReference(project.id,input.reference),feature=nodeSummary(resolved.feature);return {program,project_id:project.id,feature,descendants:resolved.descendants.slice(0,limit).map(nodeSummary),edge_cases:resolved.edge_cases.slice(0,limit).map(nodeSummary),truncated:{descendants:resolved.descendants.length>limit,edge_cases:resolved.edge_cases.length>limit}};}
    if(program==='next_work'){const frontier=this.getFrontier({project_id:project.id,limit});return {program,project_id:project.id,mode:frontier.mode,items:frontier.frontier.map(node=>({...nodeSummary(node),dependency_ready:node.progress?.dependency_ready,blocked:node.progress?.blocked,recursive_edge_cases:node.progress?.recursive_edge_cases}))};}
    if(program==='missing_plans'){const page=this.getNextMissingPlans({project_id:project.id,limit,cursor:input.cursor});return {program,project_id:project.id,graph_version:page.graph_version,missing_total:page.missing_total,next_cursor:page.next_cursor,items:page.items.map(item=>({node_id:item.node_id,display_id:item.display_id,type:item.type,title:item.title,priority:item.priority,file_name:item.file_name,document_version:item.document_version}))};}
    if(program==='search'){if(!String(input.query||'').trim())throw toolError('query is required for the search program','INVALID_ARGUMENT');return {program,project_id:project.id,query:input.query,items:this.search({project_id:project.id,query:input.query,limit}).map(nodeSummary)};}
    throw toolError(`Unknown compact program: ${program}`,'INVALID_ARGUMENT');
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

  validateProjectIntegrity(input) {
    const project=this.store.requireProject(input.project_id),nodes=this.store.listNodes(project.id),active=nodes.filter(n=>n.status==='active'),byId=new Map(nodes.map(n=>[n.id,n])),activeIds=new Set(active.map(n=>n.id)),edges=this.store.listEdges(project.id),issues=[];
    const add=(severity,code,message,details={})=>issues.push({severity,code,message,...details});
    const duplicate=(field,code)=>{const seen=new Map();for(const node of active.filter(n=>n.metadata?.layer==='semantic')){const value=node.metadata?.[field];if(!value)continue;const key=String(value).toLowerCase();if(seen.has(key))add('error',code,`Duplicate semantic ${field}: ${value}`,{node_ids:[seen.get(key),node.id],value});else seen.set(key,node.id);}};
    duplicate('semantic_key','duplicate_semantic_key');duplicate('display_id','duplicate_display_id');
    for(const node of active){
      if(node.parent_id){const parent=byId.get(node.parent_id);if(!parent)add('error','missing_parent','Active node references a missing parent.',{node_id:node.id,parent_id:node.parent_id});else if(parent.project_id!==project.id)add('error','cross_project_parent','Node parent belongs to another project.',{node_id:node.id,parent_id:node.parent_id});else if(parent.status!=='active')add('warning','inactive_parent','Active node has an inactive parent.',{node_id:node.id,parent_id:node.parent_id});}
      if(node.metadata?.layer!=='semantic'||node.metadata?.semantic_root)continue;
      const displayId=node.metadata?.display_id||null;
      if(['feature','edge_case'].includes(node.type)&&!node.metadata?.semantic_key)add('error','missing_semantic_key','Semantic node has no stable semantic key.',{node_id:node.id,display_id:displayId});
      if(['feature','edge_case'].includes(node.type)&&!displayId)add('warning','missing_display_id','Semantic node has no human-readable F/E-number.',{node_id:node.id});
      if(node.type==='feature'){
        if(!node.metadata?.priority)add('warning','missing_importance','Semantic feature has no importance level.',{node_id:node.id,display_id:displayId});
        if(!node.metadata?.importance_rationale)add('warning','missing_importance_rationale','Semantic feature importance has no rationale.',{node_id:node.id,display_id:displayId});
        if(!node.metadata?.proposed_gap&&!(Array.isArray(node.metadata?.source_node_ids)&&node.metadata.source_node_ids.length))add('warning','uncited_semantic_feature','Semantic feature has no lexical source evidence.',{node_id:node.id,display_id:displayId});
        if(!(Array.isArray(node.metadata?.acceptance_criteria)&&node.metadata.acceptance_criteria.some(item=>String(item).trim())))add('warning','missing_acceptance_criteria','Semantic feature has no acceptance criteria.',{node_id:node.id,display_id:displayId});
      }
      if(node.type==='edge_case'){
        const parent=byId.get(node.parent_id);if(!parent||parent.status!=='active'||parent.type!=='feature')add('error','orphan_edge_case','Semantic edge case has no active feature parent.',{node_id:node.id,display_id:displayId,parent_id:node.parent_id||null});
        for(const field of ['trigger','expected_behavior','validation_scenario'])if(!String(field==='expected_behavior'?node.metadata?.expected_behavior||node.description:node.metadata?.[field]||'').trim())add('warning',`missing_edge_case_${field}`,`Semantic edge case is missing ${field.replaceAll('_',' ')}.`,{node_id:node.id,display_id:displayId});
      }
      for(const sourceId of Array.isArray(node.metadata?.source_node_ids)?node.metadata.source_node_ids:[]){const source=byId.get(sourceId);if(!source)add('error','missing_source_evidence','Semantic node references missing source evidence.',{node_id:node.id,display_id:displayId,source_node_id:sourceId});else if(source.metadata?.layer!=='source')add('warning','non_source_evidence','Semantic source reference does not point to the lexical source layer.',{node_id:node.id,display_id:displayId,source_node_id:sourceId});}
    }
    for(const edge of edges){const source=byId.get(edge.source_id),target=byId.get(edge.target_id);if(!source||!target)add('error','dangling_edge','Edge endpoint is missing from the project.',{edge_id:edge.id,source_id:edge.source_id,target_id:edge.target_id});else{if(source.project_id!==project.id||target.project_id!==project.id)add('error','cross_project_edge','Edge connects nodes from different projects.',{edge_id:edge.id,source_id:edge.source_id,target_id:edge.target_id});if(source.status!=='active'||target.status!=='active')add('warning','inactive_edge_endpoint','Edge references an inactive node.',{edge_id:edge.id,source_id:edge.source_id,target_id:edge.target_id});if(edge.type==='has_edge_case'&&(target.type!=='edge_case'||target.parent_id!==source.id))add('error','invalid_edge_case_link','has_edge_case must connect a feature to its own edge case.',{edge_id:edge.id,source_id:edge.source_id,target_id:edge.target_id});if(edge.type==='depends_on'&&(source.type!=='feature'||target.type!=='feature'))add('warning','non_feature_dependency','depends_on should connect implementation features.',{edge_id:edge.id,source_id:edge.source_id,target_id:edge.target_id});}if(edge.type==='depends_on'&&edge.source_id===edge.target_id)add('error','self_dependency','Feature depends on itself.',{edge_id:edge.id,node_id:edge.source_id});}
    const dependencyEdges=edges.filter(e=>e.type==='depends_on'&&activeIds.has(e.source_id)&&activeIds.has(e.target_id)),next=new Map();for(const edge of dependencyEdges){if(!next.has(edge.source_id))next.set(edge.source_id,[]);next.get(edge.source_id).push(edge.target_id);}const visiting=new Set(),visited=new Set(),reported=new Set();
    const walk=(id,trail=[])=>{if(visiting.has(id)){const start=trail.indexOf(id),cycle=[...trail.slice(start),id],key=[...new Set(cycle)].sort().join('|');if(!reported.has(key)){reported.add(key);add('error','dependency_cycle','Dependency graph contains a cycle.',{node_ids:cycle});}return;}if(visited.has(id))return;visiting.add(id);for(const target of next.get(id)||[])walk(target,[...trail,id]);visiting.delete(id);visited.add(id);};for(const id of next.keys())walk(id);
    const documents=this.store.db.prepare('SELECT id,project_id,node_id,file_name FROM node_documents WHERE project_id=?').all(project.id);for(const doc of documents){const node=byId.get(doc.node_id);if(!node)add('error','orphan_plan','Markdown plan references a missing node.',{document_id:doc.id,node_id:doc.node_id});else if(node.project_id!==doc.project_id)add('error','cross_project_plan','Markdown plan and node belong to different projects.',{document_id:doc.id,node_id:doc.node_id});if(!String(doc.file_name||'').toLowerCase().endsWith('.md'))add('warning','invalid_plan_filename','Implementation plan filename does not end in .md.',{document_id:doc.id,node_id:doc.node_id,file_name:doc.file_name});}
    const fileRows=this.store.db.prepare("SELECT id,data FROM workspace_records WHERE project_id=? AND kind='files'").all(project.id);for(const row of fileRows){let data;try{data=JSON.parse(row.data);}catch{add('error','invalid_file_mapping','File mapping is not valid JSON.',{record_id:row.id});continue;}if(!data||typeof data!=='object'||!Array.isArray(data.paths))add('error','invalid_file_mapping','File mapping must contain a paths array.',{record_id:row.id});if(data.project_id&&data.project_id!==project.id)add('error','cross_project_file_mapping','File mapping declares a different project.',{record_id:row.id,mapped_project_id:data.project_id});if(!byId.has(data.node_id))add('error','orphan_file_mapping','File mapping references a missing node.',{record_id:row.id,node_id:data.node_id||null});for(const mapped of Array.isArray(data.paths)?data.paths:[]){if(typeof mapped!=='string'||!mapped||path.isAbsolute(mapped)||String(mapped).split(/[\\/]+/).includes('..'))add('error','unsafe_file_mapping','Mapped path must be a non-empty project-relative path inside the workspace.',{record_id:row.id,path:mapped});}}
    const runs=this.store.listSemanticRuns(project.id);for(const run of runs){if(run.source_import_id){const source=this.store.getImportSession(run.source_import_id);if(!source||source.project_id!==project.id)add('error','missing_semantic_source','Semantic run references a missing or foreign plan import.',{run_id:run.id,source_import_id:run.source_import_id});}if(run.status==='stale')add('warning','stale_semantic_run','Semantic proposal was invalidated by a newer source import.',{run_id:run.id});}
    const totals={errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length},limit=Math.max(1,Math.min(500,Number(input.limit)||100));return {project_id:project.id,graph_version:project.graph_version,ok:totals.errors===0,checked:{nodes:nodes.length,active_nodes:active.length,edges:edges.length,documents:documents.length,file_mappings:fileRows.length,semantic_runs:runs.length},counts:{...totals,total:issues.length},truncated:issues.length>limit,issues:input.include_details===false?[]:issues.slice(0,limit),generated_at:nowIso()};
  }

  resolveSelectableNode(input){
    const project=this.store.requireProject(input.project_id),nodes=this.store.listNodes(project.id).filter(node=>node.status==='active'&&['feature','edge_case'].includes(node.type));
    if(input.node_id){const node=nodes.find(item=>item.id===input.node_id);if(!node)throw toolError('Active feature or edge case not found','NODE_NOT_FOUND');return node;}
    const raw=String(input.reference||'').trim();if(!raw)throw toolError('reference or node_id is required','INVALID_ARGUMENT');const display=/^\d/.test(raw)?`F${raw}`:raw;
    const matches=nodes.filter(node=>node.metadata?.display_id?.toLowerCase()===display.toLowerCase()||node.metadata?.semantic_key===raw||normalizeTitle(node.title)===normalizeTitle(raw));
    if(matches.length!==1)throw toolError(matches.length?'Node reference is ambiguous':`Node reference not found: ${raw}`,matches.length?'AMBIGUOUS_REFERENCE':'NODE_NOT_FOUND');return matches[0];
  }

  selectNodeCascade(input){
    const project=this.store.requireProject(input.project_id),selected=this.resolveSelectableNode(input),cascadeDepth=Math.max(0,Math.min(5,Number(input.cascade_depth)||0)),maxHops=cascadeDepth+1,maxNodes=Math.max(2,Math.min(250,Number(input.max_nodes)||100));
    const active=new Map(this.store.listNodes(project.id).filter(node=>node.status==='active').map(node=>[node.id,node])),edges=this.store.listEdges(project.id).filter(edge=>active.has(edge.source_id)&&active.has(edge.target_id)),adjacent=new Map();
    for(const edge of edges){if(!adjacent.has(edge.source_id))adjacent.set(edge.source_id,[]);if(!adjacent.has(edge.target_id))adjacent.set(edge.target_id,[]);adjacent.get(edge.source_id).push({id:edge.target_id,edge});adjacent.get(edge.target_id).push({id:edge.source_id,edge});}
    const hops=new Map([[selected.id,0]]),queue=[selected.id];let truncated=false;
    while(queue.length){const id=queue.shift(),hop=hops.get(id);if(hop>=maxHops)continue;for(const next of adjacent.get(id)||[]){if(hops.has(next.id))continue;if(hops.size>=maxNodes){truncated=true;continue;}hops.set(next.id,hop+1);queue.push(next.id);}}
    const priorityOf=node=>{const seen=new Set();let current=node;while(current&&!seen.has(current.id)){seen.add(current.id);if(current.metadata?.priority)return current.metadata.priority;current=active.get(current.parent_id);}return null;},slim=node=>({node_id:node.id,display_id:node.metadata?.display_id||null,type:node.type,title:node.title,priority:priorityOf(node),implementation_state:node.implementation_state,verification_state:node.verification_state,has_plan:!!this.store.getNodeDocument(node.id)?.markdown?.trim(),hop:hops.get(node.id)}),nodes=[...hops].map(([id])=>active.get(id)).sort((a,b)=>hops.get(a.id)-hops.get(b.id)||String(a.metadata?.display_id||a.title).localeCompare(String(b.metadata?.display_id||b.title),'en',{numeric:true}));
    const included=new Set(hops.keys()),connections=edges.filter(edge=>included.has(edge.source_id)&&included.has(edge.target_id)).map(edge=>({source_id:edge.source_id,target_id:edge.target_id,type:edge.type}));
    return {project_id:project.id,graph_version:project.graph_version,selected:slim(selected),cascade_depth:cascadeDepth,max_hops:maxHops,node_count:nodes.length,connection_count:connections.length,truncated,nodes:nodes.map(slim),connections};
  }
  selectNodeNeighborhood(input){return this.selectNodeCascade({...input,cascade_depth:0});}

  search(input) {
    const q=normalizeTitle(input.query); const terms=q.split(' ').filter(Boolean); const rows=this.store.listNodes(input.project_id); const scored=rows.map(n=>{const t=normalizeTitle(`${n.title} ${n.description}`);let s=0;for(const x of terms)if(t.includes(x))s++;return {n,s};}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.n.title.localeCompare(b.n.title)).slice(0,input.limit||50); return scored.map(x=>({...x.n,score:x.s}));
  }
  findGaps(input){const a=this.auditImplementationStatus({project_id:input.project_id});return {project_id:input.project_id,graph_version:a.graph_version,gaps:[...a.not_implemented,...a.stale,...a.unverified_implemented].filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i)};}
  getFrontier(input){const progress=this.workspace.remaining(input);const features=new Map(this.semantic.listFeatures(input.project_id).features.map(n=>[n.id,n]));return {project_id:input.project_id,mode:progress.mode,frontier:progress.items.filter(n=>n.dependency_ready&&!n.blocked).slice(0,input.limit||25).map(p=>({...features.get(p.id)||this.store.getNode(p.id),progress:p}))};}

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
  stageSemanticFeatureSet(input){const staged=this.semantic.stage(input);if(input.auto_commit===false)return {...staged,auto_committed:false};const committed=this.semantic.commit({project_id:input.project_id,run_id:staged.run_id,expected_graph_version:this.store.requireProject(input.project_id).graph_version,actor:input.actor||'codex'});const listed=this.semantic.listFeatures(input.project_id);return {...committed,auto_committed:true,counts:listed.counts,features:listed.features};}
  commitSemanticFeatureSet(input){return this.semantic.commit(input);}
  getSemanticFeatureList(input){const list=this.semantic.listFeatures(input.project_id),progress=this.workspace.progress(input),byId=new Map(progress.items.map(p=>[p.id,p]));return {...list,progress_counts:progress.counts,features:list.features.map(n=>({...n,progress:byId.get(n.id),direct_edge_case_count:byId.get(n.id)?.direct_edge_cases??0,recursive_edge_case_count:byId.get(n.id)?.recursive_edge_cases??0,count_label:`${n.metadata.display_id} → ${byId.get(n.id)?.recursive_edge_cases??0} EC`,importance_review_required:!n.metadata.importance_rationale}))};}
  getSemanticEdgeCases(input){return this.semantic.listEdgeCases(input.project_id,input);}
  getSemanticDiff(input){return this.semantic.getDiff(input.project_id,input.run_id);}
  resolveSemanticFeatureReference(input){return this.semantic.resolveReference(input.project_id,input.reference);}
  reindexSemanticFeatures(input){return this.semantic.reindex(input.project_id,input.actor);}
  updateSemanticFeature(input){return this.semantic.updateFeature(input);}

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
    context.project_memory=this.workspace.memory({project_id:p.id,budget_tokens:input.memory_budget_tokens||800},'context');return {...context,context_hash:sha256(JSON.stringify(context))};
  }
}
