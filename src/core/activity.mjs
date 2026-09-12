import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { requireValue } from './workspace.mjs';

const denied=/(^|\/)(?:\.git|\.env(?:\.[^/]*)?|node_modules|data|logs|coverage|dist|build|saved|intermediate|deriveddatacache|binaries|\.lsg|\.aws|\.ssh|secrets?)(\/|$)|\.(?:sqlite(?:-wal|-shm)?|db|pem|key|pfx|log)$/i;
export class Activity {
  constructor(service){this.service=service;this.sessions=new Map();this.bus=new EventEmitter();this.bus.setMaxListeners(100);}
  root(project){const p=this.service.store.requireProject(project),root=p.metadata.workspace_root||p.metadata.repository_root;requireValue(root&&fs.existsSync(root),'Existing bound workspace required');return fs.realpathSync(root);}
  safe(project,relative,{missing=false}={}){
    requireValue(typeof relative==='string'&&relative&&!path.isAbsolute(relative),'Relative workspace path required');const normalized=relative.replaceAll('\\','/');requireValue(!normalized.split('/').includes('..')&&!denied.test(normalized),'Path is excluded','FILE_ACCESS_DENIED');
    const root=this.root(project),target=path.resolve(root,relative);const db=path.resolve(this.service.store.dbPath);requireValue(target!==db&&target!==db+'-wal'&&target!==db+'-shm','LSG data is excluded','FILE_ACCESS_DENIED');requireValue(target.startsWith(root+path.sep),'Path escapes workspace','FILE_ACCESS_DENIED');
    let cursor=target;while(cursor!==root){if(fs.existsSync(cursor)){requireValue(!fs.lstatSync(cursor).isSymbolicLink(),'Linked paths are excluded','FILE_ACCESS_DENIED');const real=fs.realpathSync(cursor);requireValue(real.startsWith(root+path.sep),'Path escapes workspace','FILE_ACCESS_DENIED');}cursor=path.dirname(cursor);}
    try{execFileSync('git',['-C',root,'check-ignore','-q','--',normalized],{windowsHide:true,stdio:'ignore'});throw Object.assign(new Error('Git-ignored path is excluded'),{code:'FILE_ACCESS_DENIED'});}catch(e){if(e.code==='FILE_ACCESS_DENIED')throw e;if(e.status!==1){let probe=root;while(!fs.existsSync(path.join(probe,'.git'))&&path.dirname(probe)!==probe)probe=path.dirname(probe);requireValue(!fs.existsSync(path.join(probe,'.git')),'Cannot verify ignored paths','FILE_ACCESS_DENIED');}}
    requireValue(missing||fs.existsSync(target),'File does not exist','FILE_NOT_FOUND');return target;
  }
  links(a){const n=this.service.workspace.node(a);requireValue(['feature','edge_case'].includes(n.type),'File links require a feature or edge case');requireValue(Array.isArray(a.paths)&&a.paths.length<=100,'Provide up to 100 paths');const paths=[...new Set(a.paths.map(p=>{this.safe(a.project_id,p,{missing:true});return p.replaceAll('\\','/').replace(/\/$/,'');}))];const saved=this.service.workspace.put('files',n.id,a.project_id,{node_id:n.id,project_id:a.project_id,paths});if(this.sessions.has(a.project_id))this.enable({...a,enabled:true});return saved;}
  status(a){this.service.store.requireProject(a.project_id);const session=this.sessions.get(a.project_id);return {project_id:a.project_id,enabled:!!session,watched:session?.watchers.length||0,retention:'memory_only',buffer_size:session?.buffer.length||0,errors:session?.errors||[]};}
  enable(a){this.service.store.requireProject(a.project_id);const old=this.sessions.get(a.project_id);if(old){old.watchers.forEach(w=>w.close());old.timers.forEach(clearTimeout);old.buffer.length=0;this.sessions.delete(a.project_id);}if(!a.enabled){this.bus.emit(a.project_id,{kind:'activity_disabled',node_ids:[],timestamp:new Date().toISOString()});return this.status(a);}
    const session={watchers:[],timers:new Map(),buffer:[],errors:[]};this.sessions.set(a.project_id,session);
    for(const link of this.service.workspace.records('files',a.project_id))for(const relative of link.paths){try{
      const target=this.safe(a.project_id,relative,{missing:true}),directory=fs.existsSync(target)&&fs.statSync(target).isDirectory(),watchRoot=directory?target:path.dirname(target);
      const watcher=fs.watch(watchRoot,{recursive:directory},(_event,file)=>{if(!file)return;const changed=path.relative(this.root(a.project_id),path.join(watchRoot,file.toString())).replaceAll('\\','/');if(changed!==relative&&!(directory&&changed.startsWith(relative+'/')))return;try{this.safe(a.project_id,changed,{missing:true});}catch{return;}const key=link.node_id;if(session.timers.has(key))clearTimeout(session.timers.get(key));session.timers.set(key,setTimeout(()=>{session.timers.delete(key);this.emit(a.project_id,[link.node_id],'workspace_change','workspace');},120));});
      watcher.on('error',()=>{session.errors.push('A mapped path watcher stopped; toggle activity to retry.');watcher.close();});session.watchers.push(watcher);
    }catch{session.errors.push('A mapped path is unavailable or excluded.');}}
    return this.status(a);
  }
  emit(project,nodeIds,kind,actor='mcp'){const session=this.sessions.get(project);if(!session||!nodeIds?.length)return;const event={node_ids:[...new Set(nodeIds)],kind,timestamp:new Date().toISOString(),actor};session.buffer.push(event);if(session.buffer.length>100)session.buffer.shift();this.bus.emit(project,event);}
  read(a){const n=this.service.workspace.node(a),links=this.service.workspace.record('files',n.id);requireValue(links?.paths.some(p=>a.path===p||a.path.startsWith(p+'/')),'Read path must be mapped to this node');const file=this.safe(a.project_id,a.path);requireValue(fs.statSync(file).isFile()&&fs.statSync(file).size<=2*1024*1024,'Only files up to 2 MiB may be read');const text=fs.readFileSync(file,'utf8');this.emit(a.project_id,[n.id],'file_read',a.actor||'mcp');return {node_id:n.id,path:a.path,text};}
  close(){for(const id of [...this.sessions.keys()])this.enable({project_id:id,enabled:false});this.bus.removeAllListeners();}
}
