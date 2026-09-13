import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { newId, nowIso } from './db.mjs';

const tables=['projects','nodes','import_sessions','edges','node_documents','semantic_runs','starter_evaluations','memories','workspace_records','node_revisions','record_revisions','events'];
const fail=(message,code='INVALID_ARGUMENT')=>{const error=new Error(message);error.code=code;throw error;};
const sha256=data=>createHash('sha256').update(data).digest('hex');

function parentFirst(rows,parentField){
  const pending=new Map(rows.map(row=>[row.id,row])),ordered=[];
  while(pending.size){let progress=false;for(const [id,row] of pending){if(row[parentField]&&pending.has(row[parentField]))continue;ordered.push(row);pending.delete(id);progress=true;}if(!progress)fail(`Snapshot contains a ${parentField} cycle`,'INVALID_SNAPSHOT');}
  return ordered;
}

export class ProjectSnapshots {
  constructor(service){this.service=service;this.store=service.store;this.directory=path.join(path.dirname(this.store.dbPath),'exports');}

  export(input){
    const project=this.store.requireProject(input.project_id);
    const snapshot=this.store.tx(()=>{const records={};for(const table of tables)records[table]=this.store.db.prepare(`SELECT * FROM ${table} WHERE ${table==='projects'?'id':'project_id'}=?`).all(project.id);return {format:'lsg-project-snapshot',version:1,created_at:nowIso(),project_id:project.id,project_title:project.title,records};});
    const content=gzipSync(Buffer.from(JSON.stringify(snapshot)),{level:9});fs.mkdirSync(this.directory,{recursive:true});const name=`lsg-project-${project.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-${newId('export')}.json.gz`,target=path.join(this.directory,name);fs.writeFileSync(target,content,{flag:'wx'});
    return {project_id:project.id,project_title:project.title,file_path:target,sha256:sha256(content),bytes:content.length,record_counts:Object.fromEntries(tables.map(table=>[table,snapshot.records[table].length]))};
  }

  restore(input){
    if(!input.file_path||!input.expected_sha256||!input.confirm_title)fail('file_path, expected_sha256, and confirm_title are required');
    const root=fs.realpathSync(this.directory),target=fs.realpathSync(String(input.file_path));if(!target.startsWith(root+path.sep)||!path.basename(target).startsWith('lsg-project-')||!target.endsWith('.json.gz'))fail('Snapshot must be a managed LSG export','FILE_ACCESS_DENIED');
    const compressed=fs.readFileSync(target);if(compressed.length>64*1024*1024)fail('Snapshot exceeds 64 MiB','SNAPSHOT_TOO_LARGE');if(sha256(compressed)!==input.expected_sha256)fail('Snapshot checksum mismatch','SNAPSHOT_HASH_MISMATCH');
    let snapshot;try{snapshot=JSON.parse(gunzipSync(compressed,{maxOutputLength:128*1024*1024}).toString('utf8'));}catch{fail('Invalid compressed project snapshot','INVALID_SNAPSHOT');}
    if(snapshot?.format!=='lsg-project-snapshot'||snapshot.version!==1||!snapshot.project_id||!snapshot.records||!tables.every(table=>Array.isArray(snapshot.records[table])))fail('Unsupported project snapshot','INVALID_SNAPSHOT');if(snapshot.project_title!==input.confirm_title)fail(`Confirm restore with ${snapshot.project_title}`,'CONFIRMATION_REQUIRED');if(this.store.getProject(snapshot.project_id))fail('Project already exists; restore never overwrites a project','PROJECT_EXISTS');
    for(const table of tables)for(const row of snapshot.records[table])if((table==='projects'?row.id:row.project_id)!==snapshot.project_id)fail(`Snapshot contains cross-project ${table} records`,'INVALID_SNAPSHOT');if(snapshot.records.projects.length!==1)fail('Snapshot must contain exactly one project','INVALID_SNAPSHOT');
    this.store.tx(()=>{
      for(const table of tables){if(table==='node_revisions'||table==='record_revisions')continue;let rows=snapshot.records[table];if(table==='nodes')rows=parentFirst(rows,'parent_id');if(table==='memories')rows=parentFirst(rows,'supersedes_id');for(const row of rows){const columns=Object.keys(row),sql=`INSERT INTO ${table} (${columns.map(name=>`"${name}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;this.store.db.prepare(sql).run(...columns.map(name=>row[name]));}}
      // Insertion triggers reconstruct one revision; replace those with the
      // complete archived history, retaining version order without global IDs.
      for(const table of ['node_revisions','record_revisions']){this.store.db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(snapshot.project_id);for(const row of snapshot.records[table]){const columns=Object.keys(row).filter(name=>name!=='sequence'),sql=`INSERT INTO ${table} (${columns.map(name=>`"${name}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;this.store.db.prepare(sql).run(...columns.map(name=>row[name]));}}
      const foreignKeys=this.store.db.prepare('PRAGMA foreign_key_check').all();if(foreignKeys.length)fail('Snapshot violates database foreign keys','INVALID_SNAPSHOT');
    });
    return {project_id:snapshot.project_id,title:snapshot.project_title,restored:true,record_counts:Object.fromEntries(tables.map(table=>[table,snapshot.records[table].length]))};
  }
}
