# Security policy

## Supported version

Security fixes are applied to the latest release on `master`. Older releases may not receive patches.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's **Report a vulnerability** flow under the repository Security tab:

https://github.com/medenijazbec/living-solution-graph/security/advisories/new

Include affected versions, reproduction steps, expected impact, and any suggested mitigation. Avoid including real credentials, private plans, or production databases. You should receive an initial acknowledgement within seven days.

## Deployment boundaries

- LSG is designed around one active writer per SQLite database.
- Local HTTP binds to loopback by default.
- Remote binding requires a bearer token unless insecure mode is explicitly enabled.
- Put internet-facing deployments behind TLS and a reverse proxy.
- Restrict `LSG_WORKSPACE_ROOT` to the smallest required directory.
- Never store secrets in personal or project memory.
- Keep database backups protected; they contain graph content and attached Markdown plans.
- Live activity is temporary, opt-in, and must not be treated as an audit log.

Operational hardening details are in [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/PRODUCTION.md`](docs/PRODUCTION.md).
