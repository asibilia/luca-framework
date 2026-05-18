---
severity: must-fix
applies-to: review, plan-review
description: >
  When adding fields to per-action Zod schemas in `workflow-state.ts`, the flat
  `workflowStateInputSchema` mirror MUST be updated with the SAME constraints
  (regex, min, max, nullable) — otherwise the flat-schema validation layer is
  silently bypassed and per-action guards leak.
---

# Rule: Dual-Layer Zod Schema Drift

## Pattern
- `workflow-state.ts` has per-action schemas (e.g. `recordSubagentAction`,
  `recordRecallAction`, `saveReviewResultsAction`) AND a flat `workflowStateInputSchema`
  that mirrors all action fields. Both layers validate.

## Anti-pattern (DON'T)
- Adding a `.regex()` or `.max()` to the per-action schema but forgetting the flat mirror.
- Adding a new field to the discriminated-union action schema without registering it
  in the flat schema's `inputSchema.shape`.

## Do
- Pair every per-action constraint with an identical constraint in the flat schema.
- Run `bun test src/__tests__/dual-layer-schema-drift.test.ts` after schema changes.

## Symptom history
- PRs #234, #239, #245, #248, #249, #253: review iteration loops caused by flat-schema
  field drift discovered post-merge.
