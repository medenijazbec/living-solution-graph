# Living Solution Graph v6.0.0 — Internal Test Report

**Release:** 6.0.0  
**Date:** 2026-09-04  
**Runtime tested:** Node.js v22.16.0  
**Persistence:** built-in `node:sqlite`, WAL mode  

## Final automated test run

Command:

```bash
NODE_NO_WARNINGS=1 npm test
```

Result:

```text
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Covered scenarios include:

1. Domain-aware Markdown bootstrap.
2. Plan `[x]`/done claims remain claims rather than automatically verified truth.
3. Model-created edge-case insertion.
4. `implemented` boolean transition and commit SHA attachment.
5. Independent verification transition with evidence.
6. Verified nodes become stale when implementation is reopened.
7. Child nodes inherit parent commit metadata.
8. User-memory correction, supersession, forget, and compressed context.
9. Workspace path traversal is rejected.
10. Stale import previews are rejected by graph-version optimistic concurrency.
11. Re-imports deduplicate rather than clone existing nodes.
12. Game starter coverage adds engine/platform/save/online concerns when applicable.
13. HTTP MCP E2E: create project → preview Markdown → commit graph → inspect connected graph → add edge case → implement → verify → audit.
14. HTTP bearer-auth enforcement.
15. Modern HTTP MCP standard-header mismatch rejection.
16. Modern MCP 2026-07-28 stdio `server/discover` + tool listing with `resultType=complete`.
17. Legacy 2025-era stdio initialize + tools + tool call.
18. Modern protocol unsupported-version error `-32022`.

## Smoke test

Command:

```bash
NODE_NO_WARNINGS=1 npm run smoke
```

Result:

```json
{
  "ok": true,
  "created_nodes": 112,
  "tracked": 102
}
```

## Package verification

Command:

```bash
NODE_NO_WARNINGS=1 npm run verify
```

Result:

```json
{
  "ok": true,
  "syntax_checked": 16,
  "required_files": 9
}
```

## npm package import test

The generated `dist/living-solution-graph-mcp-6.0.0.tgz` was installed into an empty temporary npm project **offline** and its installed executable was invoked:

```text
{
  "ok": true,
  "version": "6.0.0",
  "node": "v22.16.0",
  "starter_packs": 9
}
```

This verifies that the packaged `lsg-mcp` binary is actually installable and executable without depending on files outside the npm package.

## Real CLI HTTP process smoke

`node src/cli.mjs http` was launched as a separate process on localhost. The following endpoints were read successfully:

- `/healthz`
- `/v1/models`

The process advertised `/mcp` and shut down cleanly.

## Protocol compatibility basis

The implementation was aligned with the current MCP 2026-07-28 wire requirements: modern per-request metadata, `server/discover`, modern result discrimination (`resultType`), response server info metadata, and Streamable HTTP standard header validation. It also implements legacy 2025-era initialize semantics for compatibility.

The sandbox could not resolve the npm registry during an attempt to install the official MCP client SDK, so the final test suite uses direct protocol-level E2E requests rather than an official-SDK client process. This limitation is explicit rather than hidden; the project contains no MCP SDK runtime dependency.

## Deployment boundary

The packaged implementation is suitable for a single active server instance with a local persistent SQLite database. Horizontal multi-host writes require a shared transactional storage adapter; the package does not claim HA/multi-writer SQLite support.
