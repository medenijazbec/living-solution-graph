import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function j(v) { return v == null ? null : JSON.stringify(v); }
function p(v, fallback = null) {
  if (v == null || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
export function nowIso() { return new Date().toISOString(); }
export function newId(prefix) { return `${prefix}_${randomUUID().replaceAll('-', '')}`; }

export class LsgStore {
  constructor(dbPath = './data/lsg.sqlite') {
    this.dbPath = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO meta(key,value) VALUES('schema_version','7') ON CONFLICT(key) DO UPDATE SET value=excluded.value;

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        graph_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        origin TEXT NOT NULL DEFAULT 'user_or_plan',
        status TEXT NOT NULL DEFAULT 'active',
        implemented INTEGER NOT NULL DEFAULT 0 CHECK(implemented IN (0,1)),
        implementation_state TEXT NOT NULL DEFAULT 'not_implemented',
        verification_state TEXT NOT NULL DEFAULT 'unverified',
        source_claimed_implemented INTEGER NOT NULL DEFAULT 0 CHECK(source_claimed_implemented IN (0,1)),
        disposition TEXT,
        parent_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
        commit_sha TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        implemented_at TEXT,
        verified_at TEXT,
        last_invalidated_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_project_type ON nodes(project_id,type);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'system',
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(project_id, source_id, target_id, type)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_project ON edges(project_id);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);

      CREATE TABLE IF NOT EXISTS import_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_name TEXT,
        source_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        expected_graph_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        result_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_import_project ON import_sessions(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS semantic_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_import_id TEXT REFERENCES import_sessions(id) ON DELETE SET NULL,
        source_hash TEXT NOT NULL,
        snapshot_graph_version INTEGER NOT NULL,
        scope TEXT NOT NULL DEFAULT 'project',
        status TEXT NOT NULL CHECK(status IN ('prepared','staged','committed','stale','superseded')),
        brief_json TEXT NOT NULL DEFAULT '{}',
        proposal_json TEXT,
        diff_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        committed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_runs_project ON semantic_runs(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_semantic_runs_status ON semantic_runs(project_id, status);

      CREATE TABLE IF NOT EXISTS starter_evaluations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        import_session_id TEXT REFERENCES import_sessions(id) ON DELETE SET NULL,
        pack_id TEXT NOT NULL,
        pack_version TEXT NOT NULL,
        capability_key TEXT,
        edge_case_key TEXT,
        disposition TEXT NOT NULL,
        reason TEXT,
        node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_starter_project ON starter_evaluations(project_id, pack_id);

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT,
        value TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        project_id TEXT,
        confidence REAL NOT NULL DEFAULT 0.8,
        salience REAL NOT NULL DEFAULT 0.5,
        state TEXT NOT NULL DEFAULT 'active',
        supersedes_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
        source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id,state,salience DESC,updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id,state);

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        user_id TEXT,
        kind TEXT NOT NULL,
        actor TEXT NOT NULL,
        entity_id TEXT,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id,created_at DESC);
    `);
  }

  close() { this.db.close(); }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }

  createProject({ id = newId('proj'), title, description = '', metadata = {} }) {
    const t = nowIso();
    this.db.prepare(`INSERT INTO projects(id,title,description,graph_version,created_at,updated_at,metadata_json)
      VALUES(?,?,?,?,?,?,?)`).run(id, title || id, description, 1, t, t, j(metadata));
    this.event({ project_id: id, kind: 'project.created', actor: 'system', entity_id: id, data: { title } });
    return this.getProject(id);
  }

  getProject(id) {
    const r = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    return r ? this.mapProject(r) : null;
  }
  listProjects() { return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(r => this.mapProject(r)); }
  mapProject(r) { return { ...r, metadata: p(r.metadata_json, {}), metadata_json: undefined }; }

  requireProject(id) {
    const pr = this.getProject(id);
    if (!pr) { const e = new Error(`Project not found: ${id}`); e.code = 'PROJECT_NOT_FOUND'; throw e; }
    return pr;
  }

  bumpGraphVersion(projectId) {
    const t = nowIso();
    this.db.prepare('UPDATE projects SET graph_version=graph_version+1, updated_at=? WHERE id=?').run(t, projectId);
    return this.getProject(projectId).graph_version;
  }

  assertGraphVersion(projectId, expected) {
    const p = this.requireProject(projectId);
    if (expected != null && p.graph_version !== expected) {
      const e = new Error(`Graph version conflict: expected ${expected}, current ${p.graph_version}`);
      e.code = 'GRAPH_VERSION_CONFLICT'; e.current_graph_version = p.graph_version; throw e;
    }
    return p;
  }

  insertNode(n) {
    const t = nowIso();
    const node = {
      id: n.id || newId(n.type === 'edge_case' ? 'edgecase' : 'node'),
      project_id: n.project_id,
      type: n.type || 'feature',
      title: n.title,
      description: n.description || '',
      origin: n.origin || 'user_or_plan',
      status: n.status || 'active',
      implemented: !!n.implemented,
      implementation_state: n.implementation_state || (n.implemented ? 'implemented' : 'not_implemented'),
      verification_state: n.verification_state || 'unverified',
      source_claimed_implemented: !!n.source_claimed_implemented,
      disposition: n.disposition ?? null,
      parent_id: n.parent_id ?? null,
      commit_sha: n.commit_sha ?? null,
      version: n.version || 1,
      created_at: n.created_at || t,
      updated_at: n.updated_at || t,
      implemented_at: n.implemented ? (n.implemented_at || t) : null,
      verified_at: n.verified_at ?? null,
      last_invalidated_at: n.last_invalidated_at ?? null,
      metadata: n.metadata || {}
    };
    this.db.prepare(`INSERT INTO nodes(id,project_id,type,title,description,origin,status,implemented,implementation_state,verification_state,
      source_claimed_implemented,disposition,parent_id,commit_sha,version,created_at,updated_at,implemented_at,verified_at,last_invalidated_at,metadata_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      node.id,node.project_id,node.type,node.title,node.description,node.origin,node.status,node.implemented?1:0,node.implementation_state,node.verification_state,
      node.source_claimed_implemented?1:0,node.disposition,node.parent_id,node.commit_sha,node.version,node.created_at,node.updated_at,node.implemented_at,node.verified_at,node.last_invalidated_at,j(node.metadata)
    );
    return this.getNode(node.id);
  }

  getNode(id) { const r=this.db.prepare('SELECT * FROM nodes WHERE id=?').get(id); return r?this.mapNode(r):null; }
  listNodes(projectId, { types = null, status = null } = {}) {
    let sql='SELECT * FROM nodes WHERE project_id=?', args=[projectId];
    if (types?.length) { sql += ` AND type IN (${types.map(()=>'?').join(',')})`; args.push(...types); }
    if (status) { sql += ' AND status=?'; args.push(status); }
    sql += ' ORDER BY created_at,id';
    return this.db.prepare(sql).all(...args).map(r=>this.mapNode(r));
  }
  mapNode(r) { return { ...r, implemented: !!r.implemented, source_claimed_implemented: !!r.source_claimed_implemented, metadata: p(r.metadata_json, {}), metadata_json: undefined }; }

  findNodeByNormalizedTitle(projectId, type, normalizedTitle, parentId = null) {
    const rows = this.listNodes(projectId, { types:[type] });
    return rows.find(n => normalizeTitle(n.title) === normalizedTitle && (parentId == null || n.parent_id === parentId)) || null;
  }

  updateNodeInTransaction(id, patch, expectedVersion = null) {
    const old = this.getNode(id);
    if (!old) { const e=new Error(`Node not found: ${id}`); e.code='NODE_NOT_FOUND'; throw e; }
    if (expectedVersion != null && old.version !== expectedVersion) { const e=new Error(`Node version conflict: expected ${expectedVersion}, current ${old.version}`); e.code='NODE_VERSION_CONFLICT'; e.current_node_version=old.version; throw e; }
    const merged = { ...old, ...patch, version: old.version + 1, updated_at: nowIso(), metadata: { ...old.metadata, ...(patch.metadata || {}) } };
    this.db.prepare(`UPDATE nodes SET title=?,description=?,origin=?,status=?,implemented=?,implementation_state=?,verification_state=?,
      source_claimed_implemented=?,disposition=?,parent_id=?,commit_sha=?,version=?,updated_at=?,implemented_at=?,verified_at=?,last_invalidated_at=?,metadata_json=? WHERE id=?`).run(
      merged.title,merged.description,merged.origin,merged.status,merged.implemented?1:0,merged.implementation_state,merged.verification_state,
      merged.source_claimed_implemented?1:0,merged.disposition,merged.parent_id,merged.commit_sha,merged.version,merged.updated_at,merged.implemented_at,merged.verified_at,merged.last_invalidated_at,j(merged.metadata),id
    );
    return this.getNode(id);
  }
  updateNode(id, patch, expectedVersion = null) {
    return this.tx(() => { const updated=this.updateNodeInTransaction(id,patch,expectedVersion); this.bumpGraphVersion(updated.project_id); return updated; });
  }

  insertEdge(e) {
    const edge = { id:e.id||newId('edge'), project_id:e.project_id, source_id:e.source_id, target_id:e.target_id, type:e.type||'depends_on', origin:e.origin||'system', created_at:e.created_at||nowIso(), metadata:e.metadata||{} };
    try {
      this.db.prepare('INSERT INTO edges(id,project_id,source_id,target_id,type,origin,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)')
        .run(edge.id,edge.project_id,edge.source_id,edge.target_id,edge.type,edge.origin,edge.created_at,j(edge.metadata));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return this.db.prepare('SELECT * FROM edges WHERE project_id=? AND source_id=? AND target_id=? AND type=?').get(edge.project_id,edge.source_id,edge.target_id,edge.type);
      throw err;
    }
    return edge;
  }
  listEdges(projectId) { return this.db.prepare('SELECT * FROM edges WHERE project_id=? ORDER BY created_at,id').all(projectId).map(r=>({...r,metadata:p(r.metadata_json,{}),metadata_json:undefined})); }

  createImportSession(s) {
    const t=nowIso(), id=s.id||newId('import');
    this.db.prepare('INSERT INTO import_sessions(id,project_id,file_name,source_hash,source_text,mode,status,expected_graph_version,created_at,updated_at,analysis_json,result_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,s.project_id,s.file_name||'plan.md',s.source_hash,s.source_text,s.mode||'preview_only',s.status||'analyzed',s.expected_graph_version,t,t,j(s.analysis||{}),s.result?j(s.result):null);
    return this.getImportSession(id);
  }
  getImportSession(id) { const r=this.db.prepare('SELECT * FROM import_sessions WHERE id=?').get(id); return r?this.mapImport(r):null; }
  listImportSessions(projectId) { return this.db.prepare('SELECT * FROM import_sessions WHERE project_id=? ORDER BY created_at DESC').all(projectId).map(r=>this.mapImport(r)); }
  mapImport(r) { return {...r,analysis:p(r.analysis_json,{}),result:p(r.result_json,null),analysis_json:undefined,result_json:undefined,source_text:undefined}; }
  getImportSource(id) { const r=this.db.prepare('SELECT source_text FROM import_sessions WHERE id=?').get(id); return r?.source_text ?? null; }
  updateImportSession(id, patch) {
    const current=this.db.prepare('SELECT * FROM import_sessions WHERE id=?').get(id); if(!current) return null;
    const analysis = patch.analysis ?? p(current.analysis_json,{}); const result=patch.result ?? p(current.result_json,null);
    this.db.prepare('UPDATE import_sessions SET mode=?,status=?,updated_at=?,analysis_json=?,result_json=? WHERE id=?').run(
      patch.mode??current.mode,patch.status??current.status,nowIso(),j(analysis),result?j(result):null,id);
    return this.getImportSession(id);
  }

  createSemanticRun(input) {
    const t=nowIso(), id=input.id||newId('semantic');
    this.db.prepare('INSERT INTO semantic_runs(id,project_id,source_import_id,source_hash,snapshot_graph_version,scope,status,brief_json,proposal_json,diff_json,created_at,updated_at,committed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id,input.project_id,input.source_import_id??null,input.source_hash,input.snapshot_graph_version,input.scope||'project',input.status||'prepared',j(input.brief||{}),input.proposal?j(input.proposal):null,input.diff?j(input.diff):null,t,t,input.committed_at??null
    );
    return this.getSemanticRun(id);
  }
  getSemanticRun(id) { const r=this.db.prepare('SELECT * FROM semantic_runs WHERE id=?').get(id); return r?this.mapSemanticRun(r):null; }
  listSemanticRuns(projectId) { return this.db.prepare('SELECT * FROM semantic_runs WHERE project_id=? ORDER BY created_at DESC').all(projectId).map(r=>this.mapSemanticRun(r)); }
  mapSemanticRun(r) { return {...r,brief:p(r.brief_json,{}),proposal:p(r.proposal_json,null),diff:p(r.diff_json,null),brief_json:undefined,proposal_json:undefined,diff_json:undefined}; }
  updateSemanticRun(id, patch) {
    const old=this.getSemanticRun(id); if(!old){const e=new Error('Semantic run not found');e.code='SEMANTIC_RUN_NOT_FOUND';throw e;}
    const next={...old,...patch,brief:patch.brief??old.brief,proposal:patch.proposal??old.proposal,diff:patch.diff??old.diff,updated_at:nowIso()};
    this.db.prepare('UPDATE semantic_runs SET source_import_id=?,source_hash=?,snapshot_graph_version=?,scope=?,status=?,brief_json=?,proposal_json=?,diff_json=?,updated_at=?,committed_at=? WHERE id=?').run(
      next.source_import_id,next.source_hash,next.snapshot_graph_version,next.scope,next.status,j(next.brief||{}),next.proposal?j(next.proposal):null,next.diff?j(next.diff):null,next.updated_at,next.committed_at??null,id
    );
    return this.getSemanticRun(id);
  }
  markSemanticRunsStale(projectId, sourceHash) {
    const t=nowIso(); this.db.prepare("UPDATE semantic_runs SET status='stale',updated_at=? WHERE project_id=? AND status IN ('prepared','staged','committed') AND source_hash<>?").run(t,projectId,sourceHash);
  }
  deleteSemanticEdges(projectId, sourceIds) {
    if(!sourceIds.length)return; const marks=sourceIds.map(()=>'?').join(',');
    this.db.prepare(`DELETE FROM edges WHERE project_id=? AND source_id IN (${marks}) AND origin='semantic_codex'`).run(projectId,...sourceIds);
  }

  insertStarterEvaluation(e) {
    const id=e.id||newId('starter');
    this.db.prepare(`INSERT INTO starter_evaluations(id,project_id,import_session_id,pack_id,pack_version,capability_key,edge_case_key,disposition,reason,node_id,created_at,metadata_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,e.project_id,e.import_session_id??null,e.pack_id,e.pack_version||'1.0.0',e.capability_key??null,e.edge_case_key??null,e.disposition,e.reason||'',e.node_id??null,nowIso(),j(e.metadata||{}));
    return id;
  }
  listStarterEvaluations(projectId, importSessionId=null) {
    const rows=importSessionId?this.db.prepare('SELECT * FROM starter_evaluations WHERE project_id=? AND import_session_id=? ORDER BY created_at').all(projectId,importSessionId):this.db.prepare('SELECT * FROM starter_evaluations WHERE project_id=? ORDER BY created_at').all(projectId);
    return rows.map(r=>({...r,metadata:p(r.metadata_json,{}),metadata_json:undefined}));
  }

  event(e) {
    const id=e.id||newId('evt');
    this.db.prepare('INSERT INTO events(id,project_id,user_id,kind,actor,entity_id,created_at,data_json) VALUES(?,?,?,?,?,?,?,?)')
      .run(id,e.project_id??null,e.user_id??null,e.kind,e.actor||'system',e.entity_id??null,nowIso(),j(e.data||{}));
    return id;
  }
  listEvents({project_id=null,user_id=null,limit=100}={}) {
    if(project_id) return this.db.prepare('SELECT * FROM events WHERE project_id=? ORDER BY created_at DESC LIMIT ?').all(project_id,limit).map(this.mapEvent);
    if(user_id) return this.db.prepare('SELECT * FROM events WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(user_id,limit).map(this.mapEvent);
    return this.db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?').all(limit).map(this.mapEvent);
  }
  mapEvent(r){return {...r,data:p(r.data_json,{}),data_json:undefined};}

  insertMemory(m) {
    const t=nowIso(), id=m.id||newId('mem');
    this.db.prepare(`INSERT INTO memories(id,user_id,kind,subject,value,scope,project_id,confidence,salience,state,supersedes_id,source,created_at,updated_at,metadata_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,m.user_id,m.kind||'note',m.subject??null,String(m.value),m.scope||'global',m.project_id??null,m.confidence??0.8,m.salience??0.5,m.state||'active',m.supersedes_id??null,m.source??null,t,t,j(m.metadata||{}));
    this.event({user_id:m.user_id,project_id:m.project_id,kind:'memory.created',actor:'user_or_model',entity_id:id,data:{kind:m.kind,subject:m.subject}});
    return this.getMemory(id);
  }
  getMemory(id){const r=this.db.prepare('SELECT * FROM memories WHERE id=?').get(id);return r?this.mapMemory(r):null;}
  listMemories(userId,{projectId=null,includeInactive=false,query=null,limit=200}={}){
    let sql='SELECT * FROM memories WHERE user_id=?',args=[userId];
    if(!includeInactive) sql+=' AND state=\'active\'';
    if(projectId) { sql+=' AND (project_id IS NULL OR project_id=?)'; args.push(projectId); }
    if(query) { sql+=' AND (lower(value) LIKE ? OR lower(subject) LIKE ?)'; const q=`%${query.toLowerCase()}%`;args.push(q,q); }
    sql+=' ORDER BY salience DESC, confidence DESC, updated_at DESC LIMIT ?';args.push(limit);
    return this.db.prepare(sql).all(...args).map(r=>this.mapMemory(r));
  }
  mapMemory(r){return {...r,metadata:p(r.metadata_json,{}),metadata_json:undefined};}
  updateMemory(id,patch){
    const old=this.getMemory(id); if(!old){const e=new Error(`Memory not found: ${id}`);e.code='MEMORY_NOT_FOUND';throw e;}
    const m={...old,...patch,metadata:{...old.metadata,...(patch.metadata||{})},updated_at:nowIso()};
    this.db.prepare('UPDATE memories SET kind=?,subject=?,value=?,scope=?,project_id=?,confidence=?,salience=?,state=?,supersedes_id=?,source=?,updated_at=?,metadata_json=? WHERE id=?').run(m.kind,m.subject,m.value,m.scope,m.project_id,m.confidence,m.salience,m.state,m.supersedes_id,m.source,m.updated_at,j(m.metadata),id);
    return this.getMemory(id);
  }
}

export function normalizeTitle(s='') {
  return String(s).toLowerCase().replace(/[`*_#>\[\]():]/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
}
