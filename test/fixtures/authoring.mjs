import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LsgStore } from '../../src/core/db.mjs';
import { LsgService } from '../../src/core/service.mjs';

export const markdownPlan = title => `# ${title} implementation\n\n## Implementation\nBuild the bounded outcome using the owning architecture and its declared dependencies. Validate input, keep state consistent and document the contract.\n\n## Validation\nExercise the successful outcome and repeat the failure scenario. Verify the observable acceptance criteria with automated regression tests.\n`;
export function authoringFixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-authoring-'));
  const store=new LsgStore(path.join(dir,'data','lsg.sqlite')),service=new LsgService(store,{workspaceRoot:dir});
  const plan=path.join(dir,'MASTER.md');fs.writeFileSync(plan,'# Website\n\nCreate a TypeScript frontend, ASP.NET API and MySQL persistence.\n');
  return {dir,store,service,plan,close(){store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
export function completeProposal(source) {
  const citation={source_id:source.id,source_hash:source.source_hash,start_line:1,end_line:source.line_count};
  const architectures=[{key:'frontend',title:'TypeScript frontend',technology:'TypeScript'},{key:'backend',title:'ASP.NET backend',technology:'ASP.NET / C#'},{key:'database',title:'MySQL database',technology:'MySQL'}];
  const features=architectures.map((a,index)=>({key:`${a.key}.outcome`,architecture_key:a.key,title:a.title,outcome:`Deliver the ${a.title} outcome`,priority:`P${index}`,importance_rationale:'This source-backed layer is necessary for the website outcome.',source_citations:[citation],acceptance_criteria:[`The ${a.title} outcome works`],non_goals:[],depends_on:index===0?['backend.outcome']:index===1?['database.outcome']:[],implementation_plan:markdownPlan(a.title),edge_cases:[{key:`${a.key}.failure`,title:`${a.title} failure`,trigger:'A dependent operation fails',expected_behavior:'Keep state consistent and report a recoverable error',severity:'high',validation_scenario:'Force dependency failure and validate recovery',implementation_plan:markdownPlan(`${a.title} failure`)}]}));
  return {architectures,features,coverage:[{...citation,disposition:'feature',feature_keys:features.map(f=>f.key)}]};
}
export function readAll(service,projectId,runId,sources) {
  for(const source of sources){let cursor;do{const page=service.authoring.read({project_id:projectId,run_id:runId,source_id:source.id,cursor,limit:2});cursor=page.next_cursor;}while(cursor);}
}
export function publishFixture(r){const start=r.service.startPlanGraphWorkflow({plan_file_path:r.plan});readAll(r.service,start.project.id,start.run_id,start.sources);const proposal=completeProposal(start.source);r.service.authoring.stage({project_id:start.project.id,run_id:start.run_id,batch_key:'website.complete',proposal});const published=r.service.authoring.finalize({project_id:start.project.id,run_id:start.run_id});return {start,proposal,published};}
