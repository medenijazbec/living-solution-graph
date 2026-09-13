import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { MODERN_PROTOCOL, validateModernHeaders, } from '../mcp/protocol.mjs';

import { workspaceTools } from '../mcp/workspace-tools.mjs';
import { validateArgs } from '../mcp/registry.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(here,'../../public');
const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.png':'image/png','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};

function json(res,status,data,extra={}){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),...extra});res.end(body);}
function text(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'content-type':type,'content-length':Buffer.byteLength(body)});res.end(body);}
function headersLower(req){const o={};for(const [k,v] of Object.entries(req.headers))o[k.toLowerCase()]=Array.isArray(v)?v[0]:v;return o;}
function secureEqual(a,b){const A=Buffer.from(String(a)),B=Buffer.from(String(b));return A.length===B.length&&timingSafeEqual(A,B);}

async function readBody(req,max){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>max){const e=new Error('Request body too large');e.status=413;throw e;}chunks.push(c);}const raw=Buffer.concat(chunks).toString('utf8');if(!raw)return {};try{return JSON.parse(raw)}catch{const e=new Error('Invalid JSON');e.status=400;throw e;}}

export function createHttpServer({service,protocol,config,log=console.error}){
  const counters={requests:0,mcp:0,errors:0,started:Date.now()}; const rate=new Map();
  function addSecurity(res){res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','DENY');res.setHeader('referrer-policy','no-referrer');res.setHeader('cache-control','no-store');}
  function checkHostOrigin(req,res){
    const host=req.headers.host||'';if(config.allowedHosts.length&&!config.allowedHosts.includes(host)){json(res,403,{error:'Host not allowed'});return false;}
    const origin=req.headers.origin;if(origin&&config.allowedOrigins.length&&!config.allowedOrigins.includes(origin)){json(res,403,{error:'Origin not allowed'});return false;}return true;
  }
  function checkRate(req,res){const ip=req.socket.remoteAddress||'unknown';const minute=Math.floor(Date.now()/60000);const key=`${ip}:${minute}`;const n=(rate.get(key)||0)+1;rate.set(key,n);if(n>config.rateLimitPerMinute){json(res,429,{error:'Rate limit exceeded'},{'retry-after':'60'});return false;}if(rate.size>5000){for(const k of rate.keys())if(!k.endsWith(`:${minute}`))rate.delete(k);}return true;}
  function authorized(req){if(!config.apiToken)return true;const h=req.headers.authorization||'';return h.startsWith('Bearer ')&&secureEqual(h.slice(7),config.apiToken);}
  function cors(req,res){const origin=req.headers.origin;if(origin&&config.allowedOrigins.includes(origin)){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','authorization,content-type,x-lsg-project-id,x-lsg-user-id,mcp-protocol-version,mcp-method,mcp-name,accept');res.setHeader('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');}}

  async function route(req,res){
    counters.requests++;addSecurity(res);cors(req,res); if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`); const pathname=url.pathname;
    if(pathname==='/healthz')return json(res,200,{ok:true,version:'6.1.0',uptime_seconds:Math.floor((Date.now()-counters.started)/1000)});
    if(pathname==='/readyz')return json(res,200,{ok:true,database:true});
    if(pathname==='/metrics')return text(res,200,`# TYPE lsg_http_requests_total counter\nlsg_http_requests_total ${counters.requests}\n# TYPE lsg_mcp_requests_total counter\nlsg_mcp_requests_total ${counters.mcp}\n# TYPE lsg_http_errors_total counter\nlsg_http_errors_total ${counters.errors}\n`,'text/plain; version=0.0.4');

    if(pathname==='/mcp'){
      counters.mcp++; if(!checkHostOrigin(req,res)||!checkRate(req,res))return;if(!authorized(req))return json(res,401,{error:'Unauthorized'},{'www-authenticate':'Bearer'});
      if(req.method!=='POST')return json(res,405,{error:'MCP endpoint accepts POST only'},{allow:'POST'});
      if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'Content-Type must be application/json'});
      const msg=await readBody(req,config.maxBodyBytes);const hdr=headersLower(req);const bodyProtocol=msg?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];const modern=hdr['mcp-protocol-version']===MODERN_PROTOCOL||bodyProtocol!=null||msg.method==='server/discover';
      if(modern){const he=validateModernHeaders(hdr,msg);if(he)return json(res,400,{jsonrpc:'2.0',id:msg.id??null,error:he});}
      const response=await protocol.handle(msg,{era:modern?'modern':'legacy'});if(msg.id===undefined||response==null){res.writeHead(202);res.end();return;}
      return json(res,200,response,modern?{'mcp-protocol-version':MODERN_PROTOCOL}:{});
    }

    if(pathname.startsWith('/api/')||pathname.startsWith('/v1/')){
      if(!checkHostOrigin(req,res)||!checkRate(req,res))return;if(!authorized(req))return json(res,401,{error:'Unauthorized'},{'www-authenticate':'Bearer'});
    }

    if(pathname==='/api/projects'&&req.method==='GET')return json(res,200,{projects:service.store.listProjects()});
    if(pathname==='/api/projects'&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,201,service.createProject(b));}
    if(pathname==='/api/workspaces/resolve'&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.resolveWorkspaceProject(b));}
    let m;
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/activity\/stream$/))&&req.method==='GET'){
      const projectId=decodeURIComponent(m[1]);service.store.requireProject(projectId);
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive'});res.write(': connected\n\n');
      const send=event=>{if(!res.destroyed)res.write('data: '+JSON.stringify(event)+'\n\n');};
      service.activity.bus.on(projectId,send);const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n');},15000);
      req.on('close',()=>{clearInterval(heartbeat);service.activity.bus.off(projectId,send);});return;
    }
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/workspace\/([\w]+)$/))&&['GET','POST'].includes(req.method)){
      const tool=workspaceTools(service).find(t=>t.name==='solution.'+m[2]);if(!tool)return json(res,404,{error:'Unknown workspace tool'});
      const writes=new Set(['set_importance_scale','set_feature_importance','claim_next_work','update_work','review_work','sync_git_history','set_node_file_links','set_activity_enabled']);
      if(writes.has(m[2])&&req.method!=='POST')return json(res,405,{error:'POST required'});
      const args=req.method==='POST'?await readBody(req,config.maxBodyBytes):Object.fromEntries(url.searchParams);
      args.project_id=decodeURIComponent(m[1]);for(const [key,rule] of Object.entries(tool.inputSchema.properties)){if(rule.type==='integer'&&args[key]!=null)args[key]=Number(args[key]);if(rule.type==='boolean'&&typeof args[key]==='string')args[key]=args[key]==='true';}
      const invalid=validateArgs(tool.inputSchema,args);if(invalid)return json(res,400,{error:invalid});return json(res,200,await tool.handler(args));
    }
    if((m=pathname.match(/^\/api\/projects\/([^/]+)$/))&&req.method==='GET'){const p=service.store.getProject(decodeURIComponent(m[1]));return p?json(res,200,p):json(res,404,{error:'Project not found'});}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)$/))&&req.method==='DELETE'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.deleteProject({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/graph$/))&&req.method==='GET')return json(res,200,service.getGraphView({project_id:decodeURIComponent(m[1])}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/audit$/))&&req.method==='GET')return json(res,200,service.auditImplementationStatus({project_id:decodeURIComponent(m[1])}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/frontier$/))&&req.method==='GET')return json(res,200,service.getFrontier({project_id:decodeURIComponent(m[1]),limit:Number(url.searchParams.get('limit')||25)}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/features$/))&&req.method==='GET')return json(res,200,service.getSemanticFeatureList({project_id:decodeURIComponent(m[1])}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/edge-cases$/))&&req.method==='GET')return json(res,200,service.getSemanticEdgeCases({project_id:decodeURIComponent(m[1]),feature_id:url.searchParams.get('feature_id')||undefined,semantic_key:url.searchParams.get('semantic_key')||undefined}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/edge-cases\/([^/]+)$/))&&req.method==='PATCH'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.updateSemanticEdgeCase({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/edge-cases\/([^/]+)$/))&&req.method==='DELETE'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.deleteSemanticEdgeCase({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/implementation-plan-coverage$/))&&req.method==='GET')return json(res,200,service.getImplementationPlanCoverage({project_id:decodeURIComponent(m[1]),missing_only:url.searchParams.get('missing_only')==='true'}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/resolve$/))&&req.method==='GET')return json(res,200,service.resolveSemanticFeatureReference({project_id:decodeURIComponent(m[1]),reference:url.searchParams.get('reference')||''}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/reindex$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.reindexSemanticFeatures({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/features\/([^/]+)$/))&&req.method==='PATCH'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.updateSemanticFeature({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/implementation-plan$/))&&req.method==='GET')return json(res,200,service.getNodeImplementationPlan({project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/implementation-plan$/))&&req.method==='PUT'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.setNodeImplementationPlan({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/implementation-plan$/))&&req.method==='DELETE'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.deleteNodeImplementationPlan({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/runs\/([^/]+)$/))&&req.method==='GET')return json(res,200,service.getSemanticDiff({project_id:decodeURIComponent(m[1]),run_id:decodeURIComponent(m[2])}));
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/prepare$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,201,service.prepareSemanticFeatureSet({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/stage$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,201,service.stageSemanticFeatureSet({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/semantic\/commit$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.commitSemanticFeatureSet({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/bootstrap\/preview$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.previewMarkdownPlan({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/bootstrap\/commit$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.commitPlanImport({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/edge-cases$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,201,service.addEdgeCase({...b,project_id:decodeURIComponent(m[1])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/implementation$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.setImplementationState({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}
    if((m=pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/verification$/))&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.setVerificationState({...b,project_id:decodeURIComponent(m[1]),node_id:decodeURIComponent(m[2])}));}

    if(pathname==='/v1/user-history/entries'&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,201,service.remember(b));}
    if(pathname==='/v1/user-history/entries'&&req.method==='GET'){const user_id=url.searchParams.get('user_id');if(!user_id)return json(res,400,{error:'user_id required'});return json(res,200,{entries:service.memorySearch({user_id,project_id:url.searchParams.get('project_id')||undefined,query:url.searchParams.get('query')||undefined,include_inactive:url.searchParams.get('include_inactive')==='true'})});}
    if(pathname==='/v1/user-history/context'&&req.method==='GET'){const user_id=url.searchParams.get('user_id');if(!user_id)return json(res,400,{error:'user_id required'});return json(res,200,service.memoryContext({user_id,project_id:url.searchParams.get('project_id')||undefined,budget_tokens:Number(url.searchParams.get('budget_tokens')||1200)}));}
    if(pathname==='/v1/user-history/compact'&&req.method==='POST'){const b=await readBody(req,config.maxBodyBytes);return json(res,200,service.memoryContext(b));}
    if((m=pathname.match(/^\/v1\/user-history\/entries\/([^/]+)$/))&&req.method==='PATCH'){const b=await readBody(req,config.maxBodyBytes);const old=service.store.getMemory(decodeURIComponent(m[1]));if(!old)return json(res,404,{error:'Memory not found'});return json(res,200,service.memoryCorrect({user_id:b.user_id||old.user_id,memory_id:old.id,value:b.value??old.value,...b}));}
    if((m=pathname.match(/^\/v1\/user-history\/entries\/([^/]+)$/))&&req.method==='DELETE'){const old=service.store.getMemory(decodeURIComponent(m[1]));if(!old)return json(res,404,{error:'Memory not found'});return json(res,200,service.memoryForget({user_id:url.searchParams.get('user_id')||old.user_id,memory_id:old.id}));}

    if(pathname==='/v1/models'&&req.method==='GET'){const data=Object.keys(config.modelMap).map(id=>({id,object:'model',created:0,owned_by:'living-solution-graph'}));return json(res,200,{object:'list',data});}
    if((pathname==='/v1/responses'||pathname==='/v1/chat/completions')&&req.method==='POST')return proxyOpenAI(req,res,pathname,service,config);

    if(req.method==='GET'){
      const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');const f=path.resolve(publicDir,rel);if((f===publicDir||f.startsWith(publicDir+path.sep))&&fs.existsSync(f)&&fs.statSync(f).isFile()){const body=fs.readFileSync(f);res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','content-length':body.length,'cache-control':'no-cache'});res.end(body);return;}
      if(!path.extname(pathname)){const f2=path.join(publicDir,'index.html');if(fs.existsSync(f2)){const body=fs.readFileSync(f2);res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':body.length});res.end(body);return;}}
    }
    return json(res,404,{error:'Not found'});
  }

  const server=http.createServer((req,res)=>{route(req,res).catch(e=>{counters.errors++;log(`[http] ${e.stack||e}`);if(!res.headersSent)json(res,e.status||500,{error:e.message||'Internal server error',code:e.code||'INTERNAL_ERROR'});else res.destroy();});});
  return {server,counters,listen(){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,()=>{server.off('error',reject);resolve(server.address());});});},close(){service.activity.close();server.closeAllConnections();return new Promise(resolve=>server.close(()=>resolve()));}};
}

async function proxyOpenAI(req,res,pathname,service,config){
  if(!config.upstreamBaseUrl)return json(res,503,{error:{message:'OpenAI-compatible upstream is not configured. Set LSG_UPSTREAM_BASE_URL.',type:'server_configuration_error'}});
  const body=await readBody(req,config.maxBodyBytes);const alias=body.model||'lsg-auto';body.model=config.modelMap[alias]||alias;
  const projectId=req.headers['x-lsg-project-id']||body?.metadata?.lsg_project_id;const userId=req.headers['x-lsg-user-id']||body?.metadata?.lsg_user_id;let context='';
  if(projectId){try{const c=service.getContext({project_id:String(projectId),user_id:userId?String(userId):undefined,memory_budget_tokens:700,frontier_limit:15,max_nodes:100,max_edges:150});context=`Living Solution Graph context (authoritative project state):\n${JSON.stringify(c)}`;}catch{}}
  else if(userId){try{const c=service.memoryContext({user_id:String(userId),budget_tokens:700});context=`Living Solution Graph user history context:\n${JSON.stringify(c)}`;}catch{}}
  if(context){if(pathname==='/v1/responses')body.instructions=`${context}\n\n${body.instructions||''}`.trim();else {body.messages=Array.isArray(body.messages)?body.messages:[];body.messages.unshift({role:'system',content:context});}}
  const headers={'content-type':'application/json'};if(config.upstreamApiKey)headers.authorization=`Bearer ${config.upstreamApiKey}`;
  const upstream=await fetch(`${config.upstreamBaseUrl}${pathname}`,{method:'POST',headers,body:JSON.stringify(body)});const ct=upstream.headers.get('content-type')||'application/json';res.writeHead(upstream.status,{'content-type':ct});if(upstream.body){for await(const chunk of upstream.body)res.write(chunk);}res.end();
}
