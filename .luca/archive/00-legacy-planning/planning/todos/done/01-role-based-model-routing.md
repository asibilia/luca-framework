---
title: "Role-Based Model Routing"
area: framework/architecture
created: 2026-03-01
source: expert-panel-research
tier: 1
complexity: MODERATE
moat: Medium
---

## Context

Expert panel research identified that Pi uses role-based model routing (default/smol/slow/plan/commit) and Nader's blog emphasizes purpose-aware model selection. Luca's Phase 77 plans basic model routing — this proposal enriches that design.

## Task

Map agent `purpose` (researcher/executor/verifier) to model profiles (default/smol/slow/plan/commit). Quality zone degrades -> model upgrades automatically. Directly completes Phase 77's intent with a richer design.

**Implementation:**

- Add RoleProfileSchema, MODEL_ROLES constant to `src/complexity/__schemas/complexity.schemas.ts`
- Extend resolveModel() in `src/agents/__helpers/resolve-model.ts` with optional role parameter
- Map PurposeCategorySchema values to role profiles in `src/agents/__schemas/agent.schemas.ts`
- Add model_roles configuration section to `.planning/config.json` schema

## Notes

- Subsumes existing done todo: `replace-complexity-gating-with-model-routing.md`
- Aligns with Phase 77 of v2.3.0 roadmap
- Source agents: Architecture Expert + Intelligence Expert
