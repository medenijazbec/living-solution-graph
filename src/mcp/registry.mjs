const obj=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const s={type:'string'}, b={type:'boolean'}, i={type:'integer'}, n={type:'number'};

export function buildRegistry(service){
  const defs=[];
  const add=(name,description,inputSchema,handler)=>defs.push({name,description,inputSchema,handler});

  add('solution.create_project','Create a Living Solution Graph project.',obj({project_id:s,title:s,description:s,metadata:{type:'object'}},['project_id','title']),a=>service.createProject(a));
  add('solution.resolve_workspace_project','Resolve the current working directory or repository root to its isolated LSG project, adopting an existing repository_root binding or creating one when needed.',obj({working_directory:s,project_id:s,project_title:s,description:s},['working_directory']),a=>service.resolveWorkspaceProject(a));
  add('solution.bootstrap_from_markdown_plan','Import a normal Markdown plan, detect project archetypes, seed domain-aware baseline features/edge cases, expand generic edge cases, and optionally commit the graph baseline.',obj({project_id:s,project_title:s,file_name:s,markdown:s,file_uri:s,mode:{type:'string',enum:['preview_only','create_project_baseline','merge_update']},expected_graph_version:i,policy:{type:'object'},starter_pack_mode:{type:'string'},starter_pack_ids:{type:'array',items:s},min_archetype_confidence:n,allow_model_edge_case_expansion:b,max_edge_cases_per_feature_per_pass:i},['project_id','mode','expected_graph_version']),a=>service.bootstrapFromMarkdownPlan(a));
  add('solution.preview_markdown_plan','Analyze and stage a Markdown plan without mutating graph nodes.',obj({project_id:s,file_name:s,markdown:s,file_uri:s,expected_graph_version:i,starter_pack_mode:s,starter_pack_ids:{type:'array',items:s},min_archetype_confidence:n,allow_model_edge_case_expansion:b,max_edge_cases_per_feature_per_pass:i},['project_id','expected_graph_version']),a=>service.previewMarkdownPlan(a));
  add('solution.commit_plan_import','Atomically materialize a previewed Markdown import against an expected graph version.',obj({project_id:s,import_session_id:s,expected_graph_version:i,reason:s},['project_id','import_session_id','expected_graph_version']),a=>service.commitPlanImport(a));
  add('solution.get_plan_import','Read plan import analysis/result metadata.',obj({project_id:s,import_session_id:s},['project_id','import_session_id']),a=>service.getPlanImport(a));
  add('solution.get_bootstrap_report','Return the import analysis, starter evaluations, and current implementation audit.',obj({project_id:s,import_session_id:s},['project_id','import_session_id']),a=>service.getBootstrapReport(a));
  add('solution.reconcile_plan_import','Compare plan implementation claims with current graph implementation truth.',obj({project_id:s,import_session_id:s},['project_id','import_session_id']),a=>service.reconcilePlanImport(a));
  add('solution.set_implementation_state','Set the explicit implemented boolean for a feature/edge case/requirement. Also updates implementation_state, timestamps, optional commit SHA, and stales verification when reopened.',obj({project_id:s,node_id:s,implemented:b,implementation_state:s,expected_graph_version:i,expected_node_version:i,commit_sha:s,reason:s,actor:s},['project_id','node_id','implemented','expected_graph_version']),a=>service.setImplementationState(a));
  add('solution.set_verification_state','Set verification state independently from implementation state and optionally attach evidence.',obj({project_id:s,node_id:s,verification_state:{type:'string',enum:['unverified','verifying','verified','failed','stale']},expected_graph_version:i,expected_node_version:i,evidence:{type:'object'},reason:s,actor:s},['project_id','node_id','verification_state','expected_graph_version']),a=>service.setVerificationState(a));
  add('solution.record_evidence','Attach implementation/test/e2e evidence to a graph node.',obj({project_id:s,node_id:s,kind:s,summary:s,commit_sha:s,artifact_uri:s,details:{type:'object'},expected_graph_version:i,expected_node_version:i,actor:s},['project_id','node_id','summary','expected_graph_version','expected_node_version']),a=>service.recordEvidence(a));
  add('solution.audit_implementation_status','Traverse the entire graph and return implemented, not implemented, verified, unverified, stale, blocked, and plan-claimed status inventories.',obj({project_id:s,types:{type:'array',items:s}},['project_id']),a=>service.auditImplementationStatus(a));
  add('solution.add_edge_case','Let the model insert a newly discovered edge case into the graph under a feature. When the parent is semantic, the edge case keeps semantic numbering and count visibility. New edge cases start implemented=false and unverified.',obj({project_id:s,parent_feature_id:s,title:s,description:s,category:s,severity:s,disposition:s,reason:s,trigger:s,expected_behavior:s,validation_scenario:s,origin:s,actor:s,expected_graph_version:i},['project_id','parent_feature_id','title','expected_graph_version']),a=>service.addEdgeCase(a));
  add('solution.get_graph_view','Return connected graph nodes/edges for rendering. Nodes include live implementation, verification, timestamps, and inherited commit metadata.',obj({project_id:s,include_types:{type:'array',items:s}},['project_id']),a=>service.getGraphView(a));
  add('solution.search','Search graph nodes by normalized lexical relevance.',obj({project_id:s,query:s,limit:i},['project_id','query']),a=>service.search(a));
  add('solution.find_gaps','Return the current implementation/completeness gaps.',obj({project_id:s},['project_id']),a=>service.findGaps(a));
  add('solution.get_frontier','Return a bounded completion frontier for an implementation agent.',obj({project_id:s,limit:i},['project_id']),a=>service.getFrontier(a));
  add('solution.get_context','Compile project graph + completion frontier + compressed user memory for a model call.',obj({project_id:s,user_id:s,memory_budget_tokens:i,frontier_limit:i,max_nodes:i,max_edges:i},['project_id']),a=>service.getContext(a));
  add('solution.list_starter_packs','List versioned domain starter coverage packs.',obj(),()=>service.listStarterPacks());
  add('solution.detect_project_archetypes','Detect likely project archetypes from Markdown/text.',obj({markdown:s,min_archetype_confidence:n},['markdown']),a=>service.detectProjectArchetypes(a));
  add('solution.apply_starter_pack','Apply one domain starter pack to an existing project graph.',obj({project_id:s,pack_id:s,expected_graph_version:i},['project_id','pack_id','expected_graph_version']),a=>service.applyStarterPack(a));
  add('solution.get_starter_pack_evaluation','Read starter-pack evaluation provenance for a project/import.',obj({project_id:s,import_session_id:s},['project_id']),a=>service.getStarterPackEvaluation(a));
  add('solution.prepare_semantic_feature_set','Create a bounded source-evidence brief for Codex to author a semantic implementation-unit and edge-case proposal. This tool does not modify the live graph.',obj({project_id:s,source_import_id:s,scope:s,max_features:i,source_node_limit:i,actor:s},['project_id']),a=>service.prepareSemanticFeatureSet(a));
  add('solution.stage_semantic_feature_set','Validate, persist, and automatically commit a Codex-authored semantic feature/edge-case proposal. Set auto_commit=false only for an explicitly requested review-only workflow.',obj({project_id:s,run_id:s,proposal:{type:'object'},max_features:i,auto_commit:b,actor:s},['project_id','run_id','proposal']),a=>service.stageSemanticFeatureSet(a));
  add('solution.commit_semantic_feature_set','Atomically materialize an explicitly approved staged semantic proposal into the live graph.',obj({project_id:s,run_id:s,expected_graph_version:i,actor:s},['project_id','run_id','expected_graph_version']),a=>service.commitSemanticFeatureSet(a));
  add('solution.get_semantic_feature_list','Return active Codex-authored implementation units ordered by priority with dependencies, edge cases, and acceptance tests.',obj({project_id:s},['project_id']),a=>service.getSemanticFeatureList(a));
  add('solution.get_semantic_edge_cases','Return semantic edge cases globally or for one semantic feature ID/key.',obj({project_id:s,feature_id:s,semantic_key:s},['project_id']),a=>service.getSemanticEdgeCases(a));
  add('solution.get_semantic_diff','Return a staged or committed semantic proposal diff.',obj({project_id:s,run_id:s},['project_id','run_id']),a=>service.getSemanticDiff(a));
  add('solution.resolve_semantic_feature_reference','Resolve a human reference such as F1, F1.2, or 1 to its semantic feature, descendants, and edge cases before staging an update.',obj({project_id:s,reference:s},['project_id','reference']),a=>service.resolveSemanticFeatureReference(a));
  add('solution.reindex_semantic_features','Assign missing stable F-number display IDs to active semantic features without changing their source evidence.',obj({project_id:s,actor:s},['project_id']),a=>service.reindexSemanticFeatures(a));
  add('solution.update_semantic_feature','Edit a semantic feature while preserving its stable semantic key and F-number. Acceptance tests are synchronized atomically.',obj({project_id:s,node_id:s,expected_graph_version:i,expected_node_version:i,title:s,outcome:s,priority:{type:'string',enum:['P0','P1','P2','P3']},acceptance_criteria:{type:'array',items:s},non_goals:{type:'array',items:s},actor:s},['project_id','node_id','expected_graph_version','expected_node_version']),a=>service.updateSemanticFeature(a));
  add('solution.set_node_implementation_plan','Attach or replace a Markdown implementation plan on a feature or edge case.',obj({project_id:s,node_id:s,file_name:s,markdown:s,expected_document_version:i,actor:s},['project_id','node_id','markdown']),a=>service.setNodeImplementationPlan(a));
  add('solution.get_node_implementation_plan','Read the Markdown implementation plan attached to a feature or edge case.',obj({project_id:s,node_id:s},['project_id','node_id']),a=>service.getNodeImplementationPlan(a));

  add('memory.remember','Store durable user history as a versionable memory atom.',obj({user_id:s,text:s,kind:s,subject:s,value:s,scope:s,project_id:s,confidence:n,salience:n,source:s,metadata:{type:'object'}},['user_id']),a=>service.remember(a));
  add('memory.search','Search active user memory atoms.',obj({user_id:s,project_id:s,query:s,include_inactive:b,limit:i},['user_id']),a=>service.memorySearch(a));
  add('memory.get_context','Return a token-budgeted compressed user-memory projection for the current request/project.',obj({user_id:s,project_id:s,budget_tokens:i},['user_id']),a=>service.memoryContext(a));
  add('memory.correct','Supersede a memory atom with a corrected version rather than destructively overwriting history.',obj({user_id:s,memory_id:s,value:s,kind:s,subject:s,scope:s,project_id:s,confidence:n,salience:n,source:s},['user_id','memory_id','value']),a=>service.memoryCorrect(a));
  add('memory.forget','Mark a memory atom forgotten so it is excluded from future context.',obj({user_id:s,memory_id:s},['user_id','memory_id']),a=>service.memoryForget(a));

  return defs;
}

export function publicTools(registry){return registry.map(({handler,...d})=>d).sort((a,b)=>a.name.localeCompare(b.name));}

export function validateArgs(schema,args){
  args=args??{};
  if(schema.type==='object' && (typeof args!=='object'||Array.isArray(args))) return 'arguments must be an object';
  for(const key of schema.required||[]) if(args[key]===undefined||args[key]===null) return `missing required argument: ${key}`;
  for(const [key,value] of Object.entries(args)){
    const rule=schema.properties?.[key]; if(!rule) continue;
    if(rule.type==='string'&&typeof value!=='string')return `${key} must be a string`;
    if(rule.type==='boolean'&&typeof value!=='boolean')return `${key} must be a boolean`;
    if(rule.type==='integer'&&!Number.isInteger(value))return `${key} must be an integer`;
    if(rule.type==='number'&&typeof value!=='number')return `${key} must be a number`;
    if(rule.type==='array'&&!Array.isArray(value))return `${key} must be an array`;
    if(rule.enum&&!rule.enum.includes(value))return `${key} must be one of: ${rule.enum.join(', ')}`;
  }
  return null;
}
