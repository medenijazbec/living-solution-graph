import { McpProtocol } from '../src/index.mjs';
import { authoringFixture, publishFixture } from '../test/fixtures/authoring.mjs';
const fixture=authoringFixture();
try{
  const {start,published}=publishFixture(fixture),counts=fixture.service.workspace.progress({project_id:start.project.id});
  const protocol=new McpProtocol(fixture.service);
  const initialized=await protocol.handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'smoke',version:'1'}}},{era:'legacy'});
  if(published.status!=='committed'||counts.combined_total!==6||published.missing_plans!==0||initialized.result?.serverInfo?.version!=='7.0.0')throw new Error('Authoring smoke failed');
  console.log(JSON.stringify({ok:true,architectures:published.architecture_count,features:counts.features_total,edge_cases:counts.edge_cases_total,missing_plans:published.missing_plans},null,2));
}finally{fixture.close();}
