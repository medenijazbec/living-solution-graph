# Changelog

## Tool safety and repository documentation — 2026-09-13

- Added a compact, searchable, paginated MCP tool catalog.
- Added a read-only project-integrity audit for semantic identity collisions, orphan records, unsafe file mappings, dependency cycles, incomplete edge-case definitions, and stale semantic runs.
- Enforced unknown-argument rejection, numeric bounds, finite numbers, string constraints, array constraints, and recursive nested-object validation across MCP tool schemas.
- Added a registry contract suite that dispatches every exposed MCP tool.
- Rebuilt the public README, installation guide, complete tool reference, community standards, contribution workflow, security policy, issue forms, pull-request template, and branded repository header.

## Orbital motion refinement — 2026-09-13

- Turned Earth motion toward the viewer at a slow pitch rate, kept the horizon fixed, blurred the scene and removed stars from the sky. Graph dots remain.

## Workspace visual update — 2026-09-13

- Added a local 8K NASA Earth/cloud orbital background, layered atmospheric glow and procedural stars, with pause and reduced-motion controls.
- Kept graph dots, white connections and dragging; made panel surfaces translucent.
- Compacted buttons and secondary text, enlarged Projects, and fixed Create/import spacing and collapsed sidebar padding.
- Added GPU-limit downsampling, WebGL failure fallback, image MIME types and a real-browser orbital regression suite.

## 6.1.0 — 2026-09-12

- Added shared recursive completion counters, configurable importance, sequential work claims and evidence-based review.
- Added isolated project memory, revision history, mapped Git commit associations, and transactional schema v9 migration.
- Added opt-in ephemeral mapped-file activity with authenticated project-scoped SSE.
- Replaced graph placement with a zoomable, pannable canvas, free dragging, collision settlement, minimap and routed white connections.
- Preserved existing databases on upgrade; new Windows installations default to LocalAppData.

### Semantic foundation

- Added staged Codex-authored semantic feature sets with source traceability, dependencies, acceptance tests, and scoped edge cases.
- Added semantic MCP tools, prompt workflow, semantic-first completion frontier/context, HTTP endpoints, and graph UI layer switching.
- Mark semantic runs stale when their source plan changes and added a reproducible package manifest command.

## 6.0.0 — 2026-09-04

First fully runnable server release.

- Converted v5 architecture/specification into a working Node server.
- Added persistent SQLite/WAL graph, import, starter-evaluation, memory, and event stores.
- Added stdio MCP and stateless HTTP MCP.
- Added modern MCP 2026-07-28 request envelopes, `server/discover`, `resultType=complete`, server info metadata, standard HTTP header validation, cache hints, and unsupported-version handling.
- Added compatibility with legacy 2025-era `initialize` MCP clients.
- Added executable model tools for Markdown bootstrap, graph audit, state switches, verification, evidence, edge-case insertion, frontier/context, starter packs, and user memory.
- Added graph/node optimistic concurrency.
- Added optional direct and inherited commit SHA tracking and implementation/verification timestamps.
- Added domain-aware Markdown bootstrap from v5 starter packs.
- Added connected graph web UI and Markdown import workflow.
- Added OpenAI-compatible proxy/model aliases and LSG context injection.
- Added remote-bind safety, bearer auth, Host/Origin validation, CORS, rate limiting, input-size limits, and workspace path confinement.
- Added health/readiness/Prometheus-style metrics endpoints.
- Added package/bin exports, VS Code stdio/HTTP examples, Docker/systemd deployment examples.
- Added internal unit, protocol, HTTP E2E, stdio E2E, smoke, and package verification tests.
