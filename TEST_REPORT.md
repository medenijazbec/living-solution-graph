# LSG 6.2.0 release verification

## MCP tool and repository quality pass — 2026-09-13

- All 76 registered MCP tools passed registry uniqueness, description, strict-schema, and protocol dispatch checks.
- Shared validation rejects unknown arguments, values outside declared bounds, non-finite numbers, malformed nested objects, and invalid array members.
- Functional suite: 58/58 tests passed.
- Smoke, package verification, and isolated doctor checks passed.
- Dense Chromium workspace suite passed with 80 cards, 55 connections, drag tracking, zoom/pan, activity, editors, deletion workflows, selected-node backglow, and breathing connections.
- Chromium orbital suite passed texture, motion, failure fallback, GPU downsampling, context-loss, layout, and request-isolation checks.
- The browser dependency is now declared and test scripts can use Playwright Chromium or an explicitly configured/local Chrome or Edge executable.
- A SQLite-safe copy of the installed Eden database passed the project-integrity audit across 3,355 nodes and 3,621 edges with zero structural errors. The audit reported 117 non-blocking legacy-curation warnings: 54 missing importance rationales and 63 older evidence references without explicit source-layer metadata.

## Orbital motion refinement — 2026-09-13

- Browser regression checks a star-free sky, CSS background blur, slow surface motion, and the direction of the surface movement using WebGL pixel correlation. Pause, reduced-motion, texture fallback, GPU downsampling, context loss and dense-graph interactions remain in the release gate.

## Orbital workspace update — 2026-09-13

- 40 automated tests passed; smoke, package verification (32 JavaScript files) and isolated doctor passed.
- Dense Chromium graph fixture passed: 81 cards, drag/zoom/pan, persistence, non-overlap and activity pulse checks.
- Orbital Chromium suite passed: compact buttons, project creation, larger Projects heading, import spacing, collapse/narrow layout, rotating Earth, visible star pixels, 8192px texture, pause/reduced motion, local-only asset requests, texture/upload-error fallback, simulated 1024px GPU limit and actual WebGL context loss.
- Image source: NASA VIIRS 10800px composite, compressed to 8192 × 4096 WebP quality 82 (6,761,404 bytes). User requested higher detail after the initial smaller texture; no Moon assets are distributed.
- Independent read-only code review found two medium issues (collapsed sidebar padding and GPU upload errors); both were reproduced in tests and fixed. Follow-up review found no remaining high/medium issues.
- Hidden-tab animation cancellation was code-reviewed; the browser suite does not simulate actual tab occlusion. No graph or database migration is part of this visual change.

## Original release checks

Tested on Windows with Node.js 22.16.0, 2026-09-12.

- Automated suite: 40 passing tests, including HTTP semantic prepare → stage → diff → explicit commit → context/frontier/counts.
- Smoke test: passed (112 created nodes, 102 tracked).
- Package syntax verification: passed.
- Doctor: passed with an isolated test database.
- Real Chromium browser: 81-card Eden-inspired dense fixture; non-overlapping placement, free drag, reload/filter persistence, zoom/pan, new-card placement preserving existing cards, activity pulses without layout movement, disable and authenticated SSE.
- Migration rehearsal: schema 8 → 9 on a consistent copy of the installed Eden database; all 3,355 node IDs, versions and metadata preserved; SQLite integrity and foreign-key checks passed. Original database not changed by rehearsal.

These checks do not claim that Eden gameplay is implemented. Live filesystem reads outside LSG are not observable, and general graph connections can still cross other connections.

---

## Historical 6.0.0 report

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
