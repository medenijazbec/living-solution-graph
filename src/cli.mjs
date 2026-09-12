#!/usr/bin/env node
import process from 'node:process';
import { LsgStore } from './core/db.mjs';
import { LsgService } from './core/service.mjs';
import { loadConfig, assertSecureConfig } from './core/config.mjs';
import { McpProtocol } from './mcp/protocol.mjs';
import { serveStdio } from './mcp/stdio.mjs';
import { createHttpServer } from './http/server.mjs';

function usage() {
  console.error(`Living Solution Graph MCP v6.1.0\n\nUsage:\n  lsg-mcp stdio\n  lsg-mcp http\n  lsg-mcp doctor\n\nEnvironment: see .env.example`);
}

function buildRuntime(config) {
  const store = new LsgStore(config.dbPath);
  const service = new LsgService(store, { workspaceRoot: config.workspaceRoot });
  const protocol = new McpProtocol(service);
  return { store, service, protocol };
}

async function main() {
  const command = process.argv[2] || 'http';
  if (command === '--help' || command === '-h' || command === 'help') { usage(); return; }
  const config = loadConfig();
  const runtime = buildRuntime(config);
  const closeStore = () => { try { runtime.store.close(); } catch {} };

  if (command === 'doctor') {
    const packCount = runtime.service.listStarterPacks().packs.length;
    console.log(JSON.stringify({ ok: true, version: '6.1.0', node: process.version, db_path: config.dbPath, starter_packs: packCount }, null, 2));
    closeStore();
    return;
  }

  if (command === 'stdio') {
    process.on('exit', closeStore);
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(130));
    await serveStdio(runtime.protocol, { log: (m) => console.error(m) });
    closeStore();
    return;
  }

  if (command === 'http') {
    assertSecureConfig(config);
    const app = createHttpServer({ service: runtime.service, protocol: runtime.protocol, config, log: (m) => console.error(m) });
    const address = await app.listen();
    const host = typeof address === 'object' && address ? address.address : config.host;
    const port = typeof address === 'object' && address ? address.port : config.port;
    console.log(`Living Solution Graph v6.1.0 listening on http://${host}:${port}`);
    console.log(`MCP: http://${host}:${port}/mcp`);
    const shutdown = async (code=0) => { try { await app.close(); } finally { closeStore(); process.exit(code); } };
    process.on('SIGTERM', () => shutdown(0));
    process.on('SIGINT', () => shutdown(130));
    return;
  }

  usage();
  closeStore();
  process.exitCode = 2;
}

main().catch((e) => { console.error(e?.stack || e); process.exitCode = 1; });
