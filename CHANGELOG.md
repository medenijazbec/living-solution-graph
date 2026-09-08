# Changelog

## Unreleased

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
