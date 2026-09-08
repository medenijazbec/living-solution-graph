import { newId, nowIso } from './db.mjs';

const priorities=['P0','P1','P2','P3'];
const severities=['critical','high','medium','low'];
const keyPattern=/^[a-z][a-z0-9._-]{2,80}$/;
const asArray=v=>Array.isArray(v)?v:[];
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=(message,code='SEMANTIC_VALIDATION_ERROR',extra={})=>{const e=new Error(message);e.code=code;Object.assign(e,extra);throw e;};

function latestCommittedImport(store,projectId){return store.listImportSessions(projectId).find(x=>x.status==='committed')||null;}
function sourceRef(node){return {id:node.id,type:node.type,title:node.title,parent_id:node.parent_id,source_lines:node.metadata?.source_lines||[]};}
function semanticNodes(store,projectId,{activeOnly=false}={}){return store.listNodes(projectId).filter(n=>n.metadata?.layer==='semantic'&&(!activeOnly||n.status==='active'));}
function keyMap(nodes){return new Map(nodes.filter(n=>n.metadata?.semantic_key).map(n=>[n.metadata.semantic_key,n]));}
function priorityOrder(a,b){return priorities.indexOf(a.metadata?.priority||'P3')-priorities.indexOf(b.metadata?.priority||'P3')||a.title.localeCompare(b.title);}
function displayOrder(a,b){const aa=String(a.metadata?.display_id||'').replace(/^F/i,'').split('.').map(Number),bb=String(b.metadata?.display_id||'').replace(/^F/i,'').split('.').map(Number);for(let i=0;i<Math.max(aa.length,bb.length);i++){const d=(aa[i]??-1)-(bb[i]??-1);if(d)return d;}return priorityOrder(a,b);}
function numberFeatures(features,existing){
  const existingNumbers=new Map([...existing.values()].filter(n=>n.type==='feature'&&!n.metadata?.semantic_root).map(n=>[n.metadata.semantic_key,n.metadata?.display_id]));
  const children=new Map();for(const f of features){const p=f.parent_key||null;if(!children.has(p))children.set(p,[]);children.get(p).push(f);}
  const usedTop=new Set([...existingNumbers.values()].filter(x=>/^F\d+$/.test(x||'')).map(x=>Number(x.slice(1))));let nextTop=Math.max(0,...usedTop)+1;const result=new Map();
  const assign=(parentKey,parentNumber)=>{let nextChild=1;for(const f of children.get(parentKey)||[]){const old=existingNumbers.get(f.key);let number;if(parentNumber===null){number=/^F\d+$/.test(old||'')?old:`F${nextTop++}`;}else{number=old?.startsWith(`${parentNumber}.`)?old:`${parentNumber}.${nextChild}`;nextChild++;}result.set(f.key,number);assign(f.key,number);}};
  assign(null,null);return result;
}

export class SemanticLayer {
  constructor(store){this.store=store;}

