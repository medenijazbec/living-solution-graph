import { createHash } from 'node:crypto';
import { newId, nowIso } from './db.mjs';

const fail=(message,code='INVALID_ARGUMENT')=>{const error=new Error(message);error.code=code;throw error;};
const digest=text=>createHash('sha256').update(text).digest('hex');
const defaultName=node=>`${node.metadata?.display_id||node.id}-implementation-plan.md`;

export class PlanBatches {
  constructor(service){this.service=service;this.store=service.store;}

  nextMissing(input){
    const project=this.store.requireProject(input.project_id),limit=Math.max(1,Math.min(25,Number(input.limit)||10));
    const coverage=this.service.getImplementationPlanCoverage({project_id:project.id,include_source:!!input.include_source});
    let start=0;
    if(input.cursor){let token;try{token=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('Invalid missing-plan cursor','INVALID_CURSOR');}if(token.project_id!==project.id||token.graph_version!==project.graph_version)fail('Missing-plan cursor is stale','STALE_CURSOR');start=coverage.items.findIndex(item=>item.node_id===token.after_node_id)+1;if(start===0)fail('Missing-plan cursor is stale','STALE_CURSOR');}
    const selected=[];let lastIndex=start-1;
    for(let index=start;index<coverage.items.length&&selected.length<limit;index++){const item=coverage.items[index];lastIndex=index;if(item.has_plan)continue;const node=this.store.getNode(item.node_id);selected.push({...item,description:node.description,parent_id:node.parent_id,priority:node.metadata?.priority||null,source_node_ids:node.metadata?.source_node_ids||[],acceptance_criteria:node.metadata?.acceptance_criteria||[],trigger:node.metadata?.trigger||null,expected_behavior:node.metadata?.expected_behavior||null,validation_scenario:node.metadata?.validation_scenario||null});}
    const hasMore=coverage.items.slice(lastIndex+1).some(item=>!item.has_plan),after=coverage.items[lastIndex];
    return {project_id:project.id,graph_version:project.graph_version,limit,missing_total:coverage.missing_plan,items:selected,next_cursor:hasMore&&after?Buffer.from(JSON.stringify({project_id:project.id,graph_version:project.graph_version,after_node_id:after.node_id})).toString('base64url'):null};
  }

  stage(input){
    const project=this.store.assertGraphVersion(input.project_id,input.expected_graph_version),plans=input.plans;
    if(!Array.isArray(plans)||!plans.length||plans.length>25)fail('Provide 1 to 25 plans');
    const seen=new Set(),diff=[],prepared=[];let bytes=0;
    for(const entry of plans){if(!entry||typeof entry!=='object'||!entry.node_id)fail('Each plan needs a node_id');const node=this.store.getNode(entry.node_id);if(!node||node.project_id!==project.id||node.status!=='active'||!['feature','edge_case'].includes(node.type)||node.metadata?.semantic_root)fail(`Active feature or edge case not found: ${entry.node_id}`,'NODE_NOT_FOUND');if(seen.has(node.id))fail(`Duplicate node in plan batch: ${node.id}`);seen.add(node.id);const markdown=String(entry.markdown??'').trim(),fileName=String(entry.file_name||defaultName(node)).trim();if(!markdown||!fileName.toLowerCase().endsWith('.md')||fileName.includes('/')||fileName.includes('\\'))fail(`Invalid Markdown plan for ${node.id}`);bytes+=Buffer.byteLength(markdown,'utf8');if(bytes>1024*1024)fail('Plan batch exceeds 1 MiB','DOCUMENT_TOO_LARGE');const current=this.store.getNodeDocument(node.id),expectedVersion=entry.expected_document_version??current?.version??0;if(expectedVersion!==(current?.version??0))fail(`Document version conflict for ${node.id}`,'DOCUMENT_VERSION_CONFLICT');const action=!current?'create':current.markdown===markdown&&current.file_name===fileName?'unchanged':'replace';diff.push({node_id:node.id,display_id:node.metadata?.display_id||null,title:node.title,action,file_name:fileName,before_sha256:current?.sha256||null,after_sha256:digest(markdown),expected_document_version:expectedVersion});prepared.push({node_id:node.id,markdown,file_name:fileName,expected_document_version:expectedVersion});}
    const batch={id:newId('planbatch'),project_id:project.id,status:'staged',graph_version:project.graph_version,created_at:nowIso(),actor:input.actor||'codex',plans:prepared,diff};this.service.workspace.put('plan_batch',batch.id,project.id,batch);return batch;
  }

  get(input){this.store.requireProject(input.project_id);const batch=this.service.workspace.record('plan_batch',input.batch_id);if(!batch||batch.project_id!==input.project_id)fail('Plan batch not found','PLAN_BATCH_NOT_FOUND');return batch;}

  apply(input){
    const batch=this.get(input),project=this.store.assertGraphVersion(input.project_id,input.expected_graph_version);
    if(batch.status!=='staged')fail('Only a staged plan batch can be applied','INVALID_STATE');if(batch.graph_version!==project.graph_version)fail('Graph changed since plan batch staging','GRAPH_VERSION_CONFLICT');if(input.confirm_plan_count!==batch.plans.length)fail(`Confirm application of ${batch.plans.length} plans`,'CONFIRMATION_REQUIRED');
    const changed=[];const applied=this.store.tx(()=>{for(const plan of batch.plans){const node=this.store.getNode(plan.node_id),current=this.store.getNodeDocument(plan.node_id);if(!node||node.status!=='active'||node.project_id!==project.id)fail('A plan node changed or disappeared','NODE_NOT_FOUND');if((current?.version??0)!==plan.expected_document_version)fail(`Document version conflict for ${node.id}`,'DOCUMENT_VERSION_CONFLICT');if(current?.markdown===plan.markdown&&current.file_name===plan.file_name)continue;this.store.upsertNodeDocument({project_id:project.id,node_id:node.id,kind:'implementation_plan',file_name:plan.file_name,markdown:plan.markdown,sha256:digest(plan.markdown),expected_version:plan.expected_document_version,actor:input.actor||batch.actor});if(node.implemented)this.store.updateNodeInTransaction(node.id,{verification_state:'stale',verified_at:null,last_invalidated_at:nowIso()});changed.push(node.id);this.store.event({project_id:project.id,kind:'node.implementation_plan_saved',actor:input.actor||batch.actor,entity_id:node.id,data:{batch_id:batch.id,file_name:plan.file_name}});}if(changed.some(id=>this.store.getNode(id).implemented))this.store.bumpGraphVersion(project.id);const next={...batch,status:'applied',applied_at:nowIso(),applied_node_ids:changed};this.service.workspace.put('plan_batch',batch.id,project.id,next);return next;});this.service.activity.emit(project.id,changed,'plan_update',input.actor||batch.actor);return {...applied,graph_version:this.store.getProject(project.id).graph_version};
  }
}
