# How to use Living Solution Graph 7

LSG is a local database and visual implementation workspace for Codex and other MCP clients. Your agent reads your requirements and authors the graph; LSG stores it, validates references, and tracks implementation separately from verification.

## Set up

Follow [the installation guide](docs/INSTALL.md). For v7 testing, clone `staging` and configure a separate database and port using [the isolated-instance example](docs/AUTHORING_7.md). Connect that instance as your `living_solution_graph` MCP server and restart the client.

## Give Codex your sources

```text
Use LSG to map C:\Projects\Website\MASTER.md into the project at C:\Projects\Website. Use the fullstack-typescript-aspnet-mysql planning template.
```

Include additional master-plan paths when you have several specifications. Sources bound to that same directory share a project. Codex reads them fully, groups the architectures, writes buildable features and edge cases, attaches Markdown implementation plans, and publishes the validated set automatically. Add “review only” to preview it before publication.

Registering a source in the UI saves its original Markdown; it creates no feature cards until Codex authors and publishes them. The source view renders the saved originals, and the authoring status shows reading/batch progress and missing plans.

## Explore the project

TypeScript, ASP.NET/C# and MySQL each have their own circle in the full-stack template. The template supplies structure only. Select an architecture, fit it to view, zoom, pan, or drag cards to arrange them. Cross-architecture dependencies stay connected.

F-numbers are unique across the project. Ask “show F1,” “update F14.1,” or “inspect F26.1.E1.” Selecting a card fills the editor with saved text and shows its rendered Markdown implementation plan. Example filename: `F26.1.E1-implementation-plan.md`.

## Continue implementation

Ask Codex to inspect one bounded task, its plans, dependencies, cases and project memory. It can claim sequential work, edit the code, run tests, record evidence and update state. A plan does not mark a node implemented or verified.

Card outlines are red for no progress, blue for progress without current verification, orange for verified partial progress, and green for fully verified work. Priority remains visible in the badge. Live activity is optional, temporary and disabled after restart.

## Queries

- `solution.list_architectures` and `solution.get_architecture_context`: architecture definitions, counts and remaining work.
- `solution.run_program`: compact `overview`, `architecture`, `architectures`, `feature`, `next_work`, `missing_plans` and `search` queries.
- `solution.get_missing_plans_by_status`: missing plans for not-implemented, partially implemented or implemented nodes; optionally filter by architecture.
- `solution.get_tool_catalog`: discover tools without loading every schema.

See [all MCP tools](docs/TOOLS.md), [the authoring contract](docs/AUTHORING_7.md), and [FAQ](docs/FAQ.md) for the exact workflow.
