import { importanceScale } from '../core/workspace.mjs';

export function workspaceTools(service){
  const s={type:'string'},i={type:'integer'},b={type:'boolean'},o={type:'object'},strings={type:'array',items:s};
  const scope={project_id:s,node_id:s,reference:s,recursive:b,limit:i};
  const defs=[];const add=(name,description,properties,required,handler)=>defs.push({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},handler});
  add('solution.get_counts','Count unique semantic features, subfeatures, edge cases, combined items, completion categories and flags.',scope,['project_id'],a=>{const {items,...counts}=service.workspace.progress(a);return counts;});
  add('solution.get_feature_progress','Return direct and recursive feature completion including required edge cases and acceptance tests.',scope,['project_id'],a=>service.workspace.progress(a));
  add('solution.list_remaining_work','List incomplete work ordered by dependency readiness and instance importance.',scope,['project_id'],a=>service.workspace.remaining(a));
  add('solution.get_importance_scale','Read ordered instance importance levels and scale version.',{project_id:s},[],()=>importanceScale(service.store));
  add('solution.set_importance_scale','Configure ordered instance importance levels; map any removed levels that are in use.',{project_id:s,levels:{type:'array',items:o},expected_version:i,replacements:o,actor:s},['levels','expected_version'],a=>service.workspace.setScale(a));
  add('solution.set_feature_importance','Set developer priority override and rationale, preserving the feature number.',{...scope,priority:s,rationale:s,expected_node_version:i},['project_id','reference','priority','rationale','expected_node_version'],a=>service.workspace.setImportance(a));
  add('solution.claim_next_work','Claim one dependency-ready task for sequential execution. No agent processes are launched.',{...scope,owner:s,scope:s,parent_work_id:s,delegation_requested:b},['project_id','owner'],a=>service.workspace.work(a,'claim'));
  add('solution.get_work_context','Load claimed task, implementation plans, mapped files, dependencies and project memory.',{project_id:s,work_id:s},['project_id','work_id'],a=>service.workspace.work(a,'context'));
  add('solution.update_work','Renew, release or submit work results. Submission does not verify the node.',{project_id:s,work_id:s,owner:s,expected_version:i,action:{type:'string',enum:['renew','release','submit']},result:o},['project_id','work_id','owner','expected_version','action'],a=>service.workspace.work(a,'update'));
  add('solution.review_work','Review submitted work with current automated_test or manual_verification evidence.',{project_id:s,work_id:s,expected_version:i,reviewer:s,approved:b,evidence:o},['project_id','work_id','expected_version','reviewer','approved','evidence'],a=>service.workspace.work(a,'review'));
  for(const [suffix,action] of [['remember','remember'],['search','search'],['get_project_context','context'],['correct','correct'],['forget','forget']]){
    const name=suffix==='get_project_context'?'memory.get_project_context':`memory.${suffix}_project`;
    const required=['project_id'];if(['correct','forget'].includes(action))required.push('memory_id','expected_version');if(['remember','correct'].includes(action))required.push('text');
    add(name,'Explicit project memory, isolated from personal memory and transient file activity.',{project_id:s,node_id:s,text:s,kind:s,memory_id:s,expected_version:i,query:s,limit:i,budget_tokens:i},required,a=>service.workspace.memory(a,action));
  }
  add('solution.get_node_history','Read definition revisions, Markdown plan revisions, events and associated Git commits.',scope,['project_id','reference'],a=>service.workspace.history(a));
  add('solution.sync_git_history','Associate local Git commit metadata with mapped nodes; never stores patches or treats associations as implementation proof.',{project_id:s,node_id:s,commit_sha:s,limit:i},['project_id'],a=>service.workspace.syncGit(a));
  add('solution.set_node_file_links','Map repository-relative files/directories to a feature or edge case for context and optional live activity.',{project_id:s,reference:s,node_id:s,paths:strings},['project_id','paths'],a=>service.activity.links(a));
  add('solution.get_activity_status','Read local session activity status. Disabled after every server restart.',{project_id:s},['project_id'],a=>service.activity.status(a));
  add('solution.set_activity_enabled','Explicitly enable/disable local temporary activity for one project. Events contain no file contents and are never persisted.',{project_id:s,enabled:b},['project_id','enabled'],a=>service.activity.enable(a));
  add('solution.read_node_file','Read a mapped source file and automatically pulse its node if activity is enabled.',{project_id:s,node_id:s,reference:s,path:s,actor:s},['project_id','path'],a=>service.activity.read(a));
  return defs;
}
