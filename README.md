# Living Solution Graph MCP v6.0.0

A runnable MCP server and persistent problem-solving runtime that turns ordinary Markdown plans into a connected, versioned solution graph, lets models add missing edge cases, tracks explicit implementation/verification switches, audits the entire graph, and compiles relevant project + user history context for model calls.

## What is implemented

- **Markdown → graph bootstrap** with source hashing, explicit plan extraction, domain detection, starter coverage packs, generic edge-case expansion, preview, and atomic commit.
- **Domain starter packs**: universal, game, website, web-app/SaaS, e-commerce, mobile, backend API, data pipeline, and AI/LLM.
- **Explicit state switches** on graph nodes: `implemented`, `implementation_state`, `verification_state`, timestamps, node version, graph version, direct commit SHA, and inherited parent commit.
- **Whole-graph audit**: implemented, not implemented, verified, unverified, stale, blocked, excluded/not-applicable, unresolved, and plan-claimed implementation.
- **Model-created edge cases** through `solution.add_edge_case`; every new edge case starts `implemented=false`, `verification_state=unverified`.
- **Codex-authored semantic layer**: stage a source-linked implementation-unit/edge-case proposal, inspect its diff, then explicitly commit it. Semantic units drive the completion frontier when available.
- **Persistent SQLite/WAL storage** with optimistic concurrency and event history.
- **User history** stored separately from projects, with correction/forget semantics and token-budgeted compressed context.
- **MCP over stdio and HTTP**, supporting modern MCP `2026-07-28` plus legacy 2025-era `initialize` clients.
- **OpenAI-compatible facade**: `/v1/models`, `/v1/responses`, `/v1/chat/completions`; when an upstream is configured, LSG context is injected automatically.
- **Connected graph web UI** with feature/edge-case squares, edges, implementation/verification badges, import preview/commit, state toggles, and node metadata.
- **Security controls**: loopback-safe default, bearer auth for remote binding, Host/Origin checks, body-size limits, rate limiting, path traversal prevention, CORS allow-listing, security headers.
- **Health and metrics**: `/healthz`, `/readyz`, `/metrics`.

## Requirements

- Node.js **22.5+**. This package was tested in the supplied environment on Node 22.16.0.
- For production deployment, Node 26+ is recommended because `node:sqlite` is further along in its stability lifecycle.
- No npm runtime dependencies are required.

## Fastest local setup

```bash
unzip living_solution_graph_v6_production.zip
cd living_solution_graph_v6_production
node src/cli.mjs doctor
npm test
node src/cli.mjs http
```

Open `http://127.0.0.1:7347/` for the graph UI.

## Import into VS Code via stdio

Copy the server entry from `mcp.json.example` into your VS Code MCP configuration and replace the absolute paths. A ready workspace example is also included at `.vscode/mcp.json`.

Minimal shape:

```json
{
  "servers": {
    "living-solution-graph": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/src/cli.mjs", "stdio"],
      "env": {
        "LSG_DB_PATH": "/absolute/path/to/data/lsg.sqlite",
        "LSG_WORKSPACE_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

`LSG_WORKSPACE_ROOT` is intentionally restrictive: Markdown plans referenced by `file_uri` cannot escape it.

## Remote HTTP MCP

```bash
export LSG_HOST=0.0.0.0
export LSG_PORT=7347
export LSG_API_TOKEN='replace-with-a-long-random-secret'
export LSG_ALLOWED_HOSTS='lsg.example.com'
export LSG_ALLOWED_ORIGINS='https://lsg.example.com'
node src/cli.mjs http
```

Then configure an MCP client to use `https://lsg.example.com/mcp` with `Authorization: Bearer ...`. See `docs/vscode-http.mcp.json`.

The server refuses a non-loopback bind without a bearer token unless `LSG_ALLOW_INSECURE=true` is explicitly set.

## First plan iteration

A normal plan such as:

```md
# My game
- 3D co-op game
- Unity
- player accounts
- multiplayer backend
- database for progression
- in-game purchases
```

is processed as:

1. Freeze/hash the source.
2. Parse explicit plan atoms.
3. Detect applicable archetypes.
4. Apply universal + domain starter packs.
5. Insert missing required/conditional/unresolved architecture coverage.
6. Seed applicable starter edge cases.
7. Expand generic edge cases from plan features.
8. Preserve `[x]`/“done” as **source claims**, not verified implementation.
9. Preview the graph.
10. Atomically commit against an expected graph version.
11. Audit the entire graph and expose its completion frontier.
12. Continue evolving: newly found edge cases are inserted as new nodes instead of being left in prose.

