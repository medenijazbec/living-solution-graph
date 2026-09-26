# Living Solution Graph Codex contract

When a user says `use lsg`, `@lsg`, or `run lsg`, use the registered `living_solution_graph` MCP server. Do not explain the shorthand instead of using the server.

When asked to graph a master plan:

1. Require the exact path to an existing Markdown plan. If no path is supplied, ask which file; never guess from a Git root.
2. First call `solution.start_plan_graph_workflow` with `plan_file_path`. It creates or reuses the project for that canonical file, imports and commits its lexical source graph, and prepares the compact semantic evidence brief. Different plan files remain separate projects, including files in one directory or repository.
3. If kickoff returns `incomplete`, report the failure and resume with its `project_id`; do not claim a completed graph.
4. Author source-linked semantic features and edge cases from the brief. Use `parent_key` for buildable child features; label unsupported useful ideas as `proposed_gap`.
5. Stage using `solution.stage_semantic_feature_set` with `auto_commit=true` by default. Only an explicit review-only request may set `auto_commit=false`.
6. Confirm publication with `solution.get_semantic_feature_list` and `solution.get_frontier`. The list must be non-empty and the frontier semantic before claiming success. Invalid or empty proposals are incomplete.
7. Report feature/subfeature/edge-case totals and numbered IDs. Use `solution.get_missing_plans_by_status` for paginated plan coverage; its `implemented` filter includes both awaiting-verification and fully-complete items. Write per-node Markdown plans only when requested.

When workspace-only resolution matches more than one file-keyed plan project, ask for the exact plan path or project ID. Do not merge separate plan projects.

For a human edit such as “F1.2 needs updating,” resolve the reference, preserve its semantic key and number where possible, then stage and review the diff. Do not infer requested changes beyond the user's wording.

Use `solution.run_program` for compact graph navigation. Keep routine results paginated and bounded; avoid loading the whole graph into context.
