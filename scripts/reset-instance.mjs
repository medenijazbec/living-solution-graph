import fs from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const projectTables=['projects','nodes','edges','node_documents','import_sessions','semantic_runs','starter_evaluations','workspace_records','node_revisions','record_revisions','events'];
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex');
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};

// Administrative reset deliberately uses raw SQLite: it never migrates a live older runtime's DB.
export function resetProjects({dbPath,backupDirectory,confirm}){
  ensure(confirm==='clear-all-projects','Explicit confirm=clear-all-projects is required');
  const target=fs.realpathSync(dbPath);ensure(fs.statSync(target).isFile(),'Existing database file is required');
  const backupRoot=path.resolve(backupDirectory);ensure(backupRoot!==path.dirname(target),'Choose a backup directory outside the database directory');fs.mkdirSync(backupRoot,{recursive:true});
  const backupPath=path.join(backupRoot,`lsg-before-v7-reset-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.sqlite`);
  ensure(!fs.existsSync(backupPath),'Backup path already exists');
  const db=new DatabaseSync(target);let backup;
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const schema=db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value;
    ensure(['9','10'].includes(schema),'Unsupported database schema for reset');
    db.prepare('VACUUM INTO ?').run(backupPath);
    backup=new DatabaseSync(backupPath,{readOnly:true});
    ensure(backup.prepare('PRAGMA integrity_check').get().integrity_check==='ok','Backup integrity check failed');
    ensure(backup.prepare('PRAGMA foreign_key_check').all().length===0,'Backup foreign keys are invalid');
    const projects=backup.prepare('SELECT id,title FROM projects ORDER BY id').all(),ids=projects.map(p=>p.id),idSet=new Set(ids);
    const rows=(connection,table)=>connection.prepare(`SELECT * FROM ${table}`).all().filter(row=>idSet.has(table==='projects'?row.id:row.project_id));
    const before=Object.fromEntries(projectTables.map(table=>[table,rows(backup,table)]));
    const personal=digest(backup.prepare('SELECT * FROM memories').all()),settings=digest(backup.prepare('SELECT * FROM meta').all()),instance=digest(backup.prepare('SELECT * FROM workspace_records').all().filter(row=>!idSet.has(row.project_id)));
    db.exec('BEGIN IMMEDIATE');
    try{
      ensure(digest(db.prepare('SELECT id,title FROM projects ORDER BY id').all())===digest(projects),'Project set changed during backup; reset aborted');
      for(const table of projectTables)ensure(digest(rows(db,table))===digest(before[table]),`${table} changed during backup; reset aborted`);
      ensure(digest(db.prepare('SELECT * FROM memories').all())===personal,'Personal memory changed during backup; reset aborted');
      ensure(digest(db.prepare('SELECT * FROM meta').all())===settings,'Settings changed during backup; reset aborted');
      ensure(digest(db.prepare('SELECT * FROM workspace_records').all().filter(row=>!idSet.has(row.project_id)))===instance,'Instance configuration changed during backup; reset aborted');
      for(const id of ids){db.prepare('DELETE FROM projects WHERE id=?').run(id);for(const table of ['workspace_records','record_revisions','node_revisions','events'])db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(id);}
      ensure(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n===0,'Projects remain after reset');
      for(const table of projectTables)ensure(rows(db,table).length===0,`${table} has project records remaining`);
      ensure(digest(db.prepare('SELECT * FROM memories').all())===personal,'Personal memory changed');
      ensure(digest(db.prepare('SELECT * FROM meta').all())===settings,'Instance settings changed');
      ensure(digest(db.prepare('SELECT * FROM workspace_records').all())===instance,'Instance configuration changed');
      ensure(db.prepare('PRAGMA foreign_key_check').all().length===0,'Reset foreign key check failed');
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {ok:true,backup_path:backupPath,backup_integrity:'ok',schema_preserved:schema,projects_removed:projects.length,removed_titles:projects.map(p=>p.title),record_counts:Object.fromEntries(projectTables.map(table=>[table,before[table].length])),remaining_projects:0,personal_memory_preserved:true,instance_settings_preserved:true};
  }finally{backup?.close();db.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const values={};for(let index=2;index<process.argv.length;index+=2)values[process.argv[index]]=process.argv[index+1];
  ensure(values['--db']&&values['--backup-directory'],'Pass --db, --backup-directory and --confirm clear-all-projects');
  console.log(JSON.stringify(resetProjects({dbPath:values['--db'],backupDirectory:values['--backup-directory'],confirm:values['--confirm']}),null,2));
}
