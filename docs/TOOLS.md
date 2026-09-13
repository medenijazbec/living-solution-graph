# MCP tool catalog

LSG exposes 76 tools. Prefer `solution.run_program` and `solution.get_tool_catalog` for compact model context; call detailed tools only for the current task.

## Tool discovery and integrity

- `solution.get_tool_catalog` — Search and paginate tool names, descriptions, categories, and required arguments.
- `solution.validate_project_integrity` — Audit semantic identities, evidence links, parents, edges, cycles, plans, mappings, and semantic runs.

## Compact graph navigation

- `solution.run_program` — Run `overview`, `feature`, `next_work`, `missing_plans`, or `search` with bounded output.
- `solution.get_context` — Load bounded graph, frontier, and memory context.
- `solution.search` — Search nodes by lexical relevance.
- `solution.select_node_neighborhood` — Return a feature or edge case and every direct neighbor.
- `solution.select_node_cascade` — Return additional neighbor generations; depth 1 includes neighbors-of-neighbors.
- `solution.get_graph_view` — Return connected graph data for rendering.
- `solution.get_frontier` — Return dependency-ready work.
- `solution.find_gaps` — Return incomplete, stale, and awaiting-verification gaps.

## Counts and progress

- `solution.get_counts` — Count roots, subfeatures, edge cases, combined items, completion categories, and flags.
- `solution.get_feature_progress` — Calculate direct or recursive progress for one feature.
- `solution.list_remaining_work` — List unfinished work by dependency readiness and importance.
- `solution.audit_implementation_status` — Inventory implementation and verification states across the graph.

## Semantic features and edge cases

- `solution.prepare_semantic_feature_set` — Prepare bounded source evidence for semantic authoring.
- `solution.stage_semantic_feature_set` — Validate and store a semantic proposal; auto-commit unless review-only is requested.
- `solution.commit_semantic_feature_set` — Commit an explicitly staged proposal.
- `solution.get_semantic_diff` — Inspect proposal changes.
- `solution.get_semantic_feature_list` — Read numbered features, dependencies, criteria, progress, and edge cases.
- `solution.get_semantic_edge_cases` — Read edge cases globally or for one feature.
- `solution.resolve_semantic_feature_reference` — Resolve `F1`, `F1.2`, `1`, or a semantic key.
- `solution.reindex_semantic_features` — Assign missing stable display numbers.
- `solution.update_semantic_feature` — Edit a feature without changing its stable identity.
- `solution.add_edge_case` — Add a newly discovered edge case.
- `solution.update_semantic_edge_case` — Edit an edge case while retaining its E-number.
- `solution.delete_semantic_edge_case` — Remove an edge case after exact confirmation and retain its history.

## Markdown implementation plans

- `solution.set_node_implementation_plan` — Attach or replace Markdown on a feature or edge case.
- `solution.get_node_implementation_plan` — Read an attached plan.
- `solution.append_node_implementation_plan` — Append a section with revision history.
- `solution.delete_node_implementation_plan` — Delete a plan after filename confirmation.
- `solution.get_implementation_plan_coverage` — Count and list nodes with or without plans.
- `solution.get_next_missing_plans` — Page through nodes that need plans.
- `solution.stage_plan_batch` — Stage 1–25 plans for review.
- `solution.get_plan_batch` — Read a staged/applied plan batch and diff.
- `solution.apply_plan_batch` — Apply a reviewed batch atomically.

## Importance

- `solution.get_importance_scale` — Read the configured scale.
- `solution.set_importance_scale` — Change level order, names, and descriptions with replacement mapping.
- `solution.set_feature_importance` — Set a developer override and rationale.

## Sequential work and evidence

- `solution.claim_next_work` — Claim one dependency-ready task.
- `solution.get_work_context` — Load its plans, files, dependencies, criteria, and memory.
- `solution.update_work` — Renew, release, or submit work.
- `solution.review_work` — Review submitted work with current evidence.
- `solution.set_implementation_state` — Record implemented or reopened state.
- `solution.set_verification_state` — Record unverified, verifying, verified, failed, or stale state.
- `solution.record_evidence` — Attach automated, manual, commit, or artifact evidence.

## Projects, imports, and backups

- `solution.create_project` — Create a project.
- `solution.delete_project` — Permanently delete a project after exact-title confirmation.
- `solution.resolve_workspace_project` — Resolve or bind a working directory to an isolated project.
- `solution.bootstrap_from_markdown_plan` — Analyze, seed, expand, and optionally commit a baseline.
- `solution.preview_markdown_plan` — Stage a source import without changing nodes.
- `solution.commit_plan_import` — Materialize a preview against the expected graph version.
- `solution.get_plan_import` — Read import metadata.
- `solution.get_bootstrap_report` — Read import analysis, starter evaluation, and audit.
- `solution.reconcile_plan_import` — Compare source implementation claims with graph truth.
- `solution.detect_project_archetypes` — Detect applicable project domains.
- `solution.list_starter_packs` — List domain starter packs.
- `solution.apply_starter_pack` — Apply one starter pack.
- `solution.get_starter_pack_evaluation` — Read coverage provenance.
- `solution.export_project_snapshot` — Create a compressed checksummed project snapshot.
- `solution.restore_project_snapshot` — Restore a verified snapshot without overwriting a project.

## Live activity, files, and history

- `solution.get_activity_status` — Read temporary activity status.
- `solution.set_activity_enabled` — Enable or disable activity for the session.
- `solution.set_node_file_links` — Map project-relative files/directories to a node.
- `solution.read_node_file` — Read a mapped file and pulse its graph node.
- `solution.get_node_history` — Read definition, plan, event, and Git history.
- `solution.sync_git_history` — Associate mapped Git commits without claiming implementation proof.

## Project memory

- `memory.remember_project` — Store a project decision, discovery, question, or note.
- `memory.search_project` — Search project memory.
- `memory.get_project_context` — Retrieve bounded relevant project memory.
- `memory.correct_project` — Supersede a project-memory record.
- `memory.forget_project` — Forget a project-memory record.

## Personal memory

- `memory.remember` — Store versioned personal/user memory.
- `memory.search` — Search active personal memory.
- `memory.get_context` — Retrieve token-bounded personal memory.
- `memory.correct` — Supersede an incorrect personal-memory record.
- `memory.forget` — Exclude a record from future context.

## Inspect schemas dynamically

MCP clients receive complete JSON schemas through `tools/list`. For a smaller answer inside an agent session:

```text
Call solution.get_tool_catalog with query="plan", limit=10.
```

Use optimistic-concurrency fields returned by the server. Do not reuse stale graph, node, document, work, scale, or batch versions after a mutation.
