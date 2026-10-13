import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { LsgStore } from '../src/core/db.mjs';

const sourcePath=process.argv[2];if(!sourcePath||!fs.existsSync(sourcePath))throw new Error('Pass an existing database to verify migration on a temporary copy');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-migration-copy-')),copy=path.join(directory,'copy.sqlite');
const source=new DatabaseSync(fs.realpathSync(sourcePath));let migrated;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex');
try{
  source.prepare('VACUUM INTO ?').run(copy);source.close();
  const before=new DatabaseSync(copy,{readOnly:true}),tables=['projects','nodes','edges','node_documents','import_sessions','semantic_runs','starter_evaluations','memories','workspace_records','node_revisions','record_revisions','events'];
  const snapshots=Object.fromEntries(tables.map(table=>[table,{count:before.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,digest:digest(before.prepare(`SELECT * FROM ${table}`).all())}]));before.close();
  migrated=new LsgStore(copy);if(migrated.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value!=='10')throw new Error('Migration schema mismatch');
  for(const table of tables)if(digest(migrated.db.prepare(`SELECT * FROM ${table}`).all())!==snapshots[table].digest)throw new Error(`Migration altered existing ${table} records`);
  if(migrated.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||migrated.db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Migrated copy integrity failed');
  console.log(JSON.stringify({ok:true,schema:10,copy_only:true,preserved_record_counts:Object.fromEntries(tables.map(table=>[table,snapshots[table].count]))},null,2));
}finally{try{source.close();}catch{}migrated?.close();fs.rmSync(directory,{recursive:true,force:true});}
