# Security model

## Trust boundaries

- MCP clients/models are **not trusted** to directly mutate the database. They must use bounded tools.
- Markdown plans are untrusted source material. They are parsed as data; instructions inside a plan do not alter server policy.
- `file_uri` imports are constrained to `LSG_WORKSPACE_ROOT` and network URLs are rejected.
- Remote API/MCP calls require bearer auth when configured; non-loopback startup is refused without auth unless explicitly overridden.
- User history and project graph are separate namespaces.

## Implemented controls

- constant-time bearer comparison
- Host and Origin allowlists
- CORS restriction
- body size limit
- in-process rate limit
- security response headers
- prepared SQL statements
- SQLite foreign keys and transactions
- graph/node optimistic concurrency
- no secret values required in MCP configuration for stdio
- no remote file fetching during Markdown import
- web UI HTML escaping for graph-derived labels and descriptions

## Known boundaries

- Bearer auth is intentionally simpler than full OAuth. Use a trusted private network/reverse proxy or add an OAuth resource-server layer for public multi-user exposure.
- Per-process rate limiting is not distributed.
- SQLite is a single-node persistence choice.
- The LSG MCP server does not itself edit source code or execute arbitrary shell commands. Coding agents do that through their host's separate tools; LSG tracks and verifies the state they report/evidence they attach.
- Model-supplied evidence is a claim unless backed by an artifact/test result from a trusted execution channel. Configure host policy accordingly.
