import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { newId, nowIso } from './db.mjs';

export const DEFAULT_SCALE = [
  {id:'P0',label:'Critical / foundational',description:'Required foundations and critical blockers.'},
  {id:'P1',label:'Core functionality',description:'Primary product outcomes.'},
  {id:'P2',label:'Supporting functionality',description:'Supporting capabilities and quality improvements.'},
  {id:'P3',label:'Polish / deferred',description:'Polish and intentionally deferred work.'}
];
export function requireValue(ok,message,code='INVALID_ARGUMENT'){if(!ok){const e=new Error(message);e.code=code;throw e;}}
export function importanceScale(store){const row=store.db.prepare("SELECT data FROM workspace_records WHERE kind='scale' AND id='instance'").get();return row?JSON.parse(row.data):{version:0,levels:DEFAULT_SCALE};}
const excluded=n=>n.status!=='active'||n.implementation_state==='excluded'||n.disposition==='not_applicable';
const required=n=>!excluded(n)&&n.disposition!=='optional';
const implemented=n=>n.implemented&&!['stale','not_implemented','implementing'].includes(n.implementation_state);
const verified=n=>implemented(n)&&n.verification_state==='verified';

export class Workspace {
  constructor(service){this.service=service;this.store=service.store;}
  node(a){const nodes=this.store.listNodes(a.project_id);const ref=String(a.reference||a.node_id||'').replace(/^feature\s+/i,'').trim();const numbered=/^\d+(\.\d+)*$/.test(ref)?`F${ref}`:ref.toUpperCase();const n=nodes.find(n=>n.id===ref||n.metadata.semantic_key===ref||n.metadata.display_id?.toUpperCase()===numbered);requireValue(n,'Feature or edge case not found','NODE_NOT_FOUND');return n;}
  records(kind,project){return this.store.db.prepare('SELECT data FROM workspace_records WHERE kind=? AND project_id=? ORDER BY updated_at DESC').all(kind,project).map(r=>JSON.parse(r.data));}
  record(kind,id){const r=this.store.db.prepare('SELECT data FROM workspace_records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.data):null;}
  put(kind,id,project,data){this.store.db.prepare('INSERT INTO workspace_records(kind,id,project_id,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(kind,id,project,JSON.stringify(data),nowIso());return data;}
  progress(a){
    this.store.requireProject(a.project_id);
    const all=this.store.listNodes(a.project_id),semantic=all.some(n=>n.metadata.layer==='semantic'&&!n.metadata.semantic_root),nodes=all.filter(n=>(!semantic||n.metadata.layer==='semantic')&&!n.metadata.semantic_root),byId=new Map(nodes.map(n=>[n.id,n])),edges=this.store.listEdges(a.project_id);
    const children=new Map();const add=(p,id)=>{if(!children.has(p))children.set(p,new Set());children.get(p).add(id);};
    for(const n of nodes)if(n.parent_id)add(n.parent_id,n.id);
    for(const e of edges)if(['contains','has_edge_case','validated_by'].includes(e.type))add(e.source_id,e.target_id);
    const collect=(id,recursive=true)=>{const ids=new Set();const visit=(key,descend)=>{if(ids.has(key)||!byId.has(key))return;ids.add(key);if(descend&&!excluded(byId.get(key))&&byId.get(key).disposition!=='optional')for(const child of children.get(key)||[])visit(child,recursive);};visit(id,true);return [...ids].map(id=>byId.get(id));};
    const root=a.reference||a.node_id?this.node(a):null;const scoped=root?collect(root.id,a.recursive!==false):nodes;const tracked=scoped.filter(n=>['feature','edge_case'].includes(n.type)),active=tracked.filter(n=>!excluded(n));
    const summary=n=>{
      const closure=(n.type==='feature'?collect(n.id):[n]).filter(required);
      const count=closure.filter(implemented).length;const complete=closure.length>0&&closure.every(verified);
      const category=complete?'fully_complete':count===closure.length&&count>0?'awaiting_verification':count>0||closure.some(x=>x.implementation_state==='implementing')?'partially_implemented':'not_started';
      const direct=collect(n.id,false).filter(x=>x.type==='edge_case'&&!excluded(x));const recursive=collect(n.id).filter(x=>x.type==='edge_case'&&!excluded(x));
      return {id:n.id,reference:n.metadata.display_id,title:n.title,type:n.type,priority:n.metadata.priority,category,implemented:n.implemented,verification_state:n.verification_state,required_total:closure.length,required_implemented:count,required_verified:closure.filter(verified).length,direct_edge_cases:direct.length,recursive_edge_cases:recursive.length,blocked:closure.some(x=>x.implementation_state==='blocked'),stale:closure.some(x=>x.implementation_state==='stale'||x.verification_state==='stale'),failed:closure.some(x=>x.verification_state==='failed'),remaining_ids:closure.filter(x=>!verified(x)).map(x=>x.id)};
    };
    const items=active.map(summary);const features=active.filter(n=>n.type==='feature');
    const counters=list=>({total:list.length,not_started:list.filter(x=>x.category==='not_started').length,partially_implemented:list.filter(x=>x.category==='partially_implemented').length,awaiting_verification:list.filter(x=>x.category==='awaiting_verification').length,fully_complete:list.filter(x=>x.category==='fully_complete').length,blocked:list.filter(x=>x.blocked).length,stale:list.filter(x=>x.stale).length,failed_verification:list.filter(x=>x.failed).length});
    return {project_id:a.project_id,graph_version:this.store.requireProject(a.project_id).graph_version,mode:semantic?'semantic':'lexical_fallback',scope:root?.id||'project',features_total:features.length,root_features:features.filter(n=>!n.metadata.parent_semantic_key).length,subfeatures:features.filter(n=>n.metadata.parent_semantic_key).length,edge_cases_total:active.filter(n=>n.type==='edge_case').length,combined_total:active.length,counts:counters(items),feature_counts:counters(items.filter(x=>x.type==='feature')),edge_case_counts:counters(items.filter(x=>x.type==='edge_case')),excluded_total:tracked.filter(excluded).length,superseded_total:tracked.filter(n=>n.status==='superseded').length,excluded:tracked.filter(excluded).map(n=>({id:n.id,status:n.status})),items};
  }
  remaining(a){const result=this.progress(a),nodes=new Map(this.store.listNodes(a.project_id).map(n=>[n.id,n])),edges=this.store.listEdges(a.project_id),byId=new Map((a.reference||a.node_id?this.progress({project_id:a.project_id}).items:result.items).map(x=>[x.id,x]));const scale=importanceScale(this.store),rank=new Map(scale.levels.map((l,i)=>[l.id,i]));
    const items=result.items.filter(n=>n.category!=='fully_complete').map(n=>{
      const deps=edges.filter(e=>e.source_id===n.id&&e.type==='depends_on').map(e=>e.target_id);
      // A child may depend on its containing feature's own implementation;
      // requiring that parent's entire subtree here would create a deadlock.
      const isAncestor=id=>{let x=nodes.get(n.id);const seen=new Set();while(x?.parent_id&&!seen.has(x.parent_id)){if(x.parent_id===id)return true;seen.add(x.parent_id);x=nodes.get(x.parent_id);}return false;};
      const ready=deps.every(id=>{const d=nodes.get(id);return d&&(excluded(d)|| (isAncestor(id)?verified(d):byId.get(id)?.category==='fully_complete'||verified(d)&&!byId.has(id)));});
      return {...n,dependency_ready:ready,dependency_ids:deps};
    }).sort((a,b)=>Number(b.dependency_ready)-Number(a.dependency_ready)||(rank.get(a.priority)??999)-(rank.get(b.priority)??999)||String(a.reference||a.id).localeCompare(String(b.reference||b.id),undefined,{numeric:true}));
    return {...result,items:items.slice(0,a.limit||500)};
  }
  setScale(a){return this.store.tx(()=>{const current=importanceScale(this.store);requireValue(a.expected_version===current.version,'Importance scale changed','VERSION_CONFLICT');requireValue(Array.isArray(a.levels)&&a.levels.length>0,'Provide ordered levels');const ids=new Set();for(const l of a.levels){requireValue(/^[A-Za-z][\w-]{0,31}$/.test(l.id)&&l.label?.trim()&&l.description?.trim()&&!ids.has(l.id),'Invalid or duplicate importance level');ids.add(l.id);}
    const projects=this.store.listProjects(),updates=[];for(const p of projects)for(const n of this.store.listNodes(p.id)){const old=n.metadata.priority;if(old&&!ids.has(old)){const replacement=a.replacements?.[old];requireValue(ids.has(replacement),`Level ${old} is in use; provide replacement`);updates.push([n,replacement]);}}
    const affected=new Set();for(const [n,priority] of updates){this.store.updateNodeInTransaction(n.id,{metadata:{priority}});affected.add(n.project_id);}for(const id of affected)this.store.bumpGraphVersion(id);
    const value=this.put('scale','instance','',{version:current.version+1,levels:a.levels});this.store.event({kind:'importance.scale_changed',actor:a.actor||'developer',data:value});return value;});}
  setImportance(a){const n=this.node(a);requireValue(n.type==='feature','Importance belongs to features');requireValue(importanceScale(this.store).levels.some(l=>l.id===a.priority)&&a.rationale?.trim(),'Valid priority and rationale required');return this.store.updateNode(n.id,{metadata:{priority:a.priority,importance_rationale:a.rationale,importance_override:true}},a.expected_node_version);}
  memory(a,action){this.store.requireProject(a.project_id);if(action==='remember'){if(a.node_id)this.node(a);requireValue(a.text?.trim(),'Memory text required');const id=newId('pmem');return this.put('memory',id,a.project_id,{id,project_id:a.project_id,node_id:a.node_id||null,text:a.text,kind:a.kind||'note',version:1,state:'active',created_at:nowIso(),updated_at:nowIso()});}
    if(action==='correct'||action==='forget'){const old=this.record('memory',a.memory_id);requireValue(old?.project_id===a.project_id,'Project memory not found');requireValue(a.expected_version===old.version,'Memory changed','VERSION_CONFLICT');if(action==='forget')return this.put('memory',old.id,a.project_id,{...old,state:'forgotten',version:old.version+1,updated_at:nowIso()});requireValue(a.text?.trim(),'Replacement text required');return this.store.tx(()=>{this.put('memory',old.id,a.project_id,{...old,state:'superseded',version:old.version+1,updated_at:nowIso()});const next=this.memory({...a,node_id:old.node_id,kind:old.kind},'remember');return this.put('memory',next.id,a.project_id,{...next,supersedes_id:old.id});});}
    const entries=this.records('memory',a.project_id).filter(m=>m.state==='active'&&(!a.node_id||!m.node_id||m.node_id===a.node_id)&&(!a.query||m.text.toLowerCase().includes(a.query.toLowerCase())));
    let budget=Math.max(0,Math.min(10000,a.budget_tokens??1500))*4;const selected=[];for(const m of entries){if(m.text.length>budget)continue;selected.push(m);budget-=m.text.length;}
    return {project_id:a.project_id,entries:action==='context'?selected:entries.slice(0,a.limit||100)};
  }
  work(a,action){this.store.requireProject(a.project_id);return this.store.tx(()=>{
    let rows=this.records('work',a.project_id);for(const row of rows)if(['claimed','submitted'].includes(row.status)&&Date.parse(row.expires_at)<Date.now())this.put('work',row.id,a.project_id,{...row,status:'expired',version:row.version+1,updated_at:nowIso()});rows=this.records('work',a.project_id);
    if(action==='claim'){
      requireValue(a.owner?.trim(),'Owner required');const active=rows.filter(r=>['claimed','submitted'].includes(r.status));
      if(a.parent_work_id){requireValue(a.delegation_requested===true,'Delegation must be explicitly requested');requireValue(active.some(r=>r.id===a.parent_work_id),'Active parent work required');}else requireValue(!active.length,'Project already has active work','WORK_BUSY');
      const remaining=this.remaining(a).items;const choice=a.node_id||a.reference?remaining.find(x=>x.id===this.node(a).id):remaining.find(x=>x.dependency_ready&&!x.blocked);
      requireValue(choice?.dependency_ready,'No dependency-ready work','NO_READY_WORK');requireValue(!active.some(r=>r.node_id===choice.id),'Node already claimed','WORK_BUSY');const n=this.store.getNode(choice.id),id=newId('work');
      const work={id,project_id:a.project_id,node_id:n.id,owner:a.owner,scope:a.scope||n.title,parent_work_id:a.parent_work_id||null,status:'claimed',version:1,node_version:n.version,context_snapshot:this.context({...a,node_id:n.id}),created_at:nowIso(),updated_at:nowIso(),expires_at:new Date(Date.now()+30*60*1000).toISOString()};this.put('work',id,a.project_id,work);this.service.activity.emit(a.project_id,[n.id],'work_claimed',a.owner);return {...work,context:this.context({...a,node_id:n.id})};
    }
    const w=this.record('work',a.work_id);requireValue(w?.project_id===a.project_id,'Work not found');if(action==='context')return {...w,context:this.context({...a,node_id:w.node_id})};
    requireValue(w.version===a.expected_version,'Work changed','VERSION_CONFLICT');requireValue(['claimed','submitted'].includes(w.status),'Work is inactive');
    if(action==='review'){
      requireValue(w.status==='submitted','Submit work before review');requireValue(a.reviewer?.trim()&&a.evidence?.summary?.trim()&&['automated_test','manual_verification'].includes(a.evidence.kind),'Reviewer and verification evidence required');
      const n=this.store.getNode(w.node_id);requireValue(n.version===w.submitted_node_version,'Node changed after submission','STALE_REVIEW');
      if(a.approved){requireValue(!rows.some(r=>r.parent_work_id===w.id&&!['reviewed','released'].includes(r.status)),'Delegated work still requires review');requireValue(n.implemented,'Implementation must exist');this.store.updateNodeInTransaction(n.id,{verification_state:'verified',verified_at:nowIso(),metadata:{evidence:[...(n.metadata.evidence||[]),{at:nowIso(),...a.evidence}]}},n.version);this.store.bumpGraphVersion(a.project_id);this.store.event({project_id:a.project_id,kind:'node.verification_state_changed',actor:a.reviewer,entity_id:n.id,data:{verification_state:'verified',evidence:a.evidence}});}
      const result=this.put('work',w.id,a.project_id,{...w,status:a.approved?'reviewed':'claimed',review:{reviewer:a.reviewer,approved:a.approved,evidence:a.evidence},version:w.version+1,updated_at:nowIso()});if(a.approved){try{result.git_sync=this.syncGit({project_id:a.project_id,node_id:n.id,commit_sha:n.commit_sha});}catch{result.git_sync={available:false,reason:'Local Git history unavailable'};}}this.service.activity.emit(a.project_id,[n.id],'work_reviewed',a.reviewer);return result;
    }
    requireValue(w.owner===a.owner,'Only claim owner may update work');requireValue(['renew','release','submit'].includes(a.action),'Use renew, release, or submit');
    const next={...w,version:w.version+1,updated_at:nowIso(),expires_at:new Date(Date.now()+30*60*1000).toISOString()};if(a.action==='release')next.status='released';if(a.action==='submit'){requireValue(a.result?.summary?.trim(),'Work result summary required');next.status='submitted';next.result=a.result;next.submitted_node_version=this.store.getNode(w.node_id).version;}
    this.put('work',w.id,a.project_id,next);this.service.activity.emit(a.project_id,[w.node_id],`work_${a.action}`,a.owner);return next;
  });}
  context(a){const node=this.node(a);this.service.activity.emit(a.project_id,[node.id],'read','mcp');const progress=this.progress({...a,node_id:node.id});return {node,progress,plans:progress.items.map(n=>this.store.getNodeDocument(n.id)).filter(Boolean),file_links:this.records('files',a.project_id).filter(r=>progress.items.some(n=>n.id===r.node_id)),dependencies:this.store.listEdges(a.project_id).filter(e=>e.type==='depends_on'&&e.source_id===node.id),memory:this.memory({...a,node_id:node.id},'context')};}
  history(a){const n=this.node(a);return {node:n,file_links:this.record('files',n.id)?.paths||[],revisions:this.store.db.prepare('SELECT * FROM node_revisions WHERE node_id=? ORDER BY sequence DESC LIMIT ?').all(n.id,a.limit||100).map(r=>({...r,snapshot:JSON.parse(r.snapshot)})),records:this.store.db.prepare('SELECT * FROM record_revisions WHERE project_id=? ORDER BY sequence DESC LIMIT 500').all(a.project_id).map(r=>({...r,snapshot:JSON.parse(r.snapshot)})).filter(r=>r.snapshot.node_id===n.id),events:this.store.listEvents({project_id:a.project_id,limit:500}).filter(e=>e.entity_id===n.id),commits:this.records('git',a.project_id).filter(c=>c.node_ids.includes(n.id))};}
  syncGit(a){const p=this.store.requireProject(a.project_id),root=p.metadata.workspace_root||p.metadata.repository_root;requireValue(root,'Bind project directory before Git sync');const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});let remote='';try{remote=git('remote','get-url','origin').trim();}catch{}
    const match=remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/);const base=match?`https://github.com/${match[1]}`:null;
    const links=this.records('files',a.project_id),explicit=a.node_id?this.node(a):null;const shas=git('log',`-${Math.min(100,a.limit||30)}`,'--format=%H').trim().split(/\r?\n/).filter(Boolean),commits=[];if(a.commit_sha){requireValue(/^[a-f0-9]{7,40}$/i.test(a.commit_sha),'Invalid commit SHA');const full=git('rev-parse',a.commit_sha+'^{commit}').trim();a={...a,commit_sha:full};if(!shas.includes(full))shas.push(full);}
    for(const sha of shas){const lines=git('show','--format=','--numstat','--no-renames',sha,'--').trim().split(/\r?\n/).filter(Boolean);const files=lines.map(l=>{const [added,removed,...parts]=l.split('\t');return {path:parts.join('\t'),additions:added==='-'?null:Number(added),deletions:removed==='-'?null:Number(removed)};});const nodeIds=new Set(links.filter(l=>files.some(f=>l.paths.some(x=>f.path===x||f.path.startsWith(x+'/')))).map(l=>l.node_id));if(explicit&&a.commit_sha===sha)nodeIds.add(explicit.id);if(!nodeIds.size)continue;const tags=git('tag','--points-at',sha).trim().split(/\r?\n/).filter(Boolean);const record={sha,node_ids:[...nodeIds],timestamp:git('show','-s','--format=%cI',sha).trim(),files,tags,url:base?`${base}/commit/${sha}`:null,association:explicit&&a.commit_sha===sha?'explicit_task_and_file_mapping':'file_mapping',proof_of_implementation:false};this.put('git',`${p.id}:${sha}`,p.id,record);commits.push(record);}
    return {project_id:p.id,commits};
  }
}
