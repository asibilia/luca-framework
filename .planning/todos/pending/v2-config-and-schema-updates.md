---
title: "v2 Config & Schema Updates — research section, vault routing, complexity matrix"
area: config
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/config-changes.md
---

## Context

v2 requires config schema extensions, vault routing updates, and complexity matrix additions. These can be implemented incrementally across phases but are tracked here as a single concern.

## Task

### Config Changes (.planning/config.json)

- Add `workflow.version` field ("v1" | "v2")
- Add `research` section with sub-keys: parallelResearchers, reviewLoop, planReviewLoop, graduation, perTaskRecall
- All keys use camelCase (Decision 9)

### Schema Updates

- `src/shared/__schemas/lu-config.schemas.ts` — extend with `research` section parser
- `src/shared/__schemas/research-config.schemas.ts` — new ResearchConfigSchema
- `src/complexity/__schemas/complexity.schemas.ts` — add researchReviewIterations, planReviewIterations

### Vault Routing Updates

- `.claude/rules/vault-routing.md` — add `research:*` prefix to write routing table (repo vault)
- `~/.claude/rules/vault-guard.md` — mirror `research:*` routing in global guard
- Add `research:*` to recall routing table (repo vault only, not dual-vault)

### Complexity Matrix

- Add per-level iteration budgets for research review and plan review
- Follows existing pattern in complexity-gating.md

## Notes

- Spans multiple phases — can be done incrementally
- Config schema should use Zod with safeParse (per schema-first-parsing rule)
- Full spec in `docs/workflow-system/v2/06-implementation-plan/config-changes.md`
