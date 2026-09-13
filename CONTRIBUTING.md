# Contributing to Living Solution Graph

Thank you for helping improve LSG. Focused bug fixes, tests, documentation improvements, and well-scoped feature proposals are welcome.

## Before opening a change

1. Search existing issues and pull requests.
2. Open an issue for large behavior, schema, protocol, or UI changes.
3. Do not include project databases, secrets, generated output, or proprietary plans.
4. Keep implementation state and verification claims evidence-based.

## Development setup

```bash
git clone https://github.com/medenijazbec/living-solution-graph.git
cd living-solution-graph
npm ci
npx playwright install chromium
node src/cli.mjs doctor
npm test
```

Node.js 22.5 or newer is required.

## Branch and release workflow

- Base feature branches on `staging`.
- Keep each change bounded and include regression tests.
- Pull requests target `staging`, not `master`.
- `master` contains promoted commits that passed the release suite.
- Release tags are created only when version metadata changes.

## Required checks

```bash
npm test
npm run test:browser
npm run test:orbital
npm run smoke
npm run verify
node src/cli.mjs doctor
```

Changes to MCP tools must include strict schemas, concise descriptions, protocol-level contract coverage, and behavioral tests. Changes to persisted state must include migration and upgrade coverage. UI interaction changes require a real-browser regression.

## Pull requests

Describe the user-visible outcome, risks, verification performed, and any database or configuration impact. Keep unrelated formatting or refactors out of the same pull request.

By contributing, you agree that your contribution is licensed under the repository's MIT License and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
