# Frequently asked questions

## What should I say to have Codex graph a master plan?

Give Codex the path to the Markdown file:

```text
Use LSG to graph the features and edge cases in C:\Projects\MyGame\MASTER_PLAN.md
```

Codex first calls `solution.start_plan_graph_workflow`. That creates or reuses the project for that exact file, imports and commits the source tree, and returns a compact evidence brief. Codex then writes and validates the semantic feature/edge-case proposal, publishes it by default, and checks the live semantic list and frontier before reporting completion.

If you do not include an existing Markdown path, Codex should ask you which file to graph. It should not create a generic project and start writing plans first.

## What if one workspace has several master plans?

Each canonical Markdown filepath has its own project, even if several plan files live in the same directory or Git repository. Repeating the same filepath reuses its project. A workspace-only lookup that could refer to more than one plan project is ambiguous, so Codex asks you to choose a plan path or project ID instead of merging the graphs.

This lets a workspace track several specifications independently, for example gameplay, networking, art, or production plans.

## Does Codex need me to say “Commit … semantic set” every time?

No. A normal `use lsg` graphing request publishes the validated semantic proposal automatically. An explicit request such as “review only” is the only reason to leave it staged. You can always edit, regenerate, or supersede the semantic set later; source imports and semantic runs keep their history.

If you explicitly requested review-only, Codex presents the staged diff. It should commit only after your approval, for example: `Commit MyGame semantic set`.

## How can I see which features still need Markdown plans?

Ask Codex to list missing plans by progress status, or use the compact `missing_plans` program. The paginated `solution.get_missing_plans_by_status` filter accepts:

- `not_implemented`
- `partially_implemented`
- `implemented` — includes items awaiting verification and fully complete

Only features and edge cases without an attached Markdown plan appear in these results. Continue with the returned cursor until it is empty.

## Can Codex write all the per-feature plans automatically?

It can, but a graphing request checks and reports missing plans rather than authoring them unless you ask for plan authoring. Plans attach to their feature or edge-case cards as Markdown and use stable names such as `F26.1.E1-implementation-plan.md`.

## How do I install the npm package?

The npm package uses the available name `living-solution-graph-mcp` (the short `lsg` name is not used). After publication, install and run it with:

```powershell
npm install --global living-solution-graph-mcp
lsg-mcp doctor
lsg-mcp http
```

The web workspace defaults to `http://127.0.0.1:7347`. See [Install](INSTALL.md) for Codex configuration, data-directory, upgrade, and local-source instructions.

## Will upgrading damage an existing graph?

This release adds MCP tools and UI behavior without changing the SQLite schema. Existing projects, node IDs, semantic numbers, plans, and history remain intact. Clients that do not use the new tools continue using the existing tool names and response fields; newer clients can use the additive kickoff and status-filtered plan query.
