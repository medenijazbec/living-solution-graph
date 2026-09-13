import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { LsgStore } from '../src/core/db.mjs';import { LsgService } from '../src/core/service.mjs';import { McpProtocol, MODERN_PROTOCOL, LEGACY_PROTOCOL } from '../src/mcp/protocol.mjs';
function rt(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lsg-proto-'));const store=new LsgStore(path.join(dir,'db.sqlite'));const service=new LsgService(store,{workspaceRoot:dir});return{dir,store,service,protocol:new McpProtocol(service),close(){store.close();fs.rmSync(dir,{recursive:true,force:true});}}}
const meta={"io.modelcontextprotocol/protocolVersion":MODERN_PROTOCOL,"io.modelcontextprotocol/clientCapabilities":{tools:{},resources:{},prompts:{}}};
const modern=(id,method,params={})=>({jsonrpc:'2.0',id,method,params:{...params,_meta:{...(params._meta||{}),...meta}}});

test('modern 2026 MCP discover/list/call/read resource',async()=>{const r=rt();try{
  let x=await r.protocol.handle(modern(1,'server/discover'),{era:'modern'});assert.equal(x.result._meta['io.modelcontextprotocol/serverInfo'].version,'6.1.0');assert.equal(x.result.resultType,'complete');assert.deepEqual(x.result.supportedVersions,[MODERN_PROTOCOL]);
  x=await r.protocol.handle(modern(2,'tools/list'),{era:'modern'});assert.ok(x.result.tools.some(t=>t.name==='solution.add_edge_case'));assert.ok(x.result.tools.some(t=>t.name==='solution.audit_implementation_status'));assert.ok(x.result.tools.some(t=>t.name==='solution.prepare_semantic_feature_set'));assert.ok(x.result.tools.some(t=>t.name==='solution.resolve_workspace_project'));assert.ok(x.result.tools.some(t=>t.name==='solution.set_node_implementation_plan'));const stage=x.result.tools.find(t=>t.name==='solution.stage_semantic_feature_set');assert.equal(stage.inputSchema.properties.auto_commit.type,'boolean');
  x=await r.protocol.handle(modern(3,'tools/call',{name:'solution.create_project',arguments:{project_id:'mcp-p',title:'MCP project'}}),{era:'modern'});assert.equal(x.result.isError,undefined);assert.equal(x.result.structuredContent.id,'mcp-p');
  x=await r.protocol.handle(modern(4,'resources/read',{uri:'solution://server/version'}),{era:'modern'});assert.equal(x.result.contents[0].mimeType,'application/json');
}finally{r.close();}});

test('semantic prompt instructs tool use, compact navigation, workspace resolution, and automatic commit',async()=>{const r=rt();try{const x=await r.protocol.handle(modern(10,'prompts/get',{name:'provide_semantic_feature_list',arguments:{project_id:'project'}}),{era:'modern'});const text=x.result.messages[0].content.text;assert.match(text,/callable MCP tools/);assert.match(text,/solution\.run_program/);assert.match(text,/resolve_workspace_project/);assert.match(text,/automatically commits/);assert.match(text,/recursive edge-case counts/);}finally{r.close();}});

test('modern MCP rejects missing protocol/capability metadata',async()=>{const r=rt();try{const x=await r.protocol.handle({jsonrpc:'2.0',id:1,method:'tools/list',params:{}},{era:'modern'});assert.equal(x.error.code,-32602);}finally{r.close();}});

test('legacy MCP initialize and tools work',async()=>{const r=rt();try{let x=await r.protocol.handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:LEGACY_PROTOCOL,capabilities:{},clientInfo:{name:'test',version:'1'}}},{era:'legacy'});assert.equal(x.result.protocolVersion,LEGACY_PROTOCOL);x=await r.protocol.handle({jsonrpc:'2.0',id:2,method:'tools/list',params:{}},{era:'legacy'});assert.ok(x.result.tools.length>20);}finally{r.close();}});

test('modern unsupported version returns -32022 with server supported versions',async()=>{const r=rt();try{const bad={jsonrpc:'2.0',id:7,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2099-01-01','io.modelcontextprotocol/clientCapabilities':{}}}};const x=await r.protocol.handle(bad,{era:'modern'});assert.equal(x.error.code,-32022);assert.deepEqual(x.error.data.supportedVersions,[MODERN_PROTOCOL]);}finally{r.close();}});
