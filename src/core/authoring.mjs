import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { newId, nowIso } from './db.mjs';
import { importanceScale, requireValue } from './workspace.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value;
const keyPattern = /^[a-z][a-z0-9._-]{2,80}$/;
const check = (condition, message, code = 'AUTHORING_VALIDATION_ERROR') => requireValue(condition, message, code);
export const AUTHORING_INSTRUCTIONS = 'When the user says use lsg, @lsg, or run lsg, use LSG tools. FIRST call solution.start_plan_graph_workflow with the existing master-plan path and intended workspace_directory. A canonical directory is one project and may contain many sources. Registration saves original evidence only and creates no features or edge cases. Read EVERY source through solution.read_plan_source, paging until all line ranges are read. Codex alone authors the architectures, bounded features, children, edge cases, acceptance criteria, dependencies, coverage ledger and meaningful Markdown implementation plans for EVERY feature and edge case. Use source_citations (source_id, source_hash, start_line, end_line); label unsupported ideas proposed_gap. Use solution.stage_authoring_batch with stable batch keys for resumable bounded batches. Then solution.finalize_plan_graph_workflow publishes atomically by default; review_only=true is the explicit opt-out. Never mark authored work implemented or verified. Confirm solution.get_authoring_status, solution.get_semantic_feature_list and solution.get_frontier, report architecture/feature/edge-case counts, and verify zero missing plans. Use solution.list_architectures, solution.get_architecture_context and solution.run_program for compact queries. Templates provide architecture structure and guidance, never preset features or application code.';

export const FULLSTACK_TEMPLATE = {
  id: 'fullstack-typescript-aspnet-mysql', title: 'TypeScript / ASP.NET / MySQL full stack',
  architectures: [
    { key: 'frontend', title: 'TypeScript frontend', technology: 'TypeScript', directories: ['frontend'], guidance: 'Author UI states, accessibility, client routing, API consumers and client tests from the source.' },
    { key: 'backend', title: 'ASP.NET / C# backend', technology: 'ASP.NET / C#', directories: ['backend'], guidance: 'Author API contracts, authorization, validation, business logic, integration tests and deployment from the source.' },
    { key: 'database', title: 'MySQL database', technology: 'MySQL', directories: ['database'], guidance: 'Author schemas, constraints, migrations, transactions, recovery and database tests from the source.' }
  ],
  guidance: 'Trace API contracts across frontend/backend; trace data ownership and schema migrations across backend/database. Cover integration, security, deployment and validation. Unsupported recommendations are proposed_gap, never source facts.'
};

