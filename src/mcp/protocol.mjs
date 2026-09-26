import { buildRegistry, publicTools, validateArgs } from './registry.mjs';

export const MODERN_PROTOCOL='2026-07-28';
export const LEGACY_PROTOCOL='2025-11-25';
export const LEGACY_PROTOCOLS=['2025-11-25','2025-06-18','2025-03-26','2024-11-05','2024-10-07'];
export const SERVER_INFO={name:'living-solution-graph',version:'6.3.0'};
const LSG_INSTRUCTIONS='Living Solution Graph is callable through tools. Treat “use lsg”, “@lsg”, and “run lsg” as requests to use them. When graphing a master plan, first call solution.start_plan_graph_workflow with its existing Markdown filepath; do not create a generic project or author plans first. If the plan path is missing, ask; if workspace resolution is ambiguous, require a specific plan path or project_id. Codex authors evidence-linked semantic features and edge cases, then calls solution.stage_semantic_feature_set with auto_commit=true by default. Only an explicit review-only request may set auto_commit=false. After default publication, confirm solution.get_semantic_feature_list and solution.get_frontier; report invalid/empty proposals or resumable workflow failures as incomplete. Use solution.run_program for compact queries and the status-filtered missing_plans program to find nodes without Markdown implementation plans.';
const SERVER_META_KEY='io.modelcontextprotocol/serverInfo';
const PROTOCOL_META_KEY='io.modelcontextprotocol/protocolVersion';
const CAPS_META_KEY='io.modelcontextprotocol/clientCapabilities';

function resultEnvelope(id,result,modern=false){
  const out={...result};
  if(modern) {
    out.resultType=out.resultType||'complete';
    out._meta={...(out._meta||{}),[SERVER_META_KEY]:SERVER_INFO};
  }
  return {jsonrpc:'2.0',id,result:out};
}
function errorEnvelope(id,code,message,data){return {jsonrpc:'2.0',id:id??null,error:{code,message,...(data!==undefined?{data}:{})}};}
function isRequest(msg){return msg&&msg.jsonrpc==='2.0'&&typeof msg.method==='string';}
function modernMeta(msg){return msg?.params?._meta||{};}
function modernCache(result,scope='private',ttlMs=30000){return {...result,ttlMs,cacheScope:scope};}
function toStructured(v){if(v&&typeof v==='object'&&!Array.isArray(v))return v;return {result:v};}

const promptDefs=[
  {name:'bootstrap_markdown_plan',description:'Bootstrap the first Living Solution Graph baseline from a normal Markdown plan.',arguments:[{name:'project_id',required:true},{name:'plan_file_or_uri',required:true},{name:'mode',required:false}]},
  {name:'continue_project',description:'Continue a project by reading the completion frontier, implementing bounded work, testing it, recording evidence, and updating graph state.',arguments:[{name:'project_id',required:true},{name:'user_id',required:false}]},
  {name:'implement_next_gap',description:'Select and implement the next bounded incomplete graph node; do not claim completion without updating the implementation switch and evidence.',arguments:[{name:'project_id',required:true}]},
  {name:'audit_project',description:'Audit the whole project graph for incomplete, stale, unverified, contradictory, or missing coverage.',arguments:[{name:'project_id',required:true}]},
  {name:'apply_domain_starter_coverage',description:'Detect and apply domain-aware starter coverage before generic edge-case expansion.',arguments:[{name:'project_id',required:true},{name:'import_session_id',required:false}]},
  {name:'provide_semantic_feature_list',description:'Have Codex start with a file-keyed plan workflow, author and auto-publish a numbered semantic backlog, then verify the live list and frontier.',arguments:[{name:'plan_file_path',required:false},{name:'working_directory',required:false},{name:'project_id',required:false},{name:'max_features',required:false}]}
];

export class McpProtocol {
  constructor(service){this.service=service;this.registry=buildRegistry(service);this.tools=new Map(this.registry.map(t=>[t.name,t]));}

  validateModernRequest(msg){
    const meta=modernMeta(msg); const pv=meta[PROTOCOL_META_KEY]; const caps=meta[CAPS_META_KEY]; const ci=meta['io.modelcontextprotocol/clientInfo'];
    if(pv==null) return {code:-32602,message:`Missing or invalid ${PROTOCOL_META_KEY}`};
    if(pv!==MODERN_PROTOCOL) return {code:-32022,message:`Unsupported protocol version: ${pv}`,data:{supportedVersions:[MODERN_PROTOCOL]}};
    if(caps==null||typeof caps!=='object'||Array.isArray(caps)) return {code:-32602,message:`Missing or invalid ${CAPS_META_KEY}`};
    if(ci!=null && (typeof ci!=='object'||Array.isArray(ci)||typeof ci.name!=='string'||typeof ci.version!=='string')) return {code:-32602,message:'Invalid io.modelcontextprotocol/clientInfo'};
    return null;
  }