  prepare(input){
    const project=this.store.requireProject(input.project_id); const sourceImport=input.source_import_id?this.store.getImportSession(input.source_import_id):latestCommittedImport(this.store,project.id);
    if(!sourceImport||sourceImport.project_id!==project.id||sourceImport.status!=='committed')fail('A committed plan import is required before semantic discovery','SEMANTIC_SOURCE_REQUIRED');
    const scope=input.scope||'project'; const limit=Math.min(Math.max(Number(input.max_features||25),1),100); const sourceLimit=Math.min(Math.max(Number(input.source_node_limit||300),25),1000);
    const all=this.store.listNodes(project.id); const source=all.filter(n=>n.metadata?.layer!=='semantic'&&['feature','requirement','decision','risk','test','constraint','architecture_element'].includes(n.type)); const parentById=new Map(all.map(n=>[n.id,n]));
    const catalog=source.slice(0,sourceLimit).map(n=>({...sourceRef(n),parent_title:parentById.get(n.parent_id)?.title||null}));
    const active=semanticNodes(this.store,project.id,{activeOnly:true});
    const brief={project:{id:project.id,title:project.title,graph_version:project.graph_version},scope,source_import:{id:sourceImport.id,file_name:sourceImport.file_name,sha256:sourceImport.source_hash,line_count:sourceImport.analysis?.source?.line_count||null},source_node_catalog:catalog,source_node_count:source.length,existing_semantic_features:active.filter(n=>n.type==='feature'&&!n.metadata.semantic_root).map(n=>({id:n.id,key:n.metadata.semantic_key,number:n.metadata.display_id||null,parent_key:n.metadata.parent_semantic_key||null,title:n.title,priority:n.metadata.priority,status:n.status})),proposal_contract:{max_features:limit,features:[{key:'stable.semantic.key',parent_key:'optional parent feature key for F1.1-style decomposition',title:'Implementation unit title',priority:'P0|P1|P2|P3',outcome:'Player or system outcome',source_node_ids:['source node IDs from catalog or project'],acceptance_criteria:['Observable passing behavior'],non_goals:['Explicitly excluded work'],depends_on:['other feature keys'],edge_cases:[{key:'feature.case',title:'Failure title',trigger:'What causes the state',expected_behavior:'Safe expected behavior',severity:'critical|high|medium|low',validation_scenario:'How to prove it'}]}],rules:['Every non-gap feature must cite one or more lexical source nodes.','Use parent_key to decompose a broad feature into buildable child features.','Use proposed_gap=true only for an unsupported but useful discovery.','Keep feature units buildable and dependency-aware.','Do not mark implementation or verification state.']}};
    const run=this.store.createSemanticRun({project_id:project.id,source_import_id:sourceImport.id,source_hash:sourceImport.source_hash,snapshot_graph_version:project.graph_version,scope,status:'prepared',brief});
    this.store.event({project_id:project.id,kind:'semantic.prepared',actor:input.actor||'mcp',entity_id:run.id,data:{scope,source_import_id:sourceImport.id,max_features:limit}});
    return {run_id:run.id,status:run.status,brief};
  }

  validateProposal(projectId,proposal,maxFeatures=25){
    if(!object(proposal)||!Array.isArray(proposal.features))fail('proposal.features must be an array');
    if(proposal.features.length<1||proposal.features.length>maxFeatures)fail(`proposal.features must contain 1-${maxFeatures} features`);
    const projectNodes=new Map(this.store.listNodes(projectId).map(n=>[n.id,n])); const keys=new Set(); const normalized=[];
    for(const raw of proposal.features){
      if(!object(raw))fail('Each feature must be an object'); const key=String(raw.key||''); if(!keyPattern.test(key))fail(`Invalid semantic feature key: ${key}`); if(keys.has(key))fail(`Duplicate semantic feature key: ${key}`); keys.add(key);
      const proposedGap=raw.proposed_gap===true; const title=String(raw.title||'').trim(); const outcome=String(raw.outcome||'').trim(); if(!title||!outcome)fail(`Feature ${key} requires title and outcome`);
      const priority=String(raw.priority||'P2'); if(!priorities.includes(priority))fail(`Feature ${key} has invalid priority`);
      const sourceNodeIds=asArray(raw.source_node_ids).map(String); if(!proposedGap&&!sourceNodeIds.length)fail(`Feature ${key} requires source_node_ids unless proposed_gap=true`);
      for(const id of sourceNodeIds){const node=projectNodes.get(id);if(!node||node.metadata?.layer==='semantic')fail(`Feature ${key} references invalid source node ${id}`);}
      const criteria=asArray(raw.acceptance_criteria).map(x=>String(x).trim()).filter(Boolean); if(!criteria.length)fail(`Feature ${key} requires acceptance_criteria`);
      const parentKey=raw.parent_key==null||raw.parent_key===''?null:String(raw.parent_key); const dependencies=asArray(raw.depends_on).map(String); const cases=[]; const caseKeys=new Set();
      for(const ec of asArray(raw.edge_cases)){
        if(!object(ec))fail(`Feature ${key} has invalid edge case`); const edgeKey=String(ec.key||''); if(!keyPattern.test(edgeKey)||caseKeys.has(edgeKey))fail(`Feature ${key} has invalid or duplicate edge-case key`); caseKeys.add(edgeKey);
        const severity=String(ec.severity||'medium'); if(!severities.includes(severity))fail(`Edge case ${edgeKey} has invalid severity`);
        for(const field of ['title','trigger','expected_behavior','validation_scenario'])if(!String(ec[field]||'').trim())fail(`Edge case ${edgeKey} requires ${field}`);
        cases.push({key:edgeKey,title:String(ec.title).trim(),trigger:String(ec.trigger).trim(),expected_behavior:String(ec.expected_behavior).trim(),severity,validation_scenario:String(ec.validation_scenario).trim()});
      }
      normalized.push({key,parent_key:parentKey,title,outcome,priority,proposed_gap:proposedGap,source_node_ids:sourceNodeIds,acceptance_criteria:criteria,non_goals:asArray(raw.non_goals).map(String).filter(Boolean),depends_on:dependencies,edge_cases:cases});
    }
    for(const feature of normalized){for(const dep of feature.depends_on)if(!keys.has(dep))fail(`Feature ${feature.key} depends on unknown proposal key ${dep}`);if(feature.parent_key&&(!keys.has(feature.parent_key)||feature.parent_key===feature.key))fail(`Feature ${feature.key} has invalid parent_key ${feature.parent_key}`);}
    const visiting=new Set(),visited=new Set(),byKey=new Map(normalized.map(f=>[f.key,f])); const visit=(key,field='depends_on')=>{if(visiting.has(key))fail(`Semantic ${field} cycle includes ${key}`,'SEMANTIC_DEPENDENCY_CYCLE');if(visited.has(`${field}:${key}`))return;visiting.add(key);const f=byKey.get(key);for(const dep of field==='parent_key'?(f.parent_key?[f.parent_key]:[]):f.depends_on)visit(dep,field);visiting.delete(key);visited.add(`${field}:${key}`);}; normalized.forEach(f=>{visit(f.key);visit(f.key,'parent_key');});
    return {features:normalized};
  }

