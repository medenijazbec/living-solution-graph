# Frequently asked questions

## How do I graph a master plan?

Tell your coding agent:

```text
Use LSG to map C:\Projects\MyWebsite\MASTER_PLAN.md into the project at C:\Projects\MyWebsite. Author the architectures, all features and edge cases, and their implementation plans.
```

Codex first registers the source, reads it completely through LSG, authors the graph and Markdown plans, stages resumable batches and publishes the complete validated result. LSG itself does not extract implementation features or invent edge cases. See [the authoring workflow](AUTHORING_7.md).

## What if I have four master plans?

Supply their paths and the intended project directory. All four sources contribute to one project when bound to the same canonical directory. Different directories produce separate projects, even inside one Git repository. Without an explicit workspace, a plan's containing directory is used. Repository location is stored separately for Git operations.

Old file-based projects are retained separately during migration. When several share a directory, choose a project ID explicitly; LSG will not silently merge their data.

## Why are there several circles?

Each circle is an architecture within the same project. For the full-stack template, the circles are TypeScript frontend, ASP.NET/C# backend and MySQL database. Each retains priority rings and normal/radial views; connections can cross circles. Filter by architecture or use Fit architecture for a closer view.

## Does the template generate a website?

It creates architecture groups and planning guidance. Codex authors features and plans from your requirements. Generating application code is a separate implementation task.

## Do I still need to say “Commit semantic set”?

No. Complete validated authoring publishes by default. Explicit “review only” leaves it staged. You can subsequently publish that run or revise it. Unread sources, missing plans, invalid citations, dependency cycles and stale runs cannot be finalized.

## Does every card have a Markdown plan?

New authored features and edge cases require one. Click a card to view and edit its saved fields and rendered Markdown plan. Names are assigned from references, such as `F26.1.E1-implementation-plan.md`. Writing a plan does not mean its code is implemented or tested.

For legacy or later incomplete entries, query `solution.get_missing_plans_by_status` with `not_implemented`, `partially_implemented` or `implemented`. The last includes both awaiting verification and complete work. Add `architecture_key` to filter and page through `next_cursor`.

## What do the colors mean?

Red: no progress. Bright blue: progress lacking current verification, including stale/failed/verifying work. Neon orange: verified partial progress. Neon green: fully verified completion. P0–P3 priority badges keep their own colors. These rules are unchanged from 6.3.1.

## Can I use v7 with an older database?

Back up first. V7 migrates a copy or the chosen database to schema v10 while preserving existing IDs, plans, memory and history. It restores both v1 and v2 project snapshots. Older LSG binaries must use the pre-migration backup. Use a separate database for staging tests; the example is in [AUTHORING_7.md](AUTHORING_7.md).

## How do I install it?

See [INSTALL.md](INSTALL.md). V7.0.0 is released on `master` and GitHub. Use a separate database when testing an upgrade. The package name is `living-solution-graph-mcp`, not `lsg`. A staging push does not publish to npm.