  async handle(msg,{era='auto'}={}){
    if(!isRequest(msg)) return errorEnvelope(msg?.id,-32600,'Invalid Request');
    const id=msg.id; const method=msg.method;
    const modern=era==='modern'||(era==='auto'&&(method==='server/discover'||modernMeta(msg)[PROTOCOL_META_KEY]===MODERN_PROTOCOL));
    if(modern){const err=this.validateModernRequest(msg);if(err)return errorEnvelope(id,err.code,err.message,err.data);}
    try{
      if(method==='server/discover'){
        return resultEnvelope(id,modernCache({supportedVersions:[MODERN_PROTOCOL],capabilities:{tools:{},resources:{},prompts:{}},instructions:LSG_INSTRUCTIONS},'public',300000),true);
      }
      if(method==='initialize'){
        const requested=msg.params?.protocolVersion;const selected=LEGACY_PROTOCOLS.includes(requested)?requested:LEGACY_PROTOCOL;
        return resultEnvelope(id,{protocolVersion:selected,capabilities:{tools:{listChanged:false},resources:{subscribe:false,listChanged:false},prompts:{listChanged:false}},serverInfo:SERVER_INFO,instructions:LSG_INSTRUCTIONS},false);
      }
      if(method==='notifications/initialized'||method==='notifications/cancelled') return null;
      if(method==='ping') return resultEnvelope(id,{},modern);
      if(method==='tools/list') return resultEnvelope(id,modern?modernCache({tools:publicTools(this.registry)},'public',300000):{tools:publicTools(this.registry)},modern);
      if(method==='tools/call') return await this.callTool(id,msg.params||{},modern);
      if(method==='resources/list') return resultEnvelope(id,modern?modernCache({resources:this.listStaticResources()},'public',300000):{resources:this.listStaticResources()},modern);
      if(method==='resources/templates/list') return resultEnvelope(id,modern?modernCache({resourceTemplates:this.listResourceTemplates()},'public',300000):{resourceTemplates:this.listResourceTemplates()},modern);
      if(method==='resources/read') return await this.readResource(id,msg.params||{},modern);
      if(method==='prompts/list') return resultEnvelope(id,modern?modernCache({prompts:promptDefs},'public',300000):{prompts:promptDefs},modern);
      if(method==='prompts/get') return this.getPrompt(id,msg.params||{},modern);
      return errorEnvelope(id,-32601,`Method not found: ${method}`);
    }catch(e){return errorEnvelope(id,-32603,e?.message||'Internal error',{code:e?.code||'INTERNAL_ERROR'});}
  }

  async callTool(id,params,modern){
    const t=this.tools.get(params.name);
    if(!t) return resultEnvelope(id,{content:[{type:'text',text:`Unknown tool: ${params.name}`}],isError:true},modern);
    const validation=validateArgs(t.inputSchema,params.arguments??{});
    if(validation) return resultEnvelope(id,{content:[{type:'text',text:`Input validation error: ${validation}`}],isError:true},modern);
    try{
      const args=params.arguments??{};const out=await t.handler(args);const target=args.node_id||out?.feature?.id||out?.node?.id;if(target&&args.project_id)this.service.activity.emit(args.project_id,[target],params.name.includes('get_')?'read':'update',args.actor||'mcp'); const structured=toStructured(out);
      return resultEnvelope(id,{content:[{type:'text',text:JSON.stringify(out,null,params.name==='solution.run_program'?0:2)}],structuredContent:structured},modern);
    }catch(e){
      const detail={error:e?.message||String(e),code:e?.code||'LSG_ERROR',...(e?.current_graph_version!=null?{current_graph_version:e.current_graph_version}:{}),...(e?.current_node_version!=null?{current_node_version:e.current_node_version}:{})};
      return resultEnvelope(id,{content:[{type:'text',text:JSON.stringify(detail,null,2)}],structuredContent:detail,isError:true},modern);
    }
  }