export class Authoring {
  constructor(service) { this.service = service; this.store = service.store; this.workspace = service.workspace; }
  records(kind, project) { return this.workspace.records(kind, project); }
  get(kind, id, project) { const item = this.workspace.record(kind, id); check(item && item.project_id === project, `${kind} not found`, 'NOT_FOUND'); return item; }
  put(kind, item) { return this.workspace.put(kind, item.id, item.project_id, item); }
  sourceInfo(source) { const { markdown, ...info } = source; return info; }
  resolve(input) {
    check(input.working_directory, 'working_directory is required', 'INVALID_ARGUMENT');
    const supplied=fs.realpathSync(path.resolve(input.working_directory));
    const directory = fs.statSync(supplied).isFile()?path.dirname(supplied):supplied;
    check(fs.statSync(directory).isDirectory(), 'Workspace must be a directory', 'INVALID_ARGUMENT');
    const workspaceKey = canonical(directory);
    let project;
    if (input.project_id) {
      project = this.store.getProject(input.project_id);
      if(project)
      check(!project.metadata.workspace_key || project.metadata.workspace_key === workspaceKey, 'Project is bound to a different workspace', 'WORKSPACE_CONFLICT');
    } else {
      const matches = this.store.listProjects().filter(p => canonical(p.metadata.workspace_root || '') === workspaceKey);
      check(matches.length <= 1, 'Multiple legacy projects share this directory; supply project_id. Projects are never silently merged.', 'AMBIGUOUS_PROJECT');
      project = matches[0];
    }
    let repositoryRoot = directory;
    while (!fs.existsSync(path.join(repositoryRoot, '.git'))) { const parent = path.dirname(repositoryRoot); if (parent === repositoryRoot) { repositoryRoot = null; break; } repositoryRoot = parent; }
    const created=!project;
    if (!project) project = this.store.createProject({ id: input.project_id || `workspace-${hash(workspaceKey).slice(0,20)}`, title: input.project_title || path.basename(directory), metadata: { workspace_root: directory, workspace_key: workspaceKey, repository_root: repositoryRoot, authoring_mode: 'codex' } });
    else project = this.store.updateProjectMetadata(project.id, { workspace_root: directory, workspace_key: workspaceKey, repository_root: repositoryRoot, authoring_mode: 'codex' });
    return { project, workspace_root: directory, workspace_key: workspaceKey, created };
  }
  register(input) {
    check(input.plan_file_path || input.markdown, 'An existing Markdown path or uploaded Markdown source is required', 'PLAN_PATH_REQUIRED');
    let planPath, markdown, directory;
    if (input.plan_file_path) {
      planPath = fs.realpathSync(path.resolve(this.service.workspaceRoot, input.plan_file_path));
      check(path.extname(planPath).toLowerCase() === '.md' && fs.statSync(planPath).isFile(), 'Source must be a Markdown file', 'INVALID_ARGUMENT');
      check(fs.statSync(planPath).size <= 2 * 1024 * 1024, 'Source exceeds 2 MiB', 'FILE_TOO_LARGE');
      markdown = fs.readFileSync(planPath, 'utf8');
      directory = input.workspace_directory || path.dirname(planPath);
    } else {
      check(input.workspace_directory && input.file_name?.toLowerCase().endsWith('.md'), 'Uploaded Markdown requires workspace_directory and file_name', 'INVALID_ARGUMENT');
      check(path.basename(input.file_name) === input.file_name, 'Upload filename must not contain directories', 'INVALID_ARGUMENT');
      markdown = String(input.markdown); directory = input.workspace_directory;
    }
    check(markdown.trim() && Buffer.byteLength(markdown) <= 2 * 1024 * 1024, 'Source is empty or exceeds 2 MiB', 'INVALID_ARGUMENT');
    const lines = markdown.split(/\r?\n/);
    check(lines.every(line => Buffer.byteLength(line) <= 32768), 'Source contains a line exceeding the 32 KiB reading limit', 'SOURCE_LINE_TOO_LARGE');
    const resolved = this.resolve({ working_directory: path.resolve(this.service.workspaceRoot, directory), project_id: input.project_id, project_title: input.project_title });
    const project = resolved.project;
    if (planPath) check(planPath === resolved.workspace_root || planPath.startsWith(resolved.workspace_root + path.sep), 'Source is outside the chosen workspace', 'FILE_ACCESS_DENIED');
    const sourceKey = canonical(planPath || path.join(resolved.workspace_root, input.file_name));
    const id = `source-${hash(project.id + ':' + sourceKey).slice(0,24)}`;
    const previous = this.workspace.record('plan_source', id), sourceHash = hash(markdown);
    if (!previous || previous.source_hash !== sourceHash) {
      this.store.tx(() => {
        const source = { id, project_id: project.id, source_path: planPath || null, source_key: sourceKey, file_name: path.basename(planPath || input.file_name), source_hash: sourceHash, version: (previous?.version || 0) + 1, line_count: lines.length, markdown, updated_at: nowIso() };
        if (previous) this.put('plan_source_revision', { ...previous, source_id: id, id: `${id}:v${previous.version}` });
        this.put('plan_source', source);
        for (const node of this.store.listNodes(project.id)) if (node.metadata.source_citations?.some(c => c.source_id === id)) this.store.updateNodeInTransaction(node.id, { verification_state: 'stale', verified_at: null, last_invalidated_at: nowIso() });
        for (const run of this.records('authoring_run', project.id)) if (['prepared','staged'].includes(run.status)) this.put('authoring_run', { ...run, status: 'stale' });
        this.store.bumpGraphVersion(project.id);
      });
    }
    const run = this.prepare({ project_id: project.id, architecture_keys: input.architecture_keys });
    return { status: 'prepared', project: this.store.requireProject(project.id), workspace_root: resolved.workspace_root, source: this.sourceInfo(this.get('plan_source', id, project.id)), run_id: run.run_id, sources: run.sources, instructions: AUTHORING_INSTRUCTIONS, reused: !!previous && previous.source_hash === sourceHash };
  }
  prepare(input) {
    const project = this.store.requireProject(input.project_id), sources = this.records('plan_source', project.id);
    check(sources.length, 'Register at least one original plan source', 'AUTHORING_SOURCE_REQUIRED');
    const keys = input.architecture_keys || [];
    check(new Set(keys).size === keys.length, 'Duplicate architecture scope');
    const run = { id: newId('authoring'), project_id: project.id, status: 'prepared', graph_version: project.graph_version, scale_version: importanceScale(this.store).version, source_versions: sources.map(s => ({ id: s.id, source_hash: s.source_hash, version: s.version })), architecture_keys: keys, read_ranges: {}, created_at: nowIso() };
    this.put('authoring_run', run);
    return { run_id: run.id, status: run.status, sources: sources.map(s => this.sourceInfo(s)), importance_scale: importanceScale(this.store), instructions: AUTHORING_INSTRUCTIONS };
  }
  current(input) {
    const run = this.get('authoring_run', input.run_id, input.project_id), project = this.store.requireProject(input.project_id);
    check(['prepared','staged'].includes(run.status), 'Authoring run is not open; prepare a fresh run', 'AUTHORING_RUN_STALE');
    check(project.graph_version === run.graph_version && importanceScale(this.store).version === run.scale_version, 'Graph or importance scale changed; prepare a fresh run', 'AUTHORING_RUN_STALE');
    for (const snapshot of run.source_versions) { const source = this.get('plan_source', snapshot.id, project.id); check(source.source_hash === snapshot.source_hash && source.version === snapshot.version, 'Source changed since preparation', 'AUTHORING_RUN_STALE'); if(source.source_path)check(fs.existsSync(source.source_path)&&hash(fs.readFileSync(source.source_path,'utf8'))===source.source_hash,'Source file changed on disk; register the updated version','AUTHORING_RUN_STALE'); }
    check(this.records('plan_source', project.id).length === run.source_versions.length, 'Source collection changed', 'AUTHORING_RUN_STALE');
    return run;
  }
  read(input) {
    const run = this.current(input), source = this.get('plan_source', input.source_id, input.project_id);
    check(run.source_versions.some(s => s.id === source.id), 'Source is outside this run');
    let start = input.start_line || 1;
    if (input.cursor) { let cursor; try { cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString()); } catch { check(false, 'Invalid reading cursor', 'STALE_CURSOR'); } check(cursor.run_id === run.id && cursor.source_id === source.id && cursor.source_hash === source.source_hash, 'Cursor does not match source/run', 'STALE_CURSOR'); start = cursor.next_line; }
    check(Number.isInteger(start) && start >= 1 && start <= source.line_count, 'Invalid starting line');
    const lines = source.markdown.split(/\r?\n/), limit = Math.min(300, Math.max(1, input.limit || 120)); let end = start - 1, bytes = 0;
    while (end < lines.length && end < start + limit - 1) { const size = Buffer.byteLength(lines[end]) + 1; if (bytes && bytes + size > 32768) break; bytes += size; end++; }
    run.read_ranges[source.id] = [...(run.read_ranges[source.id] || []), [start, end]]; this.put('authoring_run', run);
    return { source_id: source.id, source_hash: source.source_hash, version: source.version, start_line: start, end_line: end, line_count: source.line_count, markdown: lines.slice(start - 1, end).join('\n'), next_cursor: end < lines.length ? Buffer.from(JSON.stringify({ run_id: run.id, source_id: source.id, source_hash: source.source_hash, next_line: end + 1 })).toString('base64url') : null };
  }
  stage(input) {
    const run = this.current(input), key = input.batch_key;
    check(keyPattern.test(key || ''), 'batch_key must be a stable key');
    const proposal = input.proposal;
    check(proposal && typeof proposal === 'object' && !Array.isArray(proposal), 'proposal must be an object');
    check(Buffer.byteLength(JSON.stringify(proposal)) <= 1024 * 1024, 'Batch exceeds 1 MiB');
    check(Array.isArray(proposal.features) && proposal.features.length <= 100, 'Batch supports up to 100 features');
    const id = `${run.id}:${key}`, previous = this.workspace.record('authoring_batch', id);
    this.put('authoring_batch', { id, project_id: input.project_id, run_id: run.id, batch_key: key, proposal, updated_at: nowIso() });
    this.put('authoring_run', { ...run, status: 'staged' });
    return { run_id: run.id, batch_key: key, status: 'staged', replaced: !!previous, feature_count: proposal.features.length, next: 'Stage remaining batches, then call solution.finalize_plan_graph_workflow.' };
  }
  covered(ranges, total) { const sorted = ranges.slice().sort((a,b) => a[0]-b[0]); let last = 0; for (const [start,end] of sorted) { if (start > last + 1) return false; last = Math.max(last, end); } return last >= total; }
  validate(run) {
    const batches = this.records('authoring_batch', run.project_id).filter(b => b.run_id === run.id).sort((a,b) => a.batch_key.localeCompare(b.batch_key));
    const architectures = batches.flatMap(b => b.proposal.architectures || []), features = batches.flatMap(b => b.proposal.features || []), ledger = batches.flatMap(b => b.proposal.coverage || []);
    check(features.length > 0, 'Empty graph is incomplete', 'AUTHORING_INCOMPLETE');
    const knownArchitectures = new Map(this.listArchitectures({ project_id: run.project_id }).architectures.map(a => [a.key,a]));
    const architectureKeys = new Set();
    for (const architecture of architectures) { check(keyPattern.test(architecture.key || '') && !architectureKeys.has(architecture.key) && architecture.title?.trim() && architecture.technology?.trim(), 'Invalid or duplicate architecture');if(run.architecture_keys.length)check(run.architecture_keys.includes(architecture.key),'Architecture definition is outside update scope');architectureKeys.add(architecture.key); check((architecture.directories || []).every(d => typeof d === 'string' && d && !path.isAbsolute(d) && !d.includes(':') && !d.split(/[\\/]/).includes('..')), 'Architecture directories must be relative workspace paths'); knownArchitectures.set(architecture.key, architecture); }
    const existing = new Map(this.store.listNodes(run.project_id).filter(n => n.status === 'active' && n.metadata.layer === 'semantic').map(n => [n.metadata.semantic_key,n]));
    const retained = key => { const node=existing.get(key);return node?.type==='feature' && run.architecture_keys.length>0 && !run.architecture_keys.includes(node.metadata.architecture_key); };
    const keys = new Set(), byKey = new Map();
    const validatePlan = (markdown, key) => check(typeof markdown === 'string' && markdown.trim().length >= 120 && /^#{1,3}\s+.+/m.test(markdown) && /^#{1,3}\s+.*(validation|test|acceptance)/im.test(markdown), `${key} needs a substantive Markdown implementation plan with validation`, 'MISSING_IMPLEMENTATION_PLAN');
    const validateCitations = (citations, gap, key) => { check(Array.isArray(citations) && (gap || citations.length > 0), `${key} requires source_citations`); for (const citation of citations) { const source = this.get('plan_source', citation.source_id, run.project_id); check(citation.source_hash === source.source_hash && Number.isInteger(citation.start_line) && Number.isInteger(citation.end_line) && citation.start_line >= 1 && citation.end_line >= citation.start_line && citation.end_line <= source.line_count, `${key} has a stale or invalid source citation`, 'INVALID_SOURCE_CITATION'); } };
    for (const feature of features) {
      check(keyPattern.test(feature.key || '') && !keys.has(feature.key), 'Duplicate or invalid semantic feature key'); keys.add(feature.key); byKey.set(feature.key,feature);
      check(feature.title?.trim() && feature.outcome?.trim(), `${feature.key} requires title and outcome`);
      const old = existing.get(feature.key);
      if (old?.metadata.importance_override) { feature.priority = old.metadata.priority; feature.importance_rationale = old.metadata.importance_rationale; }
      check(importanceScale(this.store).levels.some(l => l.id === feature.priority) && feature.importance_rationale?.trim(), `${feature.key} requires current priority and rationale`);
      check(Array.isArray(feature.acceptance_criteria) && feature.acceptance_criteria.length && feature.acceptance_criteria.every(x => typeof x === 'string' && x.trim()), `${feature.key} requires acceptance criteria`);
      validateCitations(feature.source_citations || [], feature.proposed_gap === true, feature.key); validatePlan(feature.implementation_plan, feature.key);
    }
    const visiting = new Set(), done = new Set();
    const architectureOf = feature => { if (done.has(feature.key)) return feature.architecture_key; check(!visiting.has(feature.key), 'Feature hierarchy cycle', 'SEMANTIC_DEPENDENCY_CYCLE'); visiting.add(feature.key); if (feature.parent_key) { const parent = byKey.get(feature.parent_key); check(parent, 'Child requires its parent in the proposal'); const key = architectureOf(parent); check(!feature.architecture_key || feature.architecture_key === key, 'Child architecture must match parent'); feature.architecture_key = key; } check(knownArchitectures.has(feature.architecture_key), `${feature.key} requires a known architecture`); if (run.architecture_keys.length) check(run.architecture_keys.includes(feature.architecture_key), 'Feature is outside the architecture update scope'); visiting.delete(feature.key); done.add(feature.key); return feature.architecture_key; };
    features.forEach(architectureOf);
    visiting.clear(); done.clear();
    const edges=this.store.listEdges(run.project_id),oldById=new Map([...existing.values()].map(n=>[n.id,n]));
    const visitDependency = key => { check(!visiting.has(key), 'Dependency cycle', 'SEMANTIC_DEPENDENCY_CYCLE'); if (done.has(key)) return; visiting.add(key); const feature=byKey.get(key),old=existing.get(key),dependencies=feature ? feature.depends_on || [] : edges.filter(e=>e.type==='depends_on'&&e.source_id===old?.id).map(e=>oldById.get(e.target_id)?.metadata.semantic_key);for(const dependency of dependencies){check(byKey.has(dependency)||retained(dependency),`Unknown or superseded dependency ${dependency}`);visitDependency(dependency);}visiting.delete(key);done.add(key);};
    features.forEach(f => visitDependency(f.key));
    for(const [key] of existing)if(retained(key))visitDependency(key);
    const allKeys = new Set(keys);
    for(const feature of features)for(let i=1;i<=feature.acceptance_criteria.length;i++){const key=`${feature.key}.acceptance.${i}`;check(!allKeys.has(key),'Feature key collides with an acceptance test');allKeys.add(key);}
    for (const feature of features) for (const edgeCase of feature.edge_cases || []) { check(keyPattern.test(edgeCase.key || '') && !allKeys.has(edgeCase.key), 'Duplicate edge-case key'); allKeys.add(edgeCase.key); for (const field of ['title','trigger','expected_behavior','validation_scenario']) check(edgeCase[field]?.trim(), `Edge case requires ${field}`); check(['critical','high','medium','low'].includes(edgeCase.severity), 'Invalid severity'); validatePlan(edgeCase.implementation_plan, edgeCase.key); validateCitations(edgeCase.source_citations || feature.source_citations || [], edgeCase.proposed_gap === true || feature.proposed_gap === true, edgeCase.key); }
    for(const node of existing.values()){
      const userCase=node.type==='edge_case'&&node.metadata.semantic_key?.includes('.user_edge_case.')&&keys.has(node.metadata.feature_key);
      const outside=run.architecture_keys.length&&!run.architecture_keys.includes(node.metadata.architecture_key);
      if((userCase||outside)&&['feature','edge_case'].includes(node.type)&&!node.metadata.semantic_root)check(this.store.getNodeDocument(node.id)?.markdown?.trim(),`Retained ${node.metadata.display_id} has no Markdown plan`,'MISSING_IMPLEMENTATION_PLAN');
    }
    const ledgerRanges = new Map(run.source_versions.map(s => [s.id,[]]));
    for (const entry of ledger) { validateCitations([entry], false, 'Coverage ledger'); check(['feature','excluded','question'].includes(entry.disposition), 'Invalid ledger disposition'); if (entry.disposition === 'feature') check((entry.feature_keys || []).length && entry.feature_keys.every(key => byKey.has(key) || retained(key)), 'Ledger requires published or retained feature keys'); else check(entry.reason?.trim(), 'Exclusions and unresolved questions require reasons'); ledgerRanges.get(entry.source_id).push([entry.start_line,entry.end_line]); }
    for (const source of this.records('plan_source',run.project_id)) { check(this.covered(run.read_ranges[source.id] || [], source.line_count), `Unread source lines: ${source.file_name}`, 'SOURCE_NOT_FULLY_READ'); check(this.covered(ledgerRanges.get(source.id) || [], source.line_count), `Uncovered source lines: ${source.file_name}`, 'SOURCE_COVERAGE_INCOMPLETE'); }
    return { architectures, features, ledger, existing };
  }
  finalize(input) {
    const previous=this.get('authoring_run',input.run_id,input.project_id);
    if(previous.status==='committed')return {...previous.summary,status:'committed',published:true,already_committed:true,graph_version:previous.committed_graph_version,missing_plans:this.service.getImplementationPlanCoverage({project_id:input.project_id}).missing_plan};
    const run = this.current(input), proposal = this.validate(run);
    const summary = { run_id: run.id, architecture_count: new Set(proposal.features.map(f => f.architecture_key)).size, feature_count: proposal.features.length, edge_case_count: proposal.features.reduce((n,f) => n+(f.edge_cases || []).length,0) };
    if (input.review_only === true) { this.put('authoring_run', { ...run, status:'staged', review:summary }); return { ...summary, status:'staged', published:false }; }
    const result = this.store.tx(() => {
      const project = this.store.requireProject(run.project_id), nodes = this.store.listNodes(project.id), allByKey = new Map(nodes.filter(n => n.metadata.semantic_key).map(n => [n.metadata.semantic_key,n]));
      for (const architecture of proposal.architectures) this.put('architecture', { ...architecture, id:`${project.id}:${architecture.key}`, project_id:project.id, updated_at:nowIso() });
      const numbers = new Map(), used = new Set(nodes.map(n => n.metadata.display_id).filter(Boolean)); let next = Math.max(0,...nodes.map(n => /^F\d+$/.test(n.metadata.display_id || '') ? Number(n.metadata.display_id.slice(1)) : 0))+1;
      const byKey = new Map(proposal.features.map(f => [f.key,f]));
      const number = feature => { if (numbers.has(feature.key)) return numbers.get(feature.key); const old = allByKey.get(feature.key)?.metadata.display_id; const parentNumber=feature.parent_key?number(byKey.get(feature.parent_key)):null;let value=parentNumber?(old?.startsWith(parentNumber+'.')&&/^\d+$/.test(old.slice(parentNumber.length+1))?old:null):(/^F\d+$/.test(old||'')?old:null); if (!value) { if (feature.parent_key) { const parent = number(byKey.get(feature.parent_key)); let index=1; while(used.has(`${parent}.${index}`)) index++; value=`${parent}.${index}`; } else value=`F${next++}`; } used.add(value); numbers.set(feature.key,value); return value; }; proposal.features.forEach(number);
      const desired = new Set(), materialized = new Map();
      const upsert = (type,key,title,description,parentId,metadata,markdown) => {
        desired.add(key); const old = allByKey.get(key);
        check(!old || old.type === type, 'Semantic key changed node type');
        const patch={title,description,parent_id:parentId,status:'active',metadata:{layer:'semantic',semantic_key:key,authoring_run_id:run.id,...metadata}};
        const node=old ? this.store.updateNodeInTransaction(old.id,patch) : this.store.insertNode({project_id:project.id,type,origin:'semantic_codex',...patch});
        if(markdown) { const existingPlan=this.store.getNodeDocument(node.id); if(!existingPlan || existingPlan.markdown !== markdown || existingPlan.file_name!==`${node.metadata.display_id}-implementation-plan.md`) { this.store.upsertNodeDocument({project_id:project.id,node_id:node.id,file_name:`${node.metadata.display_id}-implementation-plan.md`,markdown,sha256:hash(markdown),expected_version:existingPlan?.version || 0,actor:'codex'}); if(old?.implemented) this.store.updateNodeInTransaction(node.id,{verification_state:'stale',verified_at:null,last_invalidated_at:nowIso()}); } }
        materialized.set(key,this.store.getNode(node.id)); return node;
      };
      const featureNode = feature => { if(materialized.has(feature.key)) return materialized.get(feature.key); const parent=feature.parent_key ? featureNode(byKey.get(feature.parent_key)) : null;
        return upsert('feature',feature.key,feature.title,feature.outcome,parent?.id || null,{display_id:numbers.get(feature.key),parent_semantic_key:feature.parent_key || null,architecture_key:feature.architecture_key,priority:feature.priority,importance_rationale:feature.importance_rationale,source_citations:feature.source_citations || [],proposed_gap:!!feature.proposed_gap,acceptance_criteria:feature.acceptance_criteria,non_goals:feature.non_goals || [],depends_on:feature.depends_on || []},feature.implementation_plan);
      }; proposal.features.forEach(featureNode);
      const affected = nodes.filter(n => n.metadata.layer==='semantic' && !n.metadata.semantic_root && (!run.architecture_keys.length || run.architecture_keys.includes(n.metadata.architecture_key)));
      const affectedIds = new Set([...affected.map(n=>n.id),...materialized.values()].map(n=>typeof n==='string'?n:n.id));
      for(const edge of this.store.listEdges(project.id)) if(affectedIds.has(edge.source_id) && ['contains','has_edge_case','validated_by','depends_on','derived_from'].includes(edge.type)) this.store.db.prepare('DELETE FROM edges WHERE id=?').run(edge.id);
      for(const feature of proposal.features) {
        const node=materialized.get(feature.key),metadata={architecture_key:feature.architecture_key,priority:feature.priority,source_citations:feature.source_citations || []};
        if(feature.parent_key) this.store.insertEdge({project_id:project.id,source_id:materialized.get(feature.parent_key).id,target_id:node.id,type:'contains',origin:'semantic_codex'});
        for(const dep of feature.depends_on || []) this.store.insertEdge({project_id:project.id,source_id:node.id,target_id:(materialized.get(dep)||proposal.existing.get(dep)).id,type:'depends_on',origin:'semantic_codex'});
        feature.acceptance_criteria.forEach((criterion,index)=>{const test=upsert('test',`${feature.key}.acceptance.${index+1}`,criterion,`Acceptance criterion for ${feature.title}`,node.id,{...metadata,feature_key:feature.key,criterion_index:index+1});this.store.insertEdge({project_id:project.id,source_id:node.id,target_id:test.id,type:'validated_by',origin:'semantic_codex'});});
        for(const ec of feature.edge_cases || []) { const old=allByKey.get(ec.key); if(old?.status==='deleted') continue; let display=old?.metadata.display_id;if(display&&!display.startsWith(node.metadata.display_id+'.E'))display=null; if(!display) { let index=1; while(used.has(`${node.metadata.display_id}.E${index}`)) index++; display=`${node.metadata.display_id}.E${index}`; used.add(display); }
          const edgeCase=upsert('edge_case',ec.key,old?.metadata.edge_case_override?old.title:ec.title,old?.metadata.edge_case_override?old.description:ec.expected_behavior,node.id,{...metadata,display_id:display,feature_key:feature.key,source_citations:ec.source_citations || feature.source_citations || [],trigger:old?.metadata.edge_case_override?old.metadata.trigger:ec.trigger,expected_behavior:old?.metadata.edge_case_override?old.metadata.expected_behavior:ec.expected_behavior,severity:ec.severity,validation_scenario:old?.metadata.edge_case_override?old.metadata.validation_scenario:ec.validation_scenario},ec.implementation_plan);this.store.insertEdge({project_id:project.id,source_id:node.id,target_id:edgeCase.id,type:'has_edge_case',origin:'semantic_codex'});
        }
      }
      for(const old of affected)if(old.status==='active'&&old.type==='edge_case'&&old.metadata.semantic_key?.includes('.user_edge_case.')&&materialized.has(old.metadata.feature_key)){
        desired.add(old.metadata.semantic_key);const parent=materialized.get(old.metadata.feature_key);this.store.updateNodeInTransaction(old.id,{parent_id:parent.id,metadata:{architecture_key:parent.metadata.architecture_key,priority:parent.metadata.priority}});this.store.insertEdge({project_id:project.id,source_id:parent.id,target_id:old.id,type:'has_edge_case',origin:'user_correction'});
      }
      for(const node of affected) if(node.status==='active' && !desired.has(node.metadata.semantic_key)) this.store.updateNodeInTransaction(node.id,{status:'superseded',metadata:{superseded_by_run:run.id}});
      const graphVersion=this.store.bumpGraphVersion(project.id);
      this.put('authoring_run',{...run,status:'committed',committed_graph_version:graphVersion,committed_at:nowIso(),coverage:proposal.ledger,summary});
      this.store.event({project_id:project.id,kind:'authoring.committed',actor:input.actor || 'codex',entity_id:run.id,data:summary});
      return {...summary,status:'committed',published:true,graph_version:graphVersion};
    });
    this.service.activity.emit(run.project_id,this.store.listNodes(run.project_id).filter(n=>n.metadata.authoring_run_id===run.id).map(n=>n.id),'plan_update','codex');
    return {...result,missing_plans:this.service.getImplementationPlanCoverage({project_id:run.project_id}).missing_plan};
  }
  status(input) {
    this.store.requireProject(input.project_id);
    const run=input.run_id ? this.get('authoring_run',input.run_id,input.project_id) : this.records('authoring_run',input.project_id)[0];
    const sources=this.records('plan_source',input.project_id).map(source=>({...this.sourceInfo(source),fully_read:!!run && run.source_versions.some(s=>s.id===source.id&&s.source_hash===source.source_hash&&s.version===source.version) && this.covered(run.read_ranges[source.id] || [],source.line_count),changed_on_disk:!!source.source_path&&(!fs.existsSync(source.source_path)||hash(fs.readFileSync(source.source_path,'utf8'))!==source.source_hash)}));
    const coverage=this.service.getImplementationPlanCoverage({project_id:input.project_id});
    return {project_id:input.project_id,run_id:run?.id || null,status:run?.status || 'not_started',sources,batches:run ? this.records('authoring_batch',input.project_id).filter(b=>b.run_id===run.id).map(b=>({batch_key:b.batch_key,features:b.proposal.features.length})) : [],missing_plans:coverage.missing_plan,complete:run?.status==='committed' && sources.every(s=>s.fully_read&&!s.changed_on_disk) && coverage.missing_plan===0};
  }
  listArchitectures(input) { this.store.requireProject(input.project_id); return {project_id:input.project_id,architectures:this.records('architecture',input.project_id).sort((a,b)=>a.key.localeCompare(b.key)).map(a=>({...a,feature_count:this.store.listNodes(input.project_id).filter(n=>n.status==='active'&&n.type==='feature'&&!n.metadata.semantic_root&&n.metadata.architecture_key===a.key).length}))}; }
  context(input) { const architecture=this.listArchitectures(input).architectures.find(a=>a.key===input.architecture_key); check(architecture,'Architecture not found','NOT_FOUND'); const counts=this.workspace.progress(input),remaining=this.workspace.remaining(input); return {architecture,counts:{features:counts.features_total,edge_cases:counts.edge_cases_total,...counts.counts},remaining:remaining.items.slice(0,Math.min(25,input.limit||10)),next:'Use architecture_key on feature, frontier and missing-plan queries.'}; }
  template(input) { check(input.template_id===FULLSTACK_TEMPLATE.id,'Unknown workflow template','NOT_FOUND'); return FULLSTACK_TEMPLATE; }
  applyTemplate(input) { const template=this.template(input),project=this.store.requireProject(input.project_id); const existing=new Set(this.listArchitectures(input).architectures.map(a=>a.key)); this.store.tx(()=>{for(const a of template.architectures) if(!existing.has(a.key)) this.put('architecture',{...a,id:`${project.id}:${a.key}`,project_id:project.id,template_id:template.id,updated_at:nowIso()}); if(template.architectures.some(a=>!existing.has(a.key))) this.store.bumpGraphVersion(project.id);}); return {...this.listArchitectures(input),guidance:template.guidance,features_created:0,next:'Prepare a fresh authoring run after applying the template.'}; }
  move(input) { const project=this.store.assertGraphVersion(input.project_id,input.expected_graph_version),node=this.workspace.node(input); check(node.type==='feature'&&!node.metadata.parent_semantic_key,'Move a root feature; children inherit its architecture'); check(this.listArchitectures(input).architectures.some(a=>a.key===input.architecture_key),'Unknown architecture'); const nodes=this.store.listNodes(project.id),byParent=new Map(); for(const n of nodes) {if(!byParent.has(n.parent_id))byParent.set(n.parent_id,[]);byParent.get(n.parent_id).push(n);} const changed=[]; this.store.tx(()=>{const visit=n=>{if(changed.includes(n.id))return;changed.push(n.id);this.store.updateNodeInTransaction(n.id,{metadata:{architecture_key:input.architecture_key}});for(const c of byParent.get(n.id)||[])visit(c);};visit(node);this.store.bumpGraphVersion(project.id);});return {project_id:project.id,architecture_key:input.architecture_key,moved_ids:changed}; }
}
