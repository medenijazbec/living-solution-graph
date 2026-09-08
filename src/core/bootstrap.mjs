import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { newId, normalizeTitle, nowIso } from './db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packPath = path.resolve(here, '../../bootstrap/domain_starter_packs.json');
const catalog = JSON.parse(fs.readFileSync(packPath, 'utf8'));

export function getStarterCatalog() { return catalog; }
export function getStarterPack(id) { return catalog.packs.find(p => p.id === id) || null; }

function hashText(s) { return createHash('sha256').update(s).digest('hex'); }
function stripMd(s) { return s.replace(/^\s*[-*+]\s+/,'').replace(/^\s*\d+[.)]\s+/,'').replace(/^\s*#+\s*/, '').replace(/^\s*>\s?/, '').replace(/^\s*[-*+]\s*\[[ xX]\]\s*/, '').replace(/[*_`]/g,'').trim(); }
function titleish(s) { return s.length > 0 && s.length <= 180 && !/[.!?].+\s/.test(s); }

function classify(text, kind='line') {
  const l=text.toLowerCase();
  if (/\b(edge case|failure mode|when .*fails|offline|disconnect|timeout|corrupt|duplicate|retry|race condition)\b/.test(l)) return 'edge_case';
  if (/\b(test|testing|e2e|integration test|unit test|acceptance criteria)\b/.test(l)) return 'test';
  if (/\b(decision|choose|selected|use (unreal|unity|godot|postgres|sqlite|react|vue|angular))\b/.test(l)) return 'decision';
  if (/\b(risk|threat|security concern)\b/.test(l)) return 'risk';
  if (/\b(must|shall|required|needs to|should)\b/.test(l)) return 'requirement';
  if (kind==='heading') return 'feature';
  return titleish(text) ? 'feature' : 'requirement';
}

export function extractPlanCandidates(markdown) {
  const lines=String(markdown||'').replace(/\r\n/g,'\n').split('\n');
  const candidates=[]; const edges=[]; const headingStack=[]; const seen=new Map();
  function add({type,title,description='',line,level=0,parentTemp=null,claimed=false,origin='plan_explicit',metadata={}}) {
    title=stripMd(title).replace(/[:;]+$/,'').trim();
    if(!title || title.length<2) return null;
    const key=`${type}:${normalizeTitle(title)}`;
    if(seen.has(key)) {
      const prior=seen.get(key); prior.metadata.source_lines=[...(prior.metadata.source_lines||[]),line]; prior.source_claimed_implemented ||= claimed; return prior;
    }
    const c={temp_id:newId('cand'),type,title,description,origin,source_claimed_implemented:claimed,implemented:false,implementation_state:'not_implemented',verification_state:'unverified',disposition:null,parent_temp_id:parentTemp,metadata:{source_lines:[line],...metadata}};
    candidates.push(c); seen.set(key,c);
    if(parentTemp) edges.push({source_temp_id:parentTemp,target_temp_id:c.temp_id,type:type==='edge_case'?'has_edge_case':'contains',origin});
    return c;
  }
  for(let i=0;i<lines.length;i++) {
    const raw=lines[i]; const line=i+1; const trimmed=raw.trim(); if(!trimmed) continue;
    const hm=trimmed.match(/^(#{1,6})\s+(.+)$/);
    if(hm) {
      const level=hm[1].length; const title=hm[2].trim();
      while(headingStack.length && headingStack.at(-1).level>=level) headingStack.pop();
      const parent=headingStack.at(-1)?.temp_id || null;
      const c=add({type:classify(title,'heading'),title,line,level,parentTemp:parent});
      if(c) headingStack.push({level,temp_id:c.temp_id});
      continue;
    }
    const cb=trimmed.match(/^[-*+]\s*\[([ xX])\]\s*(.+)$/);
    if(cb) {
      const parent=headingStack.at(-1)?.temp_id||null;
      add({type:classify(cb[2]),title:cb[2],line,parentTemp:parent,claimed:cb[1].toLowerCase()==='x',metadata:{checkbox:true}});
      continue;
    }
    const bullet=trimmed.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    if(bullet) {
      const parent=headingStack.at(-1)?.temp_id||null;
      add({type:classify(bullet[1]),title:bullet[1],line,parentTemp:parent});
      continue;
    }
    if (/^(goal|feature|requirement|decision|risk|test|backend|frontend|database|payments?|authentication|auth|engine|deployment|observability|security)\s*:/i.test(trimmed)) {
      const [label,...rest]=trimmed.split(':'); const body=rest.join(':').trim(); const text=body?`${label}: ${body}`:label;
      const parent=headingStack.at(-1)?.temp_id||null;
      add({type:classify(text),title:text,line,parentTemp:parent});
      continue;
    }
    if (/\b(must|shall|required|needs to|should|support|handle)\b/i.test(trimmed) && trimmed.length<400) {
      const parent=headingStack.at(-1)?.temp_id||null;
      add({type:classify(trimmed),title:trimmed,line,parentTemp:parent});
    }
  }
  return { candidates, edges, lines:lines.length };
}

export function detectArchetypes(markdown, minConfidence=0.55) {
  const text=String(markdown||'').toLowerCase(); const out=[];
  for(const pack of catalog.packs) {
    if(pack.id==='universal') continue;
    const matches=[];
    for(const sig of pack.signals||[]) if(text.includes(String(sig).toLowerCase())) matches.push(sig);
    if(!matches.length) continue;
    const confidence=Math.min(0.99,0.42+0.13*Math.min(matches.length,4));
    if(confidence>=minConfidence) out.push({pack_id:pack.id,title:pack.title,confidence:Number(confidence.toFixed(2)),signals:matches});
  }
  return out.sort((a,b)=>b.confidence-a.confidence || a.pack_id.localeCompare(b.pack_id));
}

function overlapScore(a,b) {
  const aa=new Set(normalizeTitle(a).split(' ').filter(x=>x.length>2)); const bb=new Set(normalizeTitle(b).split(' ').filter(x=>x.length>2));
  if(!aa.size||!bb.size) return 0; let n=0; for(const x of aa) if(bb.has(x)) n++; return n/Math.max(aa.size,bb.size);
}
function findCovering(candidates, title, key='') {
  let best=null,score=0; for(const c of candidates) { const s=Math.max(overlapScore(c.title,title), key&&normalizeTitle(c.title).includes(normalizeTitle(key))?0.8:0); if(s>score){score=s;best=c;} }
  return score>=0.42?best:null;
}
function conditionLikelyTrue(condition, text) {
  if(!condition) return true; const c=condition.toLowerCase(); const t=text.toLowerCase();
  const groups=[
    ['auth',['auth','login','account','user','token','permission']],['payment',['payment','billing','checkout','stripe','subscription','purchase']],
    ['durable',['database','storage','save','persist','history','record']],['secret',['api key','token','credential','certificate','secret']],
    ['personal',['personal','user data','health','email','profile','telemetry']],['file',['upload','file','image','attachment']],
    ['shared',['multiplayer','multi-user','concurrent','shared']],['network',['online','api','network','server','backend','sync']]
  ];
  for(const [marker,words] of groups) if(c.includes(marker) && words.some(w=>t.includes(w))) return true;
  const significant=c.split(/[^a-z0-9]+/).filter(w=>w.length>4); return significant.some(w=>t.includes(w));
}

export function applyStarterPacksToAnalysis({markdown,candidates,edges,archetypes,explicitPackIds=null,mode='auto'}) {
  const selected=['universal',...(explicitPackIds?.length?explicitPackIds:archetypes.map(a=>a.pack_id))];
  const ids=[...new Set(selected)].filter(id=>getStarterPack(id)); const evaluations=[];
  if(mode==='disabled') return {selected_pack_ids:[],evaluations,candidates,edges};
  const root=candidates[0]||null;
  for(const packId of ids) {
    const pack=getStarterPack(packId);
    for(const cap of pack.capabilities||[]) {
      const covered=findCovering(candidates,cap.title,cap.key);
      let disposition,reason;
      if(covered) { disposition='already_covered'; reason=`Covered by ${covered.temp_id}: ${covered.title}`; }
      else if(cap.default_disposition==='required_review') { disposition='required'; reason='Starter pack requires explicit coverage review.'; }
      else if(cap.default_disposition==='recommended') { disposition='conditional'; reason='Recommended starter coverage; retained for review.'; }
      else if(cap.default_disposition==='conditional') {
        const yes=conditionLikelyTrue(cap.when||'',markdown); disposition=yes?'required':'unresolved'; reason=yes?`Condition appears true: ${cap.when}`:`Condition unresolved: ${cap.when}`;
      } else { disposition=cap.default_disposition||'unresolved'; reason='Starter pack evaluation.'; }
      let candidateTemp=covered?.temp_id||null;
      if(!covered && mode==='auto' && ['required','conditional','unresolved'].includes(disposition)) {
        const c={temp_id:newId('cand'),type:cap.node_type||'feature',title:cap.title,description:cap.when?`Starter coverage. Condition: ${cap.when}`:'Starter coverage.',origin:'starter_pack_seed',source_claimed_implemented:false,implemented:false,implementation_state:'not_implemented',verification_state:'unverified',disposition,parent_temp_id:root?.temp_id||null,metadata:{starter_pack_id:pack.id,starter_pack_version:pack.version,capability_key:cap.key}};
        const existing=findCovering(candidates,c.title,c.metadata.capability_key);
        if(existing) { candidateTemp=existing.temp_id; disposition='duplicate'; reason=`Semantically overlaps ${existing.temp_id}`; }
        else { candidates.push(c); candidateTemp=c.temp_id; if(root) edges.push({source_temp_id:root.temp_id,target_temp_id:c.temp_id,type:'contains',origin:'starter_pack_seed'}); }
      }
      evaluations.push({pack_id:pack.id,pack_version:pack.version,capability_key:cap.key,edge_case_key:null,disposition,reason,candidate_temp_id:candidateTemp});
    }
    for(const ec of pack.edge_cases||[]) {
      let disposition='required'; let reason='Starter edge case for this archetype.';
      if(ec.when && !conditionLikelyTrue(ec.when,markdown)) { disposition='unresolved'; reason=`Condition unresolved: ${ec.when}`; }
      const covered=findCovering(candidates,ec.title,ec.key);
      let candidateTemp=covered?.temp_id||null;
      if(covered){disposition='already_covered';reason=`Covered by ${covered.temp_id}`;}
      else if(mode==='auto' && ['required','unresolved'].includes(disposition)) {
        let parent=root; let best=0;
        for(const c of candidates.filter(x=>x.type!=='edge_case')) {const s=overlapScore(c.title,ec.title);if(s>best){best=s;parent=c;}}
        const c={temp_id:newId('cand'),type:'edge_case',title:ec.title,description:`${ec.category||'edge case'}; severity ${ec.severity||'medium'}${ec.when?`; condition: ${ec.when}`:''}`,origin:'starter_pack_seed',source_claimed_implemented:false,implemented:false,implementation_state:'not_implemented',verification_state:'unverified',disposition,parent_temp_id:parent?.temp_id||null,metadata:{starter_pack_id:pack.id,starter_pack_version:pack.version,edge_case_key:ec.key,category:ec.category,severity:ec.severity,when:ec.when||null}};
        candidates.push(c); candidateTemp=c.temp_id; if(parent) edges.push({source_temp_id:parent.temp_id,target_temp_id:c.temp_id,type:'has_edge_case',origin:'starter_pack_seed'});
      }
      evaluations.push({pack_id:pack.id,pack_version:pack.version,capability_key:null,edge_case_key:ec.key,disposition,reason,candidate_temp_id:candidateTemp});
    }
  }
  return {selected_pack_ids:ids,evaluations,candidates,edges};
}

const genericRules=[
  {re:/\b(sync|synchron|replicat)\b/i,cases:['Connectivity disappears mid-sync','Retry produces duplicate records','Concurrent edits create a conflict','Partial acknowledgement leaves uncertain state']},
  {re:/\b(auth|login|token|permission|account)\b/i,cases:['Credential expires during an operation','Permission is revoked while the session is active','Repeated failed authentication is rate-limited safely']},
  {re:/\b(payment|billing|checkout|purchase|subscription)\b/i,cases:['Payment succeeds but client return is lost','Webhook is duplicated or delivered out of order','Refund or chargeback changes entitlement','Payment retry must be idempotent']},
  {re:/\b(database|persist|storage|save)\b/i,cases:['Persisted data is partially written or corrupt','Migration is interrupted','Concurrent writers race','Storage capacity is exhausted']},
  {re:/\b(upload|file|attachment|media)\b/i,cases:['Upload is interrupted after partial transfer','File exceeds configured limits','File type or contents are malformed','Duplicate upload is retried']},
  {re:/\b(network|api|backend|server|request)\b/i,cases:['Dependency times out after partial success','Dependency is unavailable','Response is malformed or incompatible','Client retries after connection reset']},
  {re:/\b(llm|model|ai|prompt|agent)\b/i,cases:['Model returns malformed structured output','Model provider rate-limits or times out','Prompt/context exceeds provider limits','Untrusted content attempts prompt injection']}
];

export function genericEdgeCaseExpansion(candidates,edges,maxPerFeature=12) {
  const added=[]; const existing=new Set(candidates.filter(c=>c.type==='edge_case').map(c=>normalizeTitle(c.title)));
  for(const feature of candidates.filter(c=>['feature','requirement','decision'].includes(c.type))) {
    let count=0;
    for(const rule of genericRules) {
      if(!rule.re.test(feature.title+' '+feature.description)) continue;
      for(const title of rule.cases) {
        if(count>=maxPerFeature) break;
        const key=normalizeTitle(title); if(existing.has(key)) continue;
        const c={temp_id:newId('cand'),type:'edge_case',title,description:`Discovered while expanding ${feature.title}`,origin:'bootstrap_model_discovery',source_claimed_implemented:false,implemented:false,implementation_state:'not_implemented',verification_state:'unverified',disposition:'required',parent_temp_id:feature.temp_id,metadata:{discovery_rule:String(rule.re),discovered_for:feature.temp_id}};
        candidates.push(c);edges.push({source_temp_id:feature.temp_id,target_temp_id:c.temp_id,type:'has_edge_case',origin:'bootstrap_model_discovery'});existing.add(key);added.push(c);count++;
      }
    }
  }
  return added;
}

export function analyzeMarkdownPlan({markdown,fileName='plan.md',minArchetypeConfidence=0.55,starterPackMode='auto',starterPackIds=null,allowEdgeCaseExpansion=true,maxEdgeCasesPerFeature=12}) {
  const source=String(markdown||'');
  const base=extractPlanCandidates(source);
  const archetypes=detectArchetypes(source,minArchetypeConfidence);
  const starter=applyStarterPacksToAnalysis({markdown:source,candidates:base.candidates,edges:base.edges,archetypes,explicitPackIds:starterPackIds,mode:starterPackMode});
  const discovered=allowEdgeCaseExpansion?genericEdgeCaseExpansion(starter.candidates,starter.edges,maxEdgeCasesPerFeature):[];
  const counts={}; for(const c of starter.candidates) counts[c.type]=(counts[c.type]||0)+1;
  const origin_counts={}; for(const c of starter.candidates) origin_counts[c.origin]=(origin_counts[c.origin]||0)+1;
  const findings=[];
  if(!starter.candidates.some(c=>c.type==='feature')) findings.push({severity:'blocking',kind:'missing_feature_structure',message:'No feature-like structure could be extracted from the plan.'});
  if(!archetypes.length) findings.push({severity:'info',kind:'archetype_unresolved',message:'No domain archetype exceeded the configured confidence threshold; universal coverage still applies.'});
  return {
    source:{file_name:fileName,sha256:hashText(source),line_count:base.lines,byte_count:Buffer.byteLength(source)},
    analyzed_at:nowIso(),
    archetypes,detected_archetypes:archetypes,selected_starter_pack_ids:starter.selected_pack_ids,starter_evaluations:starter.evaluations,
    candidates:starter.candidates,edges:starter.edges,discovered_edge_case_count:discovered.length,counts,origin_counts,findings
  };
}

export function commitAnalysis(store,{projectId,importSessionId,expectedGraphVersion,actor='mcp',reason='Commit plan import'}) {
  const session=store.getImportSession(importSessionId); if(!session||session.project_id!==projectId){const e=new Error('Import session not found for project');e.code='IMPORT_NOT_FOUND';throw e;}
  if(session.status==='committed') return session.result;
  return store.tx(()=>{
    store.assertGraphVersion(projectId,expectedGraphVersion);
    const analysis=session.analysis; const map=new Map(); const created=[]; const reused=[];
    // A merge can contain thousands of candidates. Index project nodes once rather
    // than scanning the complete graph for every candidate.
    const existingByTypeAndTitle=new Map(store.listNodes(projectId).map(node=>[
      `${node.type}:${normalizeTitle(node.title)}`,
      node
    ]));
    for(const c of analysis.candidates) {
      const key=`${c.type}:${normalizeTitle(c.title)}`; let existing=existingByTypeAndTitle.get(key);
      if(existing) { map.set(c.temp_id,existing.id); reused.push(existing.id); continue; }
      const parentId=c.parent_temp_id?map.get(c.parent_temp_id)||null:null;
      const n=store.insertNode({project_id:projectId,type:c.type,title:c.title,description:c.description,origin:c.origin,status:'active',implemented:false,implementation_state:'not_implemented',verification_state:'unverified',source_claimed_implemented:!!c.source_claimed_implemented,disposition:c.disposition,parent_id:parentId,metadata:{layer:'source',...c.metadata}});
      map.set(c.temp_id,n.id);existingByTypeAndTitle.set(key,n);created.push(n.id);
    }
    for(const e of analysis.edges) {
      const s=map.get(e.source_temp_id),t=map.get(e.target_temp_id); if(s&&t&&s!==t) store.insertEdge({project_id:projectId,source_id:s,target_id:t,type:e.type,origin:e.origin});
    }
    for(const ev of analysis.starter_evaluations||[]) store.insertStarterEvaluation({project_id:projectId,import_session_id:importSessionId,pack_id:ev.pack_id,pack_version:ev.pack_version,capability_key:ev.capability_key,edge_case_key:ev.edge_case_key,disposition:ev.disposition,reason:ev.reason,node_id:ev.candidate_temp_id?map.get(ev.candidate_temp_id)||null:null});
    const newGraphVersion=store.bumpGraphVersion(projectId);
    const result={project_id:projectId,import_session_id:importSessionId,baseline:expectedGraphVersion===1,previous_graph_version:expectedGraphVersion,graph_version:newGraphVersion,created_nodes:created.length,reused_nodes:reused.length,created_node_ids:created,reused_node_ids:reused,committed_at:nowIso(),reason};
    store.updateImportSession(importSessionId,{status:'committed',result});
    store.markSemanticRunsStale(projectId,session.source_hash);
    store.event({project_id:projectId,kind:'plan_import.committed',actor,entity_id:importSessionId,data:result});
    return result;
  });
}
