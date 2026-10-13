import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resetProjects } from '../scripts/reset-instance.mjs';
import { authoringFixture,publishFixture } from './fixtures/authoring.mjs';

test('reset backs up a consistent database, clears projects, and preserves all personal memory and settings without migration',()=>{const r=authoringFixture();try{
  const {start}=publishFixture(r);r.service.workspace.memory({project_id:start.project.id,text:'Project decision'},'remember');r.service.remember({user_id:'personal',value:'Keep my preference',subject:'preference'});r.service.remember({user_id:'personal',project_id:start.project.id,scope:'project',value:'Personal historical project note'});
  const memories=r.store.db.prepare('SELECT * FROM memories ORDER BY id').all();r.service.workspace.put('scale','instance','instance',{version:2,levels:[{id:'P0',label:'Keep',description:'Keep this setting'}]});r.store.db.prepare("UPDATE meta SET value='9' WHERE key='schema_version'").run();
  assert.throws(()=>resetProjects({dbPath:r.store.dbPath,backupDirectory:path.join(r.dir,'backups'),confirm:'wrong'}),/Explicit confirm/);
  const result=resetProjects({dbPath:r.store.dbPath,backupDirectory:path.join(r.dir,'backups'),confirm:'clear-all-projects'});assert.equal(result.projects_removed,1);assert.equal(result.schema_preserved,'9');assert.equal(r.store.listProjects().length,0);assert.deepEqual(r.store.db.prepare('SELECT * FROM memories ORDER BY id').all(),memories);assert.equal(r.store.db.prepare("SELECT data FROM workspace_records WHERE kind='scale'").all().length,1);
  assert.ok(fs.existsSync(r.plan));const backup=new DatabaseSync(result.backup_path,{readOnly:true});try{assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM projects').get().n,1);assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM node_documents').get().n,6);assert.equal(backup.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value,'9');}finally{backup.close();}
}finally{r.close();}});
