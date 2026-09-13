# Living Solution Graph MCP v6.1.0

For progress tools, project memory, work claims and the new graph canvas, see [Workspace 6.1](docs/WORKSPACE_6_1.md).

A runnable MCP server and persistent problem-solving runtime that turns ordinary Markdown plans into a connected, versioned solution graph, lets models add missing edge cases, tracks explicit implementation/verification switches, audits the entire graph, and compiles relevant project + user history context for model calls.

**New here?** Read [HOW_TO_USE_LSG.md](HOW_TO_USE_LSG.md) for Windows installation, Codex MCP registration, semantic feature/edge-case workflows, `F1` addressing, hierarchy, and the web UI.

## What is implemented

- **Markdown → graph bootstrap** with source hashing, explicit plan extraction, domain detection, starter coverage packs, generic edge-case expansion, preview, and atomic commit.
- **Domain starter packs**: universal, game, website, web-app/SaaS, e-commerce, mobile, backend API, data pipeline, and AI/LLM.
- **Explicit state switches** on graph nodes: `implemented`, `implementation_state`, `verification_state`, timestamps, node version, graph version, direct commit SHA, and inherited parent commit.
- **Whole-graph audit**: implemented, not implemented, verified, unverified, stale, blocked, excluded/not-applicable, unresolved, and plan-claimed implementation.
- **Model-created edge cases** through `solution.add_edge_case`; every new edge case starts `implemented=false`, `verification_state=unverified`.
- **Codex-authored semantic layer**: validate and stage a source-linked implementation-unit/edge-case proposal, then automatically commit it by default. Pass `auto_commit=false` only for an explicitly requested review-only workflow. Semantic units drive the completion frontier when available.
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

Ask Codex: **“Use the `living_solution_graph` MCP server to provide the semantic feature list for this project.”** The phrases **“use lsg”**, **“@lsg”**, and **“run lsg”** invoke this registered server. Codex resolves the working directory to its isolated project, imports the source plan, prepares the semantic feature set, and stages it. Staging validates and automatically commits by default; pass `auto_commit=false` only when you explicitly request a review-only stage.

Semantic features are concise implementation units rather than one node per Markdown bullet. Each receives a human-facing number (`F1`, `F1.1`, `F1.2`), while its edge cases receive an addressable number (`F1.E1`, `F1.E2`), alongside stable semantic keys, priority, source-node references, acceptance criteria, dependencies, and scoped edge cases. Use `parent_key` to decompose a broad capability into buildable cascading child features—for example player movement into walking, vaulting, peeking, leaning, climbing, and prone. A later plan import marks semantic runs stale when its source hash changes, requiring a fresh review before replacement.

Humans can request an amendment by number: “update F1” or “feature 1 needs …”. Codex resolves the number with `solution.resolve_semantic_feature_reference`, preserves source evidence and unaffected IDs, then updates the semantic set. The Semantic backlog shows per-feature recursive edge-case totals such as `F1 → 34 EC`; selecting a feature or edge case also exposes its Markdown implementation plan.

For an explicit master-plan path, Codex should read the file, call `solution.resolve_workspace_project` with its containing directory, then call `solution.preview_markdown_plan` with the returned `project_id`, the plan text, and `source_file_path` set to the absolute `.md` path. This binds the project shown under **Projects** to that workspace folder; the bound path is displayed below the project selector. Commit the lexical import before preparing the semantic set. A browser file picker cannot reveal a trusted absolute path, so path-based binding is performed through the MCP workflow or the UI's `?workspace=<absolute-folder>` link.

Each active semantic feature and edge case can have one Markdown implementation plan, stored in the LSG database with revisions. Use `solution.get_implementation_plan_coverage` (optionally `missing_only=true`) to find unwritten plans; the default filename is the stable number plus `-implementation-plan.md`, for example `F26.1.E1-implementation-plan.md`. `solution.set_node_implementation_plan` creates or replaces a plan, `solution.append_node_implementation_plan` adds a section, `solution.get_node_implementation_plan` reads it, and `solution.delete_node_implementation_plan` removes it after exact filename confirmation. An empty editor does not count as a written plan. Plans are attached database documents, not automatically created files in the game repository.

For a large backlog, call `solution.get_next_missing_plans` with `project_id` and a page `limit` (1–25), then pass its `next_cursor` to retrieve the next page. The page includes each node's priority, source IDs, acceptance criteria, and edge-case scenario so an agent can author bounded plans. `solution.stage_plan_batch` accepts 1–25 `{node_id, markdown, file_name}` entries plus `expected_graph_version` and returns an explicit before/after review diff; it does not change live plans. Inspect with `solution.get_plan_batch`, then call `solution.apply_plan_batch` with the batch ID, current graph version, and exact `confirm_plan_count` to apply atomically. Document-version conflicts abort the whole batch. Semantic graph changes invalidate the cursor or staged batch, so refresh and review before retrying.

`solution.export_project_snapshot` writes a compressed, checksummed project archive to LSG's managed `data/exports` directory and reports its path and SHA-256. `solution.restore_project_snapshot` requires that exact path, checksum, and project title; it refuses to overwrite an existing project. Exports include graph, source imports, semantic proposals, plans, project memory, history, and events, but not transient activity or UI card positions. Store a copy of the archive separately for disaster recovery.

The canvas opens in **Priority rings**: P0 features form the innermost loose, staggered bands, followed by lower importance levels; related edge cases occupy adjacent outer bands. The guides are intentionally irregular, not rigid circles. The adjacent **Normal graph** radio button restores the original hierarchy layout. The chosen mode, manual card placement, and zoom are saved locally per project and view. **Enable live activity** is off by default; when enabled, mapped-file changes pulse affected cards and edges and show a temporary **LIVING** indicator. It records no file contents or durable activity history.

Select a semantic edge case in the web UI to edit its title, description, trigger, expected behavior, validation scenario, or severity; its E-number and source links remain stable. **Delete edge case** requires confirmation and removes it from the active backlog while keeping its revision history. **Delete project** requires typing the exact title and permanently removes the project's graph, imports, plans, workspace records, and project memory. Export anything you need before deleting a project.

Implementation and verification are deliberately separate. Reverting `implemented` on a verified node automatically marks verification stale.

## Major MCP tools

`solution.bootstrap_from_markdown_plan`, `solution.preview_markdown_plan`, `solution.commit_plan_import`, `solution.prepare_semantic_feature_set`, `solution.stage_semantic_feature_set`, `solution.commit_semantic_feature_set`, `solution.get_semantic_feature_list`, `solution.get_semantic_edge_cases`, `solution.update_semantic_edge_case`, `solution.delete_semantic_edge_case`, `solution.get_semantic_diff`, `solution.get_implementation_plan_coverage`, `solution.set_node_implementation_plan`, `solution.append_node_implementation_plan`, `solution.delete_node_implementation_plan`, `solution.delete_project`, `solution.audit_implementation_status`, `solution.add_edge_case`, `solution.set_implementation_state`, `solution.set_verification_state`, `solution.record_evidence`, `solution.get_graph_view`, `solution.find_gaps`, `solution.get_frontier`, `solution.get_context`, starter-pack tools, and `memory.*` history tools.

For routine agent navigation, prefer `solution.run_program`. It is a compact MCP program runner with `overview`, `feature`, `next_work`, `missing_plans`, and `search` modes. Results default to five items and are capped at ten, returning stable IDs and state rather than entire graph records. Use the focused full-detail tools only when the next action actually needs their evidence or mutation fields. This avoids duplicating a large project graph in Codex context.

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