  stage(input){
    const run=this.store.getSemanticRun(input.run_id);if(!run||run.project_id!==input.project_id)fail('Semantic run not found','SEMANTIC_RUN_NOT_FOUND');
    const project=this.store.requireProject(input.project_id);if(project.graph_version!==run.snapshot_graph_version){this.store.updateSemanticRun(run.id,{status:'stale'});fail('Graph changed since semantic run preparation','SEMANTIC_RUN_STALE',{current_graph_version:project.graph_version});}
    const source=latestCommittedImport(this.store,project.id);if(!source||source.source_hash!==run.source_hash){this.store.updateSemanticRun(run.id,{status:'stale'});fail('Plan source changed since semantic run preparation','SEMANTIC_RUN_STALE');}
    const proposal=this.validateProposal(project.id,input.proposal,Math.min(Math.max(Number(input.max_features||25),1),100)); const existing=keyMap(semanticNodes(this.store,project.id,{activeOnly:true}));
    const numbering=numberFeatures(proposal.features,existing);const proposedKeys=new Set(proposal.features.map(f=>f.key)); const diff={created:proposal.features.filter(f=>!existing.has(f.key)).map(f=>f.key),updated:proposal.features.filter(f=>existing.has(f.key)).map(f=>f.key),superseded:[...existing.values()].filter(n=>!n.metadata.semantic_root&&!proposedKeys.has(n.metadata.semantic_key)).map(n=>({id:n.id,key:n.metadata.semantic_key,number:n.metadata.display_id||null,title:n.title})),edge_case_count:proposal.features.reduce((n,f)=>n+f.edge_cases.length,0),unsupported:proposal.features.filter(f=>f.proposed_gap).map(f=>f.key),numbering:Object.fromEntries(numbering)};
    const staged=this.store.updateSemanticRun(run.id,{status:'staged',proposal,diff}); this.store.event({project_id:project.id,kind:'semantic.staged',actor:input.actor||'codex',entity_id:run.id,data:{features:proposal.features.length,diff}});
    return {run_id:staged.id,status:staged.status,proposal:staged.proposal,diff:staged.diff};
  }

