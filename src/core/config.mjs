import path from 'node:path';
import fs from 'node:fs';
function bool(v,d=false){if(v==null)return d;return ['1','true','yes','on'].includes(String(v).toLowerCase());}
function list(v,d=[]){return v?String(v).split(',').map(x=>x.trim()).filter(Boolean):d;}
export function loadConfig(env=process.env){
  const host=env.LSG_HOST||'127.0.0.1'; const port=Number(env.LSG_PORT||7347);
  return {
    host,port,dbPath:path.resolve(env.LSG_DB_PATH||(fs.existsSync('./data/lsg.sqlite')?'./data/lsg.sqlite':null)||(process.platform==='win32'?path.join(env.LOCALAPPDATA||path.join(process.env.USERPROFILE||'.','AppData','Local'),'LivingSolutionGraph','lsg.sqlite'):'./data/lsg.sqlite')),workspaceRoot:path.resolve(env.LSG_WORKSPACE_ROOT||'.'),
    apiToken:env.LSG_API_TOKEN||'',allowInsecure:bool(env.LSG_ALLOW_INSECURE,false),
    allowedOrigins:list(env.LSG_ALLOWED_ORIGINS,[`http://127.0.0.1:${port}`,`http://localhost:${port}`]),
    allowedHosts:list(env.LSG_ALLOWED_HOSTS,[`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]),
    maxBodyBytes:Number(env.LSG_MAX_BODY_BYTES||2097152),rateLimitPerMinute:Number(env.LSG_RATE_LIMIT_PER_MINUTE||240),logLevel:env.LSG_LOG_LEVEL||'info',
    upstreamBaseUrl:(env.LSG_UPSTREAM_BASE_URL||'').replace(/\/$/,''),upstreamApiKey:env.LSG_UPSTREAM_API_KEY||'',
    modelMap:parseJson(env.LSG_MODEL_MAP_JSON,{"lsg-auto":"gpt-5.6","lsg-solve":"gpt-5.6","lsg-implement":"gpt-5.6","lsg-audit":"gpt-5.6","lsg-fast":"gpt-5.6"})
  };
}
function parseJson(v,d){if(!v)return d;try{return JSON.parse(v)}catch{return d}}
export function assertSecureConfig(c){
  const loop=['127.0.0.1','localhost','::1'].includes(c.host);
  if(!loop&&!c.apiToken&&!c.allowInsecure)throw new Error('Refusing non-loopback bind without LSG_API_TOKEN. Set a token or explicitly set LSG_ALLOW_INSECURE=true.');
}
