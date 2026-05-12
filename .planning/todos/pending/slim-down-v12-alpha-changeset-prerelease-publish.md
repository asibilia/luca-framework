---
title: "Slim-down: v12 alpha changeset + prerelease publish"
area: release
created: 2026-05-12
priority: low
source: workflow-slim-down
---

## Task

Slim-down: v12 alpha changeset + prerelease publish

---
confidence: high
externalResearch: false
priority: 5
---

# Context

Capstone of Wave 2. Hard cut, shipped as alpha prerelease so consumers opt-in
via `@alpha`. `latest` stays on the 7-mode pipeline until alpha bakes.

## Scope

- Changesets prerelease mode already in `alpha` (verified during Wave 1 work).
- Major bump (v11.x → v12.0.0-alpha.0) for the breaking cut.
- Changeset entry: `"@alecsibilia/luca-mastracode": major` with full migration notes (4 modes, deleted triage/research/architect/discuss, frontmatter, plan-mode interrogation).
- README + docs updated to reflect new pipeline.
- Migration guide at `docs/migration/v11-to-v12.md`.
- Telemetry data from Wave 1 referenced in PR body to justify the cut.

## Acceptance

- `bun changeset status` shows v12.0.0-alpha.0 target.
- README pipeline diagram updated.
- Migration guide complete.
- All prior Wave 2 todos shipped.

## Depends on

- ALL prior Wave 2 todos.
- Wave 1 telemetry data accumulated (target: 2+ weeks of runs).

