# 92-C Summary: PR Address Split Verdict Debate

## Status: COMPLETE

## What Was Built

Added split verdict debate to the pr-address skill. When parallel validator agents produce a tie or narrow split on a PR comment, a lightweight rebuttal round runs where the dissenting side articulates their argument and the majority responds. Both perspectives are presented with agent attribution, enabling informed decisions on contested feedback.

## Files Created

| File                                                | Purpose                                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/skills/__schemas/pr-verdict-debate.schemas.ts` | Zod schemas: validatorVerdictSchema, verdictSplitSchema, verdictRebuttalSchema, splitVerdictResultSchema                                 |
| `src/skills/__helpers/pr-verdict-debate.ts`         | Pure functions: detectVerdictSplits, buildDissenterPrompt, buildMajorityResponsePrompt, buildSplitVerdictResult, formatSplitVerdictForPR |
| `__tests__/src/skills/pr-verdict-debate.test.ts`    | 41 tests covering all functions with edge cases                                                                                          |

## Files Modified

| File                                     | Change                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/skills/general/pr-address.skill.ts` | Added Step 4.5 (Split Verdict Debate), contested comments in Step 9 summary, updated error handling note |
| `src/skills/index.ts`                    | Added barrel exports for all new schemas, types, and helpers                                             |

## Key Design Decisions

1. **Rebuttal prompt pattern** (not full agent teams): Follows the lighter pattern from tribunal infrastructure. Token cost: +30-40k per split verdict occurrence.

2. **Split threshold 0.6**: Catches ties (3-3 = 0.5) and narrow margins (3-2 = 0.6), but not clear majorities (4-2 = 0.67).

3. **Sequential debate within each split**: Dissenter argues first, majority responds to the actual dissent (not generic defense).

4. **Three resolution outcomes**: majority_upheld (proceed normally), dissent_acknowledged (defer), escalate_to_human (defer). Both defer cases surface in PR summary.

5. **Confidence formula**: Tie base = 0.5, narrow split base = 0.65, dissent acknowledged = -0.1, escalate = 0.3 fixed.

## Verification

- `bunx --bun tsc --noEmit` passes (zero type errors)
- `bun test __tests__/src/skills/pr-verdict-debate.test.ts` passes (41/41 tests, 100% function coverage)
- `bun test __tests__/src/skills/` passes (132/132 tests, no regressions)
- No cross-tier import violations (stays in T2 skills domain)
- When no splits detected, pr-address behavior is identical (Step 4.5 gate check)

## Commits

1. `2b3d3f5` - feat(skills): #42 define PR verdict debate schemas
2. `fcbb840` - feat(skills): #42 split verdict detection and rebuttal helpers
3. `67b3271` - feat(skills): #42 integrate split verdict debate into pr-address
4. `6830a2c` - feat(skills): #42 tests for PR verdict debate infrastructure
5. `52a36b0` - feat(skills): #42 export PR verdict debate from skills barrel