  commit(input){
    const run=this.store.getSemanticRun(input.run_id);if(!run||run.project_id!==input.project_id)fail('Semantic run not found','SEMANTIC_RUN_NOT_FOUND');if(run.status!=='staged'||!run.proposal)fail('A staged semantic proposal is required','SEMANTIC_RUN_NOT_STAGED');
    const project=this.store.requireProject(input.project_id);if(project.graph_version!==input.expected_graph_version||project.graph_version!==run.snapshot_graph_version)fail('Graph changed since semantic proposal was prepared','GRAPH_VERSION_CONFLICT',{current_graph_version:project.graph_version});
    const source=latestCommittedImport(this.store,project.id);if(!source||source.source_hash!==run.source_hash){this.store.updateSemanticRun(run.id,{status:'stale'});fail('Plan source changed since semantic proposal was prepared','SEMANTIC_RUN_STALE');}
    return this.store.tx(()=>{
      const all=semanticNodes(this.store,project.id);const active=all.filter(n=>n.status==='active');const existing=keyMap(active);let root=active.find(n=>n.metadata?.semantic_root);
      const rootMetadata={layer:'semantic',semantic_root:true,semantic_key:'semantic.backlog',semantic_run_id:run.id};
      if(root)root=this.store.updateNodeInTransaction(root.id,{title:'Semantic implementation backlog',description:'Codex-authored implementation units derived from lexical plan evidence.',status:'active',metadata:rootMetadata});
      else root=this.store.insertNode({project_id:project.id,type:'feature',title:'Semantic implementation backlog',description:'Codex-authored implementation units derived from lexical plan evidence.',origin:'semantic_codex',status:'active',parent_id:null,metadata:rootMetadata});
      const currentIds=active.map(n=>n.id);this.store.deleteSemanticEdges(project.id,currentIds);
      const desired=new Set(['semantic.backlog']);const featureByKey=new Map();const created=[];const reused=[];const numbering=numberFeatures(run.proposal.features,existing);
      const upsert=(type,key,title,description,parentId,metadata)=>{desired.add(key);let node=existing.get(key);const patch={title,description,origin:'semantic_codex',status:'active',parent_id:parentId,metadata:{layer:'semantic',semantic_key:key,semantic_run_id:run.id,...metadata}};if(node){node=this.store.updateNodeInTransaction(node.id,patch);reused.push(node.id);}else{node=this.store.insertNode({project_id:project.id,type,title,description,origin:'semantic_codex',status:'active',parent_id:parentId,metadata:patch.metadata});created.push(node.id);}return node;};
      const byKey=new Map(run.proposal.features.map(f=>[f.key,f]));const materialize=key=>{if(featureByKey.has(key))return featureByKey.get(key);const feature=byKey.get(key);const parent=feature.parent_key?materialize(feature.parent_key):root;const node=upsert('feature',feature.key,feature.title,feature.outcome,parent.id,{display_id:numbering.get(feature.key),parent_semantic_key:feature.parent_key,priority:feature.priority,proposed_gap:feature.proposed_gap,source_node_ids:feature.source_node_ids,acceptance_criteria:feature.acceptance_criteria,non_goals:feature.non_goals});featureByKey.set(feature.key,node);return node;};for(const feature of run.proposal.features)materialize(feature.key);
      const pending=[];
      for(const feature of run.proposal.features){const node=featureByKey.get(feature.key);for(let i=0;i<feature.acceptance_criteria.length;i++){const key=`${feature.key}.acceptance.${i+1}`;const test=upsert('test',key,feature.acceptance_criteria[i],`Acceptance criterion for ${feature.title}.`,node.id,{feature_key:feature.key,criterion_index:i+1});pending.push({kind:'validated_by',source_id:node.id,target_id:test.id});}
        for(const edgeCase of feature.edge_cases){const ec=upsert('edge_case',edgeCase.key,edgeCase.title,edgeCase.expected_behavior,node.id,{feature_key:feature.key,trigger:edgeCase.trigger,severity:edgeCase.severity,validation_scenario:edgeCase.validation_scenario});pending.push({kind:'has_edge_case',source_id:node.id,target_id:ec.id});}
        if(feature.parent_key)pending.push({kind:'contains',source_id:featureByKey.get(feature.parent_key).id,target_id:node.id});
        for(const sourceId of feature.source_node_ids)pending.push({kind:'derived_from',source_id:node.id,target_id:sourceId});
        for(const dependency of feature.depends_on)pending.push({kind:'depends_on',source_id:node.id,target_id:featureByKey.get(dependency).id});
      }
      for(const edge of pending)this.store.insertEdge({project_id:project.id,source_id:edge.source_id,target_id:edge.target_id,type:edge.kind,origin:'semantic_codex'});
      for(const node of all)if(!node.metadata?.semantic_root&&!desired.has(node.metadata?.semantic_key)&&node.status==='active')this.store.updateNodeInTransaction(node.id,{status:'superseded',metadata:{superseded_by_run:run.id}});
      const graphVersion=this.store.bumpGraphVersion(project.id);const committed=this.store.updateSemanticRun(run.id,{status:'committed',committed_at:nowIso()});this.store.event({project_id:project.id,kind:'semantic.committed',actor:input.actor||'mcp',entity_id:run.id,data:{graph_version:graphVersion,created:created.length,reused:reused.length}});
      return {run_id:committed.id,status:committed.status,graph_version:graphVersion,created_node_ids:created,reused_node_ids:reused,diff:committed.diff};
    });
  }

