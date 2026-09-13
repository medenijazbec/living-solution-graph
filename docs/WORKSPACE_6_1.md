# Implementation workspace — LSG 6.1

LSG stores a project's feature definitions, edge cases, Markdown implementation plans, evidence and history. The connected coding agent authors and implements work; LSG does not launch workers or make extra LLM calls.

## Query and address work

Use `project_id` and a `reference` such as `F14`, `F14.1` or a node ID. Feature numbers remain stable across updates. `solution.get_counts`, `solution.get_feature_progress` and `solution.list_remaining_work` accept optional references and `recursive: false` for direct scope. Default scope is recursive.

Counts deduplicate IDs and exclude acceptance tests and the synthetic root from feature-plus-edge-case totals. Completion still requires current verification of required tests, descendants and edge cases. Not started, partially implemented, awaiting verification and fully complete are exclusive categories; blocked, stale and failed are separate flags. Excluded items are listed separately. A feature's own implemented flag is not proof its subtree is finished.

Ask the agent: “Use LSG to show F14's progress and remaining edge cases.” Summaries include direct and recursive EC counts. Use the semantic feature list for numbered feature summaries and the source view for plan evidence.

## Importance and sequential work

`solution.get_importance_scale` returns ordered P0–P3 defaults. `solution.set_importance_scale` accepts ordered `levels`, `expected_version`, and replacement mappings when removing used levels. `solution.set_feature_importance` accepts a reference, priority, rationale and expected node version; developer overrides survive regeneration. New semantic features require importance and a rationale. Legacy missing rationales are flagged for review.

The coding workflow is `solution.claim_next_work` → `solution.get_work_context` → implementation/testing using the agent's ordinary tools → `solution.update_work` (submit) → `solution.review_work`. Claims have an owner and expiry; renew or release through update_work. One active project claim is the default. Explicit delegation records assignments but launches no processes. Submission does not verify a feature; review needs current automated-test or manual-verification evidence. Changed requirements require fresh review.

## Plans, memory and Git

Attach Markdown with `solution.set_node_implementation_plan`. Click a card to read its rendered plan and history. `memory.remember_project`, `search_project`, `get_project_context`, `correct_project` and `forget_project` maintain project-specific durable knowledge, separate from personal memory. Only explicit memory/task operations save durable notes.

Declare workspace-relative files/directories using `solution.set_node_file_links`. `solution.sync_git_history` associates local commits with mapped nodes, storing SHA, timestamp, file statistics, tags and available GitHub links—not full patches. File associations are not implementation proof. `solution.get_node_history` retrieves definition, plan and work revisions. Task approval attempts a local Git sync; unavailable Git is reported without inventing history.

## Graph and live activity

The workspace has a softly blurred Earth-from-orbit background behind translucent dark panels, with an 8K compressed NASA Earth/cloud texture and layered atmospheric glow. The sky has no stars or Moon. Surface detail moves very slowly from the horizon toward the viewer; the horizon stays fixed. The image is bundled locally (about 6.4 MiB); opening the UI makes no external imagery requests. `Pause Earth` stops the decoration independently of graph activity, remembers your preference and respects reduced-motion settings. Hidden tabs stop the animation loop. Unsupported WebGL or failed textures retain a usable dark workspace. Low-limit GPUs downsample the texture before upload. See `public/assets/earth/ATTRIBUTION.md` for source and compression details.

Buttons and secondary text are more compact, Projects is more prominent, and the creation/import controls have consistent spacing. The graph still has its dot grid and white cards/connections. Run `npm run test:orbital` alongside the dense-graph browser suite for visual-control and rendering checks.

Drag cards freely; the outlined preview shows their collision-free drop position. Drag the background to pan. Wheel/pinch zoom around the pointer; buttons, Fit and the minimap also navigate. Viewport and positions are local to each project/view. Tidy layout resets placement, not dependencies or importance. White routed edges may cross other edges in general graphs; selecting a card emphasizes its connections.

Live activity is off by default and resets off after restart. Enable it for the selected project only when wanted. It watches only explicitly mapped paths, excluding secrets, ignored files, generated output, dependencies, Git internals and database files. Symlinks escaping the workspace are rejected. Events contain node IDs, kind, timestamp and known actor, never file contents. They are debounced, bounded in memory and discarded on disable.

External edits appear as workspace changes. External reads cannot be observed. Agents can use `solution.read_node_file` for a normal mapped-file read that also pulses its card. LSG plan reads and work transitions pulse automatically while enabled. Activity never changes verification or durable memory. Remote access requires configured authentication; SSE uses the same authentication as the API.

## Install and upgrade

Install Node.js 22.5 or newer, clone the repository, and run `npm start`. Use `npm run stdio` for stdio MCP or the HTTP `/mcp` endpoint for HTTP clients. No runtime npm dependencies or upstream LLM API key are required. See the main setup guide for client configuration.

New Windows installations use `%LOCALAPPDATA%\LivingSolutionGraph\lsg.sqlite`. An explicit `LSG_DB_PATH` takes precedence; an existing `./data/lsg.sqlite` is retained for legacy upgrades. Set `LSG_WORKSPACE_ROOT` to the project directory. Never replace the runtime data directory when updating code. Back up the database before upgrading; `node scripts/check-migration.mjs <existing-db>` tests migration on a consistent temporary copy without modifying the original.

Release checks: `npm test`, `npm run smoke`, `npm run verify`, and `node src/cli.mjs doctor` with a test database. Real browser checks: install Playwright and Chromium in your development environment, then `npm run test:browser`. Alternatively set `LSG_PLAYWRIGHT_MODULE` to an installed Playwright module. The browser suite uses an isolated Eden-inspired dense fixture, not your production graph.
