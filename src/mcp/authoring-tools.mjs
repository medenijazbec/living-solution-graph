import { FULLSTACK_TEMPLATE } from '../core/authoring.mjs';

const s={type:'string'},b={type:'boolean'},i={type:'integer'},strings={type:'array',items:s};
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const scope={project_id:s,run_id:s};
const citation=object({source_id:s,source_hash:s,start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1}},['source_id','source_hash','start_line','end_line']);
const citations={type:'array',items:citation};
const architecture=object({key:s,title:s,technology:s,directories:strings,guidance:s},['key','title','technology']);
const edgeCase=object({key:s,title:s,trigger:s,expected_behavior:s,severity:{type:'string',enum:['critical','high','medium','low']},validation_scenario:s,implementation_plan:s,source_citations:citations,proposed_gap:b},['key','title','trigger','expected_behavior','severity','validation_scenario','implementation_plan']);
const feature=object({key:s,parent_key:s,architecture_key:s,title:s,outcome:s,priority:s,importance_rationale:s,acceptance_criteria:strings,non_goals:strings,depends_on:strings,source_citations:citations,proposed_gap:b,implementation_plan:s,edge_cases:{type:'array',items:edgeCase}},['key','title','outcome','priority','importance_rationale','acceptance_criteria','implementation_plan']);
const coverage=object({...citation.properties,disposition:{type:'string',enum:['feature','excluded','question']},feature_keys:strings,reason:s},[...citation.required,'disposition']);
const proposal=object({architectures:{type:'array',items:architecture},features:{type:'array',items:feature},coverage:{type:'array',items:coverage}},['features']);

export function authoringTools(service){
  const author=service.authoring,defs=[];
  const add=(name,description,properties,required,handler)=>defs.push({name,description,inputSchema:object(properties,required),handler});
  add('solution.start_plan_graph_workflow','FIRST step for Codex authoring. Register original Markdown evidence in one canonical workspace-directory project; create no inferred nodes. Returns a run and paginated source-reading instructions.',{plan_file_path:s,workspace_directory:s,project_id:s,project_title:s,architecture_keys:strings},['plan_file_path'],a=>author.register(a));
  add('solution.read_plan_source','Read bounded original Markdown source lines, tracking reading coverage for this run. Continue with next_cursor until every source is fully read.',{...scope,source_id:s,start_line:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:300},cursor:s},['project_id','run_id','source_id'],a=>author.read(a));
  add('solution.get_authoring_status','Compact source-reading, proposal-batch, publication and missing-plan status. complete=true requires current committed sources and zero missing plans.',scope,['project_id'],a=>author.status(a));
  add('solution.stage_authoring_batch','Save or replace a bounded batch by stable batch_key. Codex supplies architectures, features, edge cases, Markdown plans and source coverage. Does not publish until finalization.',{...scope,batch_key:s,proposal},['project_id','run_id','batch_key','proposal'],a=>author.stage(a));
  add('solution.finalize_plan_graph_workflow','Validate full source reading, citations, coverage, graph and Markdown plans; publish all batches atomically by default. review_only=true previews validated staged counts.',{...scope,review_only:b,actor:s},['project_id','run_id'],a=>author.finalize(a));
  add('solution.prepare_semantic_feature_set','Prepare a fresh Codex authoring run from registered original sources; optional architecture scope preserves all other architectures.',{project_id:s,architecture_keys:strings},['project_id'],a=>author.prepare(a));
  add('solution.stage_semantic_feature_set','Compatibility convenience: stage one complete Codex-authored proposal with required plans, then atomically publish by default. Use stage_authoring_batch for large resumable proposals.',{...scope,proposal,auto_commit:b},['project_id','run_id','proposal'],a=>{author.stage({...a,batch_key:'complete.proposal'});return author.finalize({...a,review_only:a.auto_commit===false});});
  add('solution.commit_semantic_feature_set','Publish a validated review-only authoring run.',scope,['project_id','run_id'],a=>author.finalize(a));
  add('solution.get_semantic_diff','Compact authored batch and publication summary; does not dump source Markdown or plans.',scope,['project_id','run_id'],a=>author.status(a));
  add('solution.list_architectures','List architecture groups and feature counts in one project.',{project_id:s},['project_id'],a=>author.listArchitectures(a));
  add('solution.get_architecture_context','Return architecture technology, mappings, progress and bounded remaining work, accounting for dependencies across architectures.',{project_id:s,architecture_key:s,limit:{type:'integer',minimum:1,maximum:25}},['project_id','architecture_key'],a=>author.context(a));
  add('solution.set_feature_architecture','Move a root feature and its descendants, edge cases and tests to another architecture; preserve F-numbers and dependencies.',{project_id:s,reference:s,architecture_key:s,expected_graph_version:i},['project_id','reference','architecture_key','expected_graph_version'],a=>author.move(a));
  add('solution.list_workflow_templates','List planning templates; templates create architecture structure and never preset features or code.',{},[],()=>({templates:[{id:FULLSTACK_TEMPLATE.id,title:FULLSTACK_TEMPLATE.title}]}));
  add('solution.get_workflow_template','Read full planning guidance and architecture definitions for a template.',{template_id:s},['template_id'],a=>author.template(a));
  add('solution.apply_workflow_template','Idempotently add missing template architectures to a project; creates zero features and zero application files. Prepare a fresh run afterward.',{project_id:s,template_id:s},['project_id','template_id'],a=>author.applyTemplate(a));
  return defs;
}

export function retireGeneration(){const error=new Error('Automatic lexical generation is retired. Use solution.start_plan_graph_workflow, read_plan_source, stage_authoring_batch and finalize_plan_graph_workflow. Codex authors all features, edge cases and plans.');error.code='LEGACY_GENERATION_RETIRED';throw error;}