See `bootstrap/FIRST_ITERATION_PROTOCOL.md` and `bootstrap/PLAN_IMPORT_ACCEPTANCE_CASES.md`.

## Core model workflow

```text
solution.get_context
solution.audit_implementation_status
solution.get_frontier
        ↓
inspect one bounded feature / edge case
        ↓
solution.add_edge_case          (when a new case is discovered)
        ↓
implement + run tests
        ↓
solution.record_evidence
        ↓
solution.set_implementation_state(implemented=true)
        ↓
solution.set_verification_state(verified)
        ↓
repeat
```

## Semantic feature-list workflow

Ask Codex: **“Use LSG to provide the semantic feature list for this project.”** Codex calls `solution.prepare_semantic_feature_set`, authors an evidence-linked proposal, calls `solution.stage_semantic_feature_set`, and presents the proposed implementation units for review. The live graph changes only after `solution.commit_semantic_feature_set` is explicitly called.

Semantic features are concise implementation units rather than one node per Markdown bullet. Each includes a stable key, priority, source-node references, acceptance criteria, dependencies, and scoped edge cases. A later plan import marks semantic runs stale when its source hash changes, requiring a fresh review before replacement.

Implementation and verification are deliberately separate. Reverting `implemented` on a verified node automatically marks verification stale.

## Major MCP tools

`solution.bootstrap_from_markdown_plan`, `solution.preview_markdown_plan`, `solution.commit_plan_import`, `solution.prepare_semantic_feature_set`, `solution.stage_semantic_feature_set`, `solution.commit_semantic_feature_set`, `solution.get_semantic_feature_list`, `solution.get_semantic_edge_cases`, `solution.get_semantic_diff`, `solution.audit_implementation_status`, `solution.add_edge_case`, `solution.set_implementation_state`, `solution.set_verification_state`, `solution.record_evidence`, `solution.get_graph_view`, `solution.find_gaps`, `solution.get_frontier`, `solution.get_context`, starter-pack tools, and `memory.*` history tools.

The MCP server also exposes graph/audit/user-context resources and reusable prompts for bootstrap, continuation, implementation, audit, and domain coverage.

## OpenAI-compatible model facade

Configure an upstream:

```bash
export LSG_UPSTREAM_BASE_URL='https://your-openai-compatible-provider.example/v1'
export LSG_UPSTREAM_API_KEY='...'
```

Then use:

- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/chat/completions`

Send `x-lsg-project-id` and optionally `x-lsg-user-id`, or put `lsg_project_id` / `lsg_user_id` in `metadata`. The server injects a bounded project graph, completion frontier, and relevant compressed user history. If only a user id is supplied, the user-memory context is still injected.

Model aliases are configured with `LSG_MODEL_MAP_JSON`.

## Persistence and concurrency

SQLite is configured with WAL, foreign keys, busy timeout, and explicit transactions. Mutating graph tools use graph versions and, where applicable, node versions to prevent silent last-write-wins corruption.

For a single server process this is a durable production topology. For horizontally scaled/HA deployment, replace the storage adapter with a shared transactional datastore before running multiple writers; SQLite files are not intended to be a multi-host coordination layer.

## Testing

Run:

```bash
npm test
npm run smoke
npm run verify
```

The included suite covers Markdown bootstrap, domain seeding, source implementation claims, model-created edge cases, implementation/verification transitions, inherited commits, user memory, workspace path safety, modern MCP 2026 behavior, legacy MCP, HTTP auth/header validation, HTTP MCP E2E, stdio E2E, web UI serving, OpenAI facade behavior when unconfigured, and package syntax/integrity.

See `TEST_REPORT.md` for the exact run performed when this bundle was produced.

## Operational notes

- Keep the SQLite database and WAL files on persistent local storage.
- Back up the database using a filesystem/database-safe snapshot strategy.
- Put remote HTTP behind TLS/reverse proxy and use `LSG_API_TOKEN` at minimum; OAuth is not implemented in this bundle.
- Do not store credentials as user-memory atoms. Store only references to an external secret manager.
- The built-in rate limiter is per-process; use gateway-level limiting for distributed deployments.

See `docs/PRODUCTION.md` and `docs/SECURITY.md`.