  listStaticResources(){return [
    {uri:'solution://starter-packs',name:'Domain starter packs',description:'Versioned domain-aware baseline coverage catalog.',mimeType:'application/json'},
    {uri:'solution://server/version',name:'LSG server version',description:'Server build and protocol support.',mimeType:'application/json'}
  ];}
  listResourceTemplates(){return [
    {uriTemplate:'solution://projects/{project_id}/implementation-status',name:'Project implementation audit',description:'Full implemented/not-implemented/verified/stale inventory.',mimeType:'application/json'},
    {uriTemplate:'solution://projects/{project_id}/graph-view',name:'Project connected graph',description:'Feature/edge-case graph data for visualization.',mimeType:'application/json'},
    {uriTemplate:'solution://projects/{project_id}/edge-cases',name:'Project edge cases',description:'All edge-case nodes.',mimeType:'application/json'},
    {uriTemplate:'solution://nodes/{node_id}/implementation-timeline',name:'Node timeline',description:'Node state plus related audit events.',mimeType:'application/json'},
    {uriTemplate:'solution://projects/{project_id}/plan-imports/{import_session_id}',name:'Plan import',description:'Plan import analysis metadata.',mimeType:'application/json'},
    {uriTemplate:'solution://projects/{project_id}/plan-imports/{import_session_id}/report',name:'Bootstrap report',description:'Bootstrap analysis and graph audit.',mimeType:'application/json'},
    {uriTemplate:'solution://projects/{project_id}/starter-pack-evaluations',name:'Starter coverage evaluations',description:'Domain starter pack evaluation provenance.',mimeType:'application/json'},
    {uriTemplate:'user://users/{user_id}/context',name:'Compressed user context',description:'Token-budgeted durable user memory projection.',mimeType:'application/json'}
  ];}

  async readResource(id,params,modern){
    const uri=String(params.uri||''); let data;
    if(uri==='solution://starter-packs') data=this.service.listStarterPacks();
    else if(uri==='solution://server/version') data={serverInfo:SERVER_INFO,protocols:[MODERN_PROTOCOL,LEGACY_PROTOCOL]};
    else {
      let m;
      if((m=uri.match(/^solution:\/\/projects\/([^/]+)\/implementation-status$/))) data=this.service.auditImplementationStatus({project_id:decodeURIComponent(m[1])});
      else if((m=uri.match(/^solution:\/\/projects\/([^/]+)\/graph-view$/))) data=this.service.getGraphView({project_id:decodeURIComponent(m[1])});
      else if((m=uri.match(/^solution:\/\/projects\/([^/]+)\/edge-cases$/))) data=this.service.getGraphView({project_id:decodeURIComponent(m[1]),include_types:['edge_case']});
      else if((m=uri.match(/^solution:\/\/nodes\/([^/]+)\/implementation-timeline$/))){const node=this.service.store.getNode(decodeURIComponent(m[1]));if(!node)throw new Error('Node not found');data={node,events:this.service.store.listEvents({project_id:node.project_id,limit:500}).filter(e=>e.entity_id===node.id)};}
      else if((m=uri.match(/^solution:\/\/projects\/([^/]+)\/plan-imports\/([^/]+)\/report$/))) data=this.service.getBootstrapReport({project_id:decodeURIComponent(m[1]),import_session_id:decodeURIComponent(m[2])});
      else if((m=uri.match(/^solution:\/\/projects\/([^/]+)\/plan-imports\/([^/]+)$/))) data=this.service.getPlanImport({project_id:decodeURIComponent(m[1]),import_session_id:decodeURIComponent(m[2])});
      else if((m=uri.match(/^solution:\/\/projects\/([^/]+)\/starter-pack-evaluations$/))) data=this.service.getStarterPackEvaluation({project_id:decodeURIComponent(m[1])});
      else if((m=uri.match(/^user:\/\/users\/([^/]+)\/context$/))) data=this.service.memoryContext({user_id:decodeURIComponent(m[1]),budget_tokens:1200});
      else return errorEnvelope(id,-32002,`Resource not found: ${uri}`);
    }
    const body={contents:[{uri,mimeType:'application/json',text:JSON.stringify(data,null,2)}]};
    return resultEnvelope(id,modern?modernCache(body,'private',15000):body,modern);
  }

