# Installing Living Solution Graph

This guide installs LSG, starts its web workspace, and connects an MCP client. Existing databases are not overwritten by an upgrade.

## Requirements

- Node.js 22.5 or newer (`node --version`)
- Git
- Windows 10/11, macOS, or Linux

Node 26 or newer is recommended for a long-running production service because `node:sqlite` is further along in its stability lifecycle.

## Windows

Open PowerShell:

```powershell
git clone https://github.com/medenijazbec/living-solution-graph.git
Set-Location living-solution-graph
npm ci
node src/cli.mjs doctor
npm test
npm start
```

The UI is available at `http://127.0.0.1:7347`. Keep that terminal open while using the HTTP server.

By default, a new Windows installation stores data under `%LOCALAPPDATA%\LivingSolutionGraph`. Set `LSG_DB_PATH` when you want an explicit database location:

```powershell
$env:LSG_DB_PATH = 'D:\LSG-Data\lsg.sqlite'
npm start
```

## macOS or Linux

```bash
git clone https://github.com/medenijazbec/living-solution-graph.git
cd living-solution-graph
npm ci
node src/cli.mjs doctor
npm test
npm start
```

```bash
export LSG_DB_PATH="$HOME/.local/share/living-solution-graph/lsg.sqlite"
npm start
```

## Codex over local HTTP

Run `npm start`, then add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.living_solution_graph]
url = "http://127.0.0.1:7347/mcp"
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 120
```

Restart Codex and ask it to `use lsg`.

## Any MCP client over stdio

Use absolute paths in the client's MCP configuration:

```json
{
  "servers": {
    "living_solution_graph": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Tools/living-solution-graph/src/cli.mjs", "stdio"],
      "env": {
        "LSG_DB_PATH": "C:/Users/you/AppData/Local/LivingSolutionGraph/lsg.sqlite",
        "LSG_WORKSPACE_ROOT": "C:/Projects"
      }
    }
  }
}
```

`LSG_WORKSPACE_ROOT` is a security boundary. LSG will not read plans or mapped files outside it.

## VS Code

Copy [`mcp.json.example`](../mcp.json.example) into your VS Code MCP configuration, replace every placeholder with an absolute path, and restart the MCP client. For remote HTTP, adapt [`vscode-http.mcp.json`](vscode-http.mcp.json).

## Docker

```bash
docker compose up --build
```

Mount a persistent host directory for the configured database path before relying on the container for durable project data.

## Remote HTTP

Do not expose the development defaults directly to the internet. Put LSG behind TLS and configure authentication:

```bash
export LSG_HOST=0.0.0.0
export LSG_PORT=7347
export LSG_API_TOKEN='replace-with-a-long-random-secret'
export LSG_ALLOWED_HOSTS='lsg.example.com'
export LSG_ALLOWED_ORIGINS='https://lsg.example.com'
npm start
```

The MCP endpoint is `https://lsg.example.com/mcp`. Health endpoints are `/healthz` and `/readyz`; metrics are exposed at `/metrics`.

## Upgrade

1. Stop the running LSG process.
2. Back up `lsg.sqlite` together with any `-wal` and `-shm` files, or use a SQLite-safe snapshot.
3. Run `git pull --ff-only` in the installation directory.
4. Run `npm ci`, `node src/cli.mjs doctor`, and `npm test`.
5. Restart the server.

LSG migrates supported older schemas in place. Never downgrade a database after a newer server has migrated it.

## Verify the installation

```powershell
node src/cli.mjs doctor
npm run smoke
npm run verify
```

Then visit `http://127.0.0.1:7347/healthz`. A healthy server returns JSON containing `"ok": true`.

## Uninstall

Stop the server and remove the cloned application directory. Delete the configured data directory only if you also intend to permanently delete every graph, plan, memory record, and history entry. Export or back up projects first.
