# Production deployment

## Supported topology

v6 is production-oriented for a **single active LSG server process** using a local persistent SQLite database in WAL mode. The MCP 2026 transport itself is stateless, but the application graph is durable state; do not run several hosts against a shared SQLite file.

For HA/multiple writers, implement the same store contract against PostgreSQL or another shared transactional database before horizontal scaling.

## Recommended runtime

Node 26+ is recommended for production. Node 22.16.0 is the runtime used by the packaged internal tests.

## Remote deployment checklist

1. Bind behind TLS (`LSG_HOST=0.0.0.0` behind a reverse proxy is fine).
2. Set a strong `LSG_API_TOKEN`.
3. Restrict `LSG_ALLOWED_HOSTS` and `LSG_ALLOWED_ORIGINS`.
4. Mount a persistent directory for `LSG_DB_PATH`.
5. Restrict `LSG_WORKSPACE_ROOT` to only the repository/plan tree the MCP server may read.
6. Keep the workspace read-only if agents should not modify it through other tools.
7. Monitor `/healthz`, `/readyz`, and `/metrics`.
8. Back up the SQLite database and test restore procedures.
9. Put gateway/WAF rate limits in front of the in-process limiter for internet exposure.
10. Rotate the bearer token periodically.

## systemd example

```ini
[Unit]
Description=Living Solution Graph MCP
After=network.target

[Service]
Type=simple
User=lsg
WorkingDirectory=/opt/lsg
EnvironmentFile=/etc/lsg.env
ExecStart=/usr/bin/node /opt/lsg/src/cli.mjs http
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/lsg
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Set `LSG_DB_PATH=/var/lib/lsg/lsg.sqlite` in `/etc/lsg.env`.

## Backups

Coordinate backups with SQLite/WAL semantics. Use a database-aware backup/snapshot approach or stop the service briefly before copying all database state. Regularly restore a backup into a disposable environment and run `node src/cli.mjs doctor` plus the smoke test.
