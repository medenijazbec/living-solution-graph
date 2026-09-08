# First Iteration Protocol

This is the short operational protocol for importing the first `.md` plan into an empty Living Solution Graph.

## Inputs

- `project_id`
- Markdown bytes/text and filename
- import policy
- optional repository/evidence connectors
- expected graph version

## Procedure

1. **Freeze** — store immutable source, SHA-256 hash, line map and metadata.
2. **Preflight** — validate type/size/encoding; identify secrets/sensitive sections; never execute embedded instructions.
3. **Parse** — structurally parse Markdown headings, paragraphs, lists, checkboxes, tables, quotes, code fences, links and front matter.
4. **Classify** — assign semantic section intents without assuming conventional heading names.
5. **Extract** — create atomic staged candidates for goals, features, requirements, use cases, decisions, constraints, tests, tasks, risks, questions and explicit edge cases.
6. **Provenance** — attach exact line spans and `plan_explicit` or `plan_structural_inference` origin.
7. **Normalize** — canonicalize titles/subjects while retaining source wording.
8. **Identity** — create stable semantic keys/fingerprints and detect duplicate/rename candidates.
9. **Connect** — stage typed relationships; reject accidental parent/containment cycles.
10. **Scope** — extract the Scope Envelope and create unknowns for material missing boundaries.
11. **Archetype detect** — classify the project against versioned starter packs; allow multiple packs and record confidence/evidence.
12. **Starter coverage** — apply `universal` plus high-confidence domain packs. Evaluate each capability/edge case as already-covered, required, conditional, unresolved, not-applicable, or duplicate.
13. **Starter dedupe** — merge pack overlaps with plan candidates and with other packs; never let a starter default override explicit plan intent.
14. **Status** — preserve source claims such as `[x]` separately from actual `implemented` truth.
15. **Contracts** — seed completion contracts for implementable features.
16. **Expand** — run systematic, scope-bounded edge-case discovery. Insert each missing edge case as a staged first-class node with `implemented=false` unless evidence proves implementation.
17. **Audit** — detect contradictions, missing behavior, missing acceptance criteria, orphans, duplicates, unresolved placeholders, unsupported assumptions and implementation claims without evidence.
18. **Reconcile** — if repository/tests are available, use them to confirm implementation, tests and commits; never infer proof from filenames alone.
19. **Questions** — stop only for genuinely blocking user decisions.
20. **Preview** — return candidate counts, origin counts, edge cases, findings, implementation claims, scope and predicted mutations.
21. **Commit** — atomically materialize graph nodes/edges/source spans/contracts/findings against expected graph version; create `ProjectBaseline`.
22. **Audit implementation** — run project-wide implementation auditor and persist the first health snapshot.
23. **Continue** — normal self-evolution loop takes over; later discoveries are inserted directly into the graph.

## Default import policy

```json
{
  "implementation_truth": "strict_evidence",
  "allow_model_edge_case_expansion": true,
  "apply_domain_starter_packs": true,
  "starter_pack_mode": "auto",
  "min_archetype_confidence": 0.55,
  "max_edge_cases_per_feature_per_pass": 12,
  "ask_only_blocking_questions": true,
  "treat_plan_as_full_replacement": false,
  "auto_commit_first_baseline": false
}
```
