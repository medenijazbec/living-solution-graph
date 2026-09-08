# How to use Living Solution Graph

Living Solution Graph (LSG) is a local MCP server that converts a Markdown plan into a persistent, traceable implementation graph. It keeps the original plan as a source layer and, when requested, creates a separate semantic backlog: bounded implementation features, dependencies, acceptance criteria, and edge cases.

## What LSG stores

- **Source layer:** headings, requirements, decisions, risks, and plan claims imported from a Markdown file.
- **Semantic layer:** Codex-authored implementation features and edge cases derived from source evidence.
- **Evidence and state:** implementation/verification state, commit references, audit events, and explicit stale-state handling after a plan changes.

The source layer is not replaced by the semantic layer. Every semantic feature keeps references back to plan nodes.

## Requirements

- Node.js 22.5 or later (`node --version`)
- A local checkout of this repository
- An MCP-capable client such as Codex or VS Code

## Install on Windows

```powershell
git clone https://github.com/medenijazbec/living-solution-graph.git C:\Tools\living-solution-graph
cd C:\Tools\living-solution-graph
npm test
npm run smoke
npm run verify
$env:LSG_WORKSPACE_ROOT = 'C:\path\to\your\project'
node src\cli.mjs http
```

Open the local UI at `http://127.0.0.1:7347/`.

Keep `LSG_WORKSPACE_ROOT` restricted to the project area you want LSG to read. It prevents MCP file imports from traversing outside that directory.

## Register the HTTP MCP server in Codex

Start the server as above, then configure the Codex MCP entry:

```toml
[mcp_servers.living_solution_graph]
url = "http://127.0.0.1:7347/mcp"
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 120
```

Restart or reconnect your Codex session after changing MCP configuration. For VS Code stdio configuration, use `mcp.json.example` and set absolute Windows paths.

## Normal workflow

1. Give Codex a concrete Markdown-plan path.
2. Codex imports or updates the lexical source graph.
3. Codex prepares a semantic run, reasons over the source evidence, and stages a proposal.
4. Review the staged feature list, hierarchy, edge cases, unsupported claims, and graph diff.
5. Explicitly commit it. Only committed semantic data appears in the live Semantic backlog UI.

Use a prompt like:

```text
use lsg to graph out features and edge cases of the master plan at C:\Projects\MyGame\MASTER_PLAN.md
```

`use lsg`, `@lsg`, and `run lsg` are Codex invocation conventions for the registered `living_solution_graph` server. They mean that Codex should use LSG rather than merely discuss it.

To persist a staged proposal:

```text
Commit MyGame semantic set
```

Replace `MyGame` with the project being reviewed. LSG intentionally stages before it changes the live semantic graph, so a bad interpretation of the plan cannot silently replace the implementation backlog.

## Semantic features, child features, and edge cases

Semantic features are numbered for human review:

```text
F1    Player movement
F1.1  Walking and sprinting
F1.2  Vaulting
F1.3  Climbing
F1.E1 Movement input is lost during reconnect
```

- `F1` is a top-level semantic feature.
- `F1.1` is a child feature. LSG stores its `parent_key` and a `contains` edge, so feature sets can cascade into buildable parts.
- `F1.E1` is an edge case attached to `F1`.
- The stable semantic key remains the machine-facing identity; the F-number is the human-facing review address.

When authoring a semantic proposal, Codex should split broad capabilities into child features. For example, player movement may have separately testable children for walking, vaulting, peeking, leaning, climbing, and prone. A child must be supported by plan evidence or be explicitly marked `proposed_gap`; it must never be stated as a plan fact without evidence.

## Updating something by number

You can refer to a feature naturally:

```text
F1 needs updating: add accessibility remapping and make vaulting a separate child feature.
```

```text
feature 3 needs its acceptance criteria tightened for co-op reconnects.
```

Codex resolves `F1`, `F1.2`, or `feature 1` through `solution.resolve_semantic_feature_reference`, preserves unaffected semantic keys/numbers where possible, and stages an amended proposal for review. Ask it to commit after you approve the diff.

## Web UI

The local UI has two graph tabs:

- **Semantic backlog:** committed semantic features, child-feature hierarchy, acceptance tests, and semantic edge cases. Feature/edge-case badges show `F…` addresses. Click a node to inspect evidence, non-goals, priority, trigger, severity, and validation scenario.
- **Source trace:** the imported plan graph, retained for provenance and plan-update comparison.

The toolbar shows the count of committed semantic features and edge cases. If the Semantic backlog is empty, a proposal is either not yet created or is still staged; explicitly commit it to make it live.

## During implementation

Use the semantic frontier rather than working from raw Markdown bullets:

```text
@lsg implement the next ready feature for MyGame, run its tests, record evidence, and update implementation state.
```

When implementation exposes a new failure mode, add it to the semantic feature before claiming the feature complete. Implementation and verification are separate: a feature can be implemented but still unverified.

## Plan updates

When the master plan changes, ask Codex to import the changed file again. LSG preserves source hashes and marks affected semantic runs stale. Codex should prepare and stage a fresh semantic proposal, retaining unchanged IDs/evidence where possible, before you commit the replacement.

## Useful MCP tools

| Purpose | Tool |
| --- | --- |
| Import/update plan | `solution.preview_markdown_plan`, `solution.commit_plan_import` |
| Create review brief | `solution.prepare_semantic_feature_set` |
| Validate and stage semantic proposal | `solution.stage_semantic_feature_set` |
| Make reviewed set live | `solution.commit_semantic_feature_set` |
| Read backlog/edge cases | `solution.get_semantic_feature_list`, `solution.get_semantic_edge_cases` |
| Resolve `F1`/`1` | `solution.resolve_semantic_feature_reference` |
| Number legacy semantic data | `solution.reindex_semantic_features` |
| Next implementation work | `solution.get_frontier` |
| Record implementation truth | `solution.record_evidence`, `solution.set_implementation_state`, `solution.set_verification_state` |

## Before every release

```powershell
npm test
npm run smoke
npm run verify
node src\cli.mjs doctor
```

Commit feature work on `staging` when that branch is used for integration, test it, then promote the tested commit to `master`.
