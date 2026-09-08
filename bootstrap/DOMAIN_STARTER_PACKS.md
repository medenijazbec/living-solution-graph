# Domain Starter Coverage Packs

Version: **5.0.0**  
Updated: **2026-09-04T17:28:11+02:00**

The Markdown bootstrapper must not wait until implementation begins to discover obvious architectural categories. After extracting the user's plan, it classifies the project into one or more archetypes and evaluates a versioned starter pack for each archetype.

These packs are **coverage seeds, not universal requirements**. For example, a static website may not need a backend or database; a single-player offline game may not need an online backend. Each item is evaluated as `required`, `conditional`, `unresolved`, `already_covered`, or `not_applicable` before it affects project completion.

## Bootstrap order

```text
parse plan
  -> detect one or more project archetypes
  -> apply universal baseline
  -> evaluate domain starter capabilities
  -> evaluate domain starter edge cases
  -> deduplicate against explicit plan nodes
  -> materialize only applicable/unresolved candidates
  -> generic feature-by-feature edge-case expansion
  -> audit + preview
```

## Included starter packs

- `universal` — scope, config, diagnostics, error behavior, release/testing, security/privacy where applicable.
- `game` — engine/runtime, platforms, gameplay lifecycle, input, assets, saves, builds, plus conditional online backend/networking/database/accounts/matchmaking/anti-cheat/monetization.
- `website` — frontend, routing, responsive/accessibility, conditional backend/database/auth/files/email/payments/search/admin, deployment and web observability.
- `web_app_saas` — tenant isolation, membership, subscriptions, quotas, jobs, audit/support workflows.
- `ecommerce` — catalog/cart/checkout/payment/inventory/fulfillment/tax/refunds and transactional failure modes.
- `mobile_app` — platform lifecycle, permissions, local persistence, background sync, notifications and app-store/update behavior.
- `backend_api` — API contracts, auth, persistence, idempotency, versioning, queues and health/observability.
- `data_pipeline` — connectors, schema evolution, storage, orchestration, data quality, lineage/backfills.
- `ai_llm_app` — model routing, prompt/context policy, tool permissions, evaluations, traces, fallbacks and agent-specific failure modes.

The machine-readable catalog is `bootstrap/domain_starter_packs.json`.

## Archetype detection rules

1. Detect from explicit plan terms, named frameworks/engines, goals, user flows, data flows, repository evidence and declared deployment targets.
2. Multiple packs may apply simultaneously. An e-commerce mobile app can apply `mobile_app + ecommerce + backend_api`; an online game may apply `game + backend_api`; an AI SaaS can apply `website + web_app_saas + ai_llm_app + backend_api`.
3. Record every assignment with confidence and evidence. Low-confidence classifications remain suggestions.
4. User/project evidence always outranks starter-pack defaults.
5. Starter packs never silently rewrite an explicit architecture decision. Conflicts become findings/questions.
6. Packs are versioned. Re-running a newer pack creates a diff; it does not pretend newly added starter items existed in the old baseline.

## Starter item dispositions

- `already_covered` — semantically represented by an explicit/inferred existing candidate or graph node.
- `required` — applicable and materially necessary; create/link graph candidate.
- `conditional` — condition is known and currently false or deferred; do not count as missing implementation.
- `unresolved` — applicability depends on a material unknown; create a question/unknown if needed.
- `not_applicable` — evaluated exclusion; retain the evaluation so future agents do not repeatedly re-propose it.
- `duplicate` — another pack produced the same semantic item; share/link identity.

## Game example

A plan that only says:

> Make a co-op survival game with Unreal Engine.

should not produce only `Survival gameplay`. The starter pass should immediately evaluate, among other things:

```text
Engine/runtime: Unreal                    already_covered
Target platforms                          unresolved
Game loop/state lifecycle                 required
Input/action mapping                      required
Asset/content pipeline                    required
Save/load/persistence                     required/conditional
Online backend                            required (co-op implies online unless LAN/local clarified)
Networking/replication                    required
Player identity/accounts                  unresolved/conditional
Server-side database                      unresolved/conditional
Lobby/session/matchmaking                 required/conditional
Telemetry/crash diagnostics               recommended
Monetization/IAP                          unresolved or not_applicable
```

The same pass seeds edge cases such as disconnect/reconnect during a match, client/server version mismatch, crash during save, corrupt saves, controller disconnect, backend outage, duplicated rewards, and purchase acknowledgement failures only when their triggering capabilities apply.

## Website example

A plan that says:

> Build a subscription website where users upload files and pay monthly.

should immediately evaluate:

```text
Frontend                                  required
Backend/API                               required
Database                                  required
Authentication/session lifecycle          required
Authorization                             likely required
File/object storage                       required
Payment/billing/webhooks                  required
Transactional email                       likely required
Deployment/TLS/domain                     required
Accessibility/responsive behavior         required
Privacy/security                          required
```

and seed payment-webhook retry/order consistency, interrupted uploads, expired sessions, database outage, duplicate form submission, unsafe uploaded content, stale authorization cache, and deployment-version mismatch.

## Why this happens before generic edge-case discovery

Generic expansion can only reason about features that already exist. Starter packs make sure the first graph contains the obvious **system surfaces** that a short plan often omits. The later edge-case engine then expands those surfaces in detail.