  getPrompt(id,params,modern){
    const name=params.name;const a=params.arguments||{};let text;
    if(name==='bootstrap_markdown_plan') text=`Bootstrap project ${a.project_id} from ${a.plan_file_or_uri}. First preview the Markdown import, inspect domain starter coverage and blocking findings, then commit only against the expected graph version. Treat source checkboxes as claims, not verification.`;
    else if(name==='continue_project') text=`Continue project ${a.project_id}. Start with solution.run_program program=overview or next_work. Use solution.get_tool_catalog when you need to discover a focused LSG capability without loading every schema. After choosing a feature, call solution.select_node_neighborhood for its directly connected context; use solution.select_node_cascade only when one or more additional neighbor generations are relevant. Implement one bounded gap at a time, run relevant tests, attach evidence, then update implementation and verification state. Add newly discovered edge cases to the graph instead of leaving them in prose.`;
    else if(name==='implement_next_gap') text=`For project ${a.project_id}, claim one task using solution.claim_next_work and load solution.get_work_context. Use solution.select_node_neighborhood for its direct graph context; if broader context is necessary, solution.select_node_cascade with cascade_depth=1 also selects the neighbors' neighbors. Work sequentially; delegate only when explicitly requested. Read mapped files through solution.read_node_file when useful. Submit results with solution.update_work and review with solution.review_work. Never enable activity without the developer requesting it. Inspect dependencies and edge cases, implement end-to-end, test, record evidence, set implemented=true only when the implementation exists, then verify separately.`;
    else if(name==='audit_project') text=`Audit project ${a.project_id}. Start with the read-only solution.validate_project_integrity check, then traverse completion state with solution.audit_implementation_status and solution.find_gaps. Identify structural errors, missing architecture, edge cases, tests, stale nodes and unverified claims. Insert newly discovered edge cases with solution.add_edge_case; never mutate graph state merely to silence an integrity warning.`;
    else if(name==='apply_domain_starter_coverage') text=`For project ${a.project_id}, inspect or detect applicable starter packs, apply missing domain baseline coverage, preserve not-applicable/conditional decisions, then run a graph audit.`;
    else if(name==='provide_semantic_feature_list') text=`You can and must use Living Solution Graph MCP tools when the user says use lsg, @lsg, or run lsg; do not substitute an explanation. The requested master-plan path is ${a.plan_file_path||'<not supplied>'}. If it is missing, ask which existing Markdown plan to graph before creating a project, importing, or writing plans. FIRST call solution.start_plan_graph_workflow with plan_file_path ${a.plan_file_path||'<clarify with the user>'}. It creates/reuses a distinct project for that canonical file, imports and commits the lexical source graph, and returns the semantic evidence brief. The same file reuses its project; different plan files, even within one directory or Git repository, must remain separate projects. Do not resolve by Git root before this call. If it returns status=incomplete, report the failure and use its project_id to resume; do not claim mapping completed. Call solution.prepare_semantic_feature_set only if you need a fresh brief. Author source-linked, bounded, dependency-aware vertical-slice features and edge cases; cite evidence IDs, use parent_key for cascading subfeatures, and label unsupported items proposed_gap. Call solution.stage_semantic_feature_set with auto_commit=true (the default) unless the user explicitly requests review-only. An invalid or empty proposal is incomplete, not success. Verify publication by calling solution.get_semantic_feature_list and solution.get_frontier for the returned project; confirm the frontier is semantic and the list is non-empty before reporting completion. Report feature/edge-case totals and numbered references compactly. For per-node Markdown plan coverage, query solution.get_missing_plans_by_status with status not_implemented, partially_implemented, or implemented; the implemented status includes awaiting verification and fully complete nodes. Page until next_cursor is null. Author plans only if requested; use stable names such as F26.1.E1-implementation-plan.md and stage/review/apply batches with solution.stage_plan_batch and solution.apply_plan_batch. Use solution.run_program program=overview, feature, next_work, missing_plans, or search for compact context. Resolve F-number references before edits. Prompt arguments: working_directory=${a.working_directory||'<not supplied>'}; project_id=${a.project_id||'<derive from plan file>'}; max_features=${a.max_features||25}.`;
    else return errorEnvelope(id,-32602,`Unknown prompt: ${name}`);
    const res={description:promptDefs.find(p=>p.name===name)?.description,messages:[{role:'user',content:{type:'text',text}}]};return resultEnvelope(id,modern?modernCache(res,'private',0):res,modern);
  }
}

export function principalName(msg){
  const p=msg?.params||{}; if(msg?.method==='tools/call'||msg?.method==='prompts/get')return p.name||''; if(msg?.method==='resources/read')return p.uri||''; return '';
}
export function validateModernHeaders(headers,msg){
  if(msg?.id===undefined) return null;
  const method=headers['mcp-method']; const name=headers['mcp-name']; const protocol=headers['mcp-protocol-version'];
  if(!protocol)return {code:-32020,message:'Missing MCP-Protocol-Version header'};
  if(method!==msg.method)return {code:-32020,message:'Mcp-Method header mismatch'};
  const pn=principalName(msg); if(pn && name!==pn)return {code:-32020,message:'Mcp-Name header mismatch'};
  const metaPv=modernMeta(msg)[PROTOCOL_META_KEY]; if(metaPv!==protocol)return {code:-32020,message:'Protocol version body/header mismatch'};
  return null;
}
