import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHttpServer } from '../src/http/server.mjs';
import { McpProtocol } from '../src/mcp/protocol.mjs';
import { loadConfig } from '../src/core/config.mjs';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { authoringFixture,publishFixture,completeProposal,readAll } from '../test/fixtures/authoring.mjs';

const fixture=authoringFixture(),{start,proposal}=publishFixture(fixture),projectId=start.project.id;
// Populate all three architecture rings with meaningful child units and cases.
const fresh=fixture.service.authoring.prepare({project_id:projectId});readAll(fixture.service,projectId,fresh.run_id,fresh.sources);
const dense=completeProposal(start.source);
for(const root of proposal.features)for(let index=1;index<=7;index++)dense.features.push({...root,key:`${root.key}.child${index}`,parent_key:root.key,title:`${root.title} child ${index}`,depends_on:[],edge_cases:root.edge_cases.map(ec=>({...ec,key:`${ec.key}.child${index}`}))});
fixture.service.authoring.stage({project_id:projectId,run_id:fresh.run_id,batch_key:'dense.website',proposal:dense});fixture.service.authoring.finalize({project_id:projectId,run_id:fresh.run_id});
const config={...loadConfig({LSG_DB_PATH:fixture.store.dbPath}),port:0,allowedHosts:[],allowedOrigins:[],apiToken:'architecture-browser',rateLimitPerMinute:10000};
const app=createHttpServer({service:fixture.service,protocol:new McpProtocol(fixture.service),config,log:()=>{}}),address=await app.listen();
const browser=await chromium.launch({headless:true,...browserLaunchOptions()}),page=await browser.newPage({viewport:{width:1700,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.addInitScript(()=>sessionStorage.setItem('lsg_api_token','architecture-browser'));
  await page.goto(`http://127.0.0.1:${address.port}/?workspace=${encodeURIComponent(fixture.dir)}`);
  await page.waitForSelector('.cards .node');await page.waitForFunction(()=>document.querySelectorAll('.cards .node').length===72);
  assert.equal(await page.locator('.architectureLabel').count(),3);
  assert.equal(await page.locator('#architectureFilter option').count(),4);
  const overlap=await page.locator('.cards .node').evaluateAll(nodes=>{const boxes=nodes.map(n=>n.getBoundingClientRect());return boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));});assert.equal(overlap,false);
  await page.locator('#fitGraph').click();
  const screenshotDir=process.env.LSG_BROWSER_SCREENSHOT_DIR||fixture.dir;fs.mkdirSync(screenshotDir,{recursive:true});
  await page.screenshot({path:path.join(screenshotDir,'architecture-circles.png'),fullPage:true});
  await page.locator('#architectureFilter').selectOption('frontend');await page.waitForFunction(()=>document.querySelectorAll('.cards .node').length===24);
  assert.equal(await page.locator('.architectureLabel').count(),1);await page.locator('#fitArchitecture').click();
  const frontend=fixture.service.getSemanticFeatureList({project_id:projectId,architecture_key:'frontend'}).features.find(f=>!f.metadata.parent_semantic_key),card=page.locator(`.node[data-id="${frontend.id}"]`);
  await card.focus();await page.keyboard.press('Enter');await page.waitForSelector('#semanticFeatureForm');assert.equal(await page.locator('#semanticFeatureForm [name="title"]').inputValue(),frontend.title);
  await page.waitForFunction(()=>document.querySelector('#planPreview h1')?.textContent.includes('implementation'));
  await page.locator('#planPreview').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(screenshotDir,'architecture-plan-editor.png'),fullPage:true});
  await page.locator('#architectureFilter').selectOption('');await page.waitForFunction(()=>document.querySelectorAll('.cards .node').length===72);await page.locator('#fitGraph').click();
  const edge=page.locator(`.worldEdges path[data-source="${frontend.id}"][data-target="${frontend.dependencies[0].id}"]`);assert.equal(await edge.count(),1);const before=await edge.getAttribute('d');const box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+25,{steps:6});await page.waitForTimeout(80);assert.notEqual(await edge.getAttribute('d'),before);await page.mouse.up();const transform=await card.evaluate(node=>node.style.transform);
  await page.reload();await page.waitForSelector(`.node[data-id="${frontend.id}"]`);assert.equal(await card.evaluate(node=>node.style.transform),transform);
  await page.locator('#sourceTab').click();await page.waitForSelector('.sourceDocuments h2');assert.match(await page.locator('.sourceDocuments').textContent(),/TypeScript/);
  await page.locator('#semanticTab').click();await page.waitForSelector('.cards .node');
  await page.locator('#sourcePath').fill(fixture.plan);await page.locator('#previewPlan').click();await page.waitForFunction(()=>document.querySelector('#importSummary')?.textContent.includes('Source registered'));
  assert.equal(fixture.store.listNodes(projectId).filter(n=>n.status==='active').length,72);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,cards:72,architecture_circles:3,tested:['dense architecture circles without overlaps','cross-circle connection tracking during dragging','architecture filter and fit','saved placement on reload','selected feature editor and rendered Markdown','original source view','registration creates no inferred nodes'],screenshots:screenshotDir}));
}finally{await browser.close();await app.close();fixture.close();}