  listFeatures(projectId){
    const project=this.store.requireProject(projectId);const nodes=semanticNodes(this.store,project.id,{activeOnly:true});const features=nodes.filter(n=>n.type==='feature'&&!n.metadata?.semantic_root).sort(displayOrder);const edges=this.store.listEdges(project.id);const byId=new Map(nodes.map(n=>[n.id,n]));
    return {project_id:project.id,graph_version:project.graph_version,features:features.map(feature=>({ ...feature,dependencies:edges.filter(e=>e.type==='depends_on'&&e.source_id===feature.id).map(e=>byId.get(e.target_id)).filter(Boolean).map(n=>({id:n.id,key:n.metadata.semantic_key,title:n.title,implemented:n.implemented})),edge_cases:edges.filter(e=>e.type==='has_edge_case'&&e.source_id===feature.id).map(e=>byId.get(e.target_id)).filter(Boolean),acceptance_tests:edges.filter(e=>e.type==='validated_by'&&e.source_id===feature.id).map(e=>byId.get(e.target_id)).filter(Boolean)}))};
  }
  listEdgeCases(projectId,input={}){const list=this.listFeatures(projectId).features;const feature=list.find(f=>f.id===input.feature_id||f.metadata?.semantic_key===input.semantic_key);const cases=feature?feature.edge_cases:list.flatMap(f=>f.edge_cases);return {project_id:projectId,feature_id:feature?.id||null,edge_cases:cases};}
  resolveReference(projectId,reference){const list=this.listFeatures(projectId).features;const raw=String(reference||'').trim();const number=/^\d+(?:\.\d+)*$/.test(raw)?`F${raw}`:raw.toUpperCase();const feature=list.find(f=>f.metadata?.display_id?.toUpperCase()===number||f.metadata?.semantic_key===raw||f.title.toLowerCase()===raw.toLowerCase());if(!feature)fail(`Semantic feature reference not found: ${raw}`,'SEMANTIC_REFERENCE_NOT_FOUND');const prefix=`${feature.metadata.display_id}.`;return {project_id:projectId,reference:raw,feature,descendants:list.filter(f=>f.metadata?.display_id?.startsWith(prefix)),edge_cases:feature.edge_cases};}
  reindex(projectId,actor='mcp'){const project=this.store.requireProject(projectId);return this.store.tx(()=>{const nodes=semanticNodes(this.store,projectId,{activeOnly:true});const features=nodes.filter(n=>n.type==='feature'&&!n.metadata?.semantic_root).sort(priorityOrder);const defs=features.map(n=>({key:n.metadata.semantic_key,parent_key:n.metadata.parent_semantic_key||null}));const numbers=numberFeatures(defs,keyMap(nodes));let changed=0;for(const n of features){const number=numbers.get(n.metadata.semantic_key);if(n.metadata.display_id===number)continue;this.store.updateNodeInTransaction(n.id,{metadata:{...n.metadata,display_id:number}});changed++;}const graphVersion=changed?this.store.bumpGraphVersion(projectId):project.graph_version;if(changed)this.store.event({project_id:projectId,kind:'semantic.reindexed',actor,data:{changed,graph_version:graphVersion}});return {project_id:projectId,changed,graph_version:graphVersion};});}
  getDiff(projectId,runId){const run=this.store.getSemanticRun(runId);if(!run||run.project_id!==projectId)fail('Semantic run not found','SEMANTIC_RUN_NOT_FOUND');return {run_id:run.id,status:run.status,diff:run.diff,proposal:run.proposal,source_hash:run.source_hash,snapshot_graph_version:run.snapshot_graph_version};}
  frontier(projectId,limit=25){const list=this.listFeatures(projectId);if(!list.features.length)return null;const ready=list.features.filter(f=>!f.implemented&&f.dependencies.every(d=>d.implemented)).sort(priorityOrder).slice(0,limit);return {project_id:projectId,mode:'semantic',frontier:ready};}
}
