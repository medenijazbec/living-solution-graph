<p align="center">
  <a href="README.md">README</a> ·
  <a href="docs/INSTALL.md">Install</a> ·
  <a href="HOW_TO_USE_LSG.md">User guide</a> ·
  <a href="docs/TOOLS.md">MCP tools</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="CODE_OF_CONDUCT.md">Code of conduct</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="LICENSE">MIT license</a>
</p>

<p align="center">
  <img src=".github/assets/lsg.png" alt="Living Solution Graph" width="880">
</p>

<h1 align="center">Living Solution Graph</h1>

<p align="center"><strong>Persistent project memory and an implementation graph for coding agents.</strong></p>

<p align="center">
  <a href="https://github.com/medenijazbec/living-solution-graph/releases"><img alt="release" src="https://img.shields.io/github/v/release/medenijazbec/living-solution-graph?style=flat-square&color=2f81f7"></a>
  <a href="https://github.com/medenijazbec/living-solution-graph/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/medenijazbec/living-solution-graph/ci.yml?branch=master&style=flat-square&label=build"></a>
  <img alt="tests" src="https://img.shields.io/badge/tests-58%20passing-2ea043?style=flat-square">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%E2%89%A522.5-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-stdio%20%7C%20HTTP-7c3aed?style=flat-square">
  <img alt="runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-0ea5e9?style=flat-square">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2ea043?style=flat-square"></a>
</p>

LSG turns a Markdown master plan into a connected, numbered backlog that an AI coding agent can query and update. Features, subfeatures, edge cases, dependencies, implementation plans, test evidence, Git commits, and durable project decisions remain available after the model's context window ends.

It works with Codex and other Model Context Protocol clients. No model API key or runtime npm dependency is required.

## Why use it?

A long plan is useful to read, but difficult to execute reliably across many coding sessions. LSG adds a structured layer:

- Stable feature addresses such as `F1`, `F1.2`, and `F26.1`.
- Addressable edge cases such as `F1.E1`.
- Dependency-aware priority and completion calculations.
- Markdown implementation plans attached to individual nodes.
- Separate implementation and verification state backed by evidence.
- Project-scoped memory and Git history.
- Compact queries that avoid dumping the whole graph into model context.
- A draggable, zoomable web workspace with semantic and source views.

## Install in five minutes

Requirements: [Node.js 22.5 or newer](https://nodejs.org/) and Git.

```powershell
git clone https://github.com/medenijazbec/living-solution-graph.git
cd living-solution-graph
npm ci
node src/cli.mjs doctor
npm start
```

Open [http://127.0.0.1:7347](http://127.0.0.1:7347). On a new Windows installation, durable local data defaults to `%LOCALAPPDATA%\LivingSolutionGraph` unless `LSG_DB_PATH` is configured.

For macOS/Linux, Docker, remote HTTP, upgrades, and data paths, see the [installation guide](docs/INSTALL.md).

## Connect Codex

Start the HTTP server with `npm start`, then add this to `~/.codex/config.toml`:

```toml
[mcp_servers.living_solution_graph]
url = "http://127.0.0.1:7347/mcp"
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 120
```

Restart Codex. You can then say:

```text
Use LSG to map the features and edge cases in C:\Projects\MyGame\MASTER_PLAN.md
```

or:

```text
@lsg inspect F14.1, its edge cases, and its direct neighbors.
```

LSG also supports stdio clients. Copy and adapt [`mcp.json.example`](mcp.json.example).

## Typical workflow

```text
Markdown master plan
        ↓
lexical source graph
        ↓
semantic features + subfeatures + edge cases
        ↓
dependency-ready implementation frontier
        ↓
implementation plan → code → tests → evidence → verification
```

The agent resolves the project from the plan's directory, updates the source graph, authors a semantic feature set, and stores the result. Later prompts can address nodes by number without rereading the entire plan.

Use `solution.run_program` for compact routine navigation. Use `solution.get_tool_catalog` to search the tool surface without loading all schemas, and `solution.validate_project_integrity` to check graph consistency before a release or backup. The complete catalog contains **76 MCP tools** and is documented in [MCP tools](docs/TOOLS.md).

## Safe state changes

LSG treats these as different facts:

1. Code was implemented.
2. Current evidence verifies that implementation.

Changing a requirement or reopening implementation makes previous verification stale. Mutating operations use graph, node, and document versions to prevent silent overwrites. Destructive project, edge-case, plan, and restore operations require explicit confirmations.

## Data and privacy

- Project data is stored in SQLite with WAL and foreign-key enforcement.
- Personal memory and project memory are separate.
- Live activity is off after every server restart and stays in memory only.
- File access is limited to explicitly mapped paths inside the bound workspace.
- Secrets, dependencies, Git internals, generated output, and LSG data are excluded.
- Remote binds require bearer authentication unless insecure mode is explicitly enabled.

Read the [security policy](SECURITY.md) and [production guide](docs/PRODUCTION.md) before exposing LSG outside localhost.

## Development

```powershell
npm test
npx playwright install chromium
npm run test:browser
npm run test:orbital
npm run smoke
npm run verify
node src/cli.mjs doctor
```

The registry contract suite dispatches every MCP tool, checks unique names and strict schemas, and tests unknown arguments, bounds, malformed nested input, compact catalog pagination, and graph-integrity failures. Behavioral suites cover imports, semantic proposals, plans, work claims, memory, activity, Git history, snapshots, HTTP/stdio MCP, security, and the browser workspace.

## Documentation

| Guide | Purpose |
| --- | --- |
| [Install](docs/INSTALL.md) | Local, Codex, VS Code, stdio, HTTP, Docker, upgrade, and uninstall instructions |
| [How to use LSG](HOW_TO_USE_LSG.md) | Plain-language day-to-day workflows and prompts |
| [MCP tool catalog](docs/TOOLS.md) | All tools grouped by job |
| [Workspace 6.1](docs/WORKSPACE_6_1.md) | Progress, memory, work claims, live activity, and canvas behavior |
| [Architecture](docs/living_solution_graph_v6_architecture.md) | Runtime and storage design |
| [Production](docs/PRODUCTION.md) | Secure single-writer deployment |
| [Changelog](CHANGELOG.md) | Release history |

## Community

Bug reports and focused feature proposals are welcome. Please read [Contributing](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first. Report vulnerabilities privately according to [Security](SECURITY.md).

## License

Living Solution Graph is available under the [MIT License](LICENSE).
