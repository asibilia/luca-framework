---
title: "v2 Phase 6: Orchestrator Integration — wire v2 pipeline into /lu"
area: skills
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/phased-rollout.md
---

## Context

Final integration phase: enhance `lu.skill.ts` to conditionally run the v2 pipeline when `workflow.version: "v2"` is configured. Gate each v2 step by its config flag (fail-closed).

## Task

### New Files (1-2)

- `src/shared/__schemas/research-config.schemas.ts` — ResearchConfigSchema Zod definition
- `src/shared/__schemas/workflow-version.schemas.ts` — WorkflowVersionSchema Zod definition

### Modified Files (4)

- `src/skills/luca/lu.skill.ts` — add v2 pipeline branch after complexity classification
- `src/shared/__schemas/lu-config.schemas.ts` — extend config parser with `research` section, `workflow.version`
- `src/complexity/__schemas/complexity.schemas.ts` — extend with v2 fields (researchReviewIterations, planReviewIterations)
- `.planning/config.json` — add `workflow.version`, `research` section

### Config Schema (Decision 9 — camelCase)

```json
{
  "workflow": { "version": "v2" },
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": { "maxIterations": 3, "continueForImportant": true },
    "planReviewLoop": { "maxIterations": 2 },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterPhase": true
    },
    "perTaskRecall": { "enabled": true, "maxEngramsPerTask": 5 }
  }
}
```

### V2 Pipeline Flow in lu.skill.ts

1. Step 2: `phase-research` (multi-agent)
2. Step 5: `phase-research-review` (includes Step 4 deep expand within loop)
3. Step 6: `phase-graduate`
4. Step 3: `phase-discuss` (research-informed)
5. Step 7: `phase-plan` (with research refs)
6. Step 8: `phase-plan-review`
7. Step 9: `phase-execute` (with per-task recall)
8. Step 10: existing verify pipeline

### Verification

- lu.skill.ts passes `bunx --bun tsc --noEmit`
- v1 config: runs v1 pipeline unchanged
- v2 config with all features: runs full v2 pipeline
- v2 config with features disabled: skips those steps
- `--v2` flag overrides config for single invocation
- Failure in v2 step degrades gracefully to v1

## Notes

- Depends on ALL previous phases (1-5)
- HIGH risk — integration of all phases; most likely place for unexpected interactions
- Mitigation: wire one v2 step at a time, test after each; each step independently toggleable
