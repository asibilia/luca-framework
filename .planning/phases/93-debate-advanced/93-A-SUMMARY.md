# 93-A Summary: Root Cause Tribunal for Debug Fix Validation

## Status: COMPLETE

## What Was Built

A Root Cause Tribunal system that challenges whether a debugger-proposed fix addresses the true root cause or merely treats a symptom. The tribunal follows a defender-challenger-arbiter pattern with three agents running in parallel.

## Files Created

| File                                                  | Purpose                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/agents/__schemas/root-cause-tribunal.schemas.ts` | Zod schemas: ProposedFixSignal, RootCauseChallengeCategory, RootCausePerspective, RootCauseTribunalResult  |
| `src/agents/__helpers/root-cause-tribunal.ts`         | Pure functions: detectProposedFix, shouldRunRootCauseTribunal, 3 prompt builders, resolveRootCauseTribunal |
| `__tests__/src/agents/root-cause-tribunal.test.ts`    | 36 tests, 100% function and line coverage                                                                  |

## Files Modified

| File                                        | Change                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `src/agents/index.ts`                       | Added barrel exports for all new schemas, types, and helpers   |
| `src/skills/general/debug.skill.ts`         | Added Step 4.5 (Root Cause Tribunal) after Handle Agent Return |
| `src/skills/general/phase-execute.skill.ts` | Added tribunal note in Route C UAT diagnosis flow              |

## Key Design Decisions

1. **Follows Verification Tribunal patterns exactly**: Same consensus resolution algorithm (majority vote with highest-confidence tiebreaker for 3-way splits), same schema conventions (snake_case, Zod, z.infer types), same functional patterns (no classes).

2. **Four challenge categories map to two resolutions**:
   - `verified_fix` -> resolution `"verified_fix"` (proceed with commit)
   - `symptom_treatment`, `side_effects`, `incomplete_fix` -> resolution `"needs_deeper_investigation"`

3. **Triple gate**: Tribunal only runs when ALL conditions are met:
   - `root_cause_tribunal_enabled` in config (default: **true**)
   - Complexity is COMPLEX or CRITICAL
   - Debug session has issue_count >= 2 (multi-issue)

4. **Three parallel agents**: lu-debugger (defender), lu-verifier (challenger), lu-integration-checker (arbiter) -- each with tailored prompts for their expertise.

5. **Token budget**: ~24k estimated per tribunal session (3 agents x 8k each).

## Verification

- `bun test __tests__/src/agents/root-cause-tribunal.test.ts` -- 36/36 pass, 100% coverage
- `bunx --bun tsc --noEmit` -- no type errors
- All schemas use snake_case
- All files use kebab-case naming
- No classes, all functional patterns
- Barrel is pure re-exports only
- No cross-tier import violations (stays in T2 agents domain)

## Commits

1. `feat(agents): #42 define root cause tribunal schemas`
2. `feat(agents): #42 create root cause tribunal helpers`
3. `feat(agents): #42 integrate root cause tribunal into debug and phase-execute skills`
4. `feat(agents): #42 add comprehensive tests for root cause tribunal`
5. `feat(agents): #42 export root cause tribunal from agents barrel`
