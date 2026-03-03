# 92-B Summary: Verification Tribunal for T1/T3 Conflicts

## Status: COMPLETE

## What Was Built

Added a Verification Tribunal that diagnoses conflicts between T1 (harness/test) and T3 (goal-backward analysis) signals during phase verification. When lu-verifier detects that tests pass but goal-backward analysis finds partial or failed objectives, three diagnostic agents (lu-test-writer, lu-verifier, lu-integration-checker) are spawned in parallel to independently assess the root cause. The tribunal resolves via majority vote (with highest-confidence tiebreaker for three-way splits) into one of three actionable categories: tests_incomplete, goal_over_specified, or wiring_issue. Each category maps to specific remediation guidance. Gated behind config flag (verification_tribunal_enabled, default: true) and COMPLEX+ complexity.

## Files Created

| File                                                    | Purpose                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/__schemas/verification-tribunal.schemas.ts` | Zod schemas: T1/T3 status enums, conflict signal, conflict categories, diagnostic perspective, verification tribunal result                                                                                                                       |
| `src/agents/__helpers/verification-tribunal.ts`         | Pure functions: detectT1T3Conflict (6 signal combinations), shouldRunVerificationTribunal (COMPLEX+ gate), 3 diagnostic prompt builders (test-writer, verifier, integration-checker), resolveVerificationTribunal (majority vote with tiebreaker) |
| `__tests__/src/agents/verification-tribunal.test.ts`    | 24 tests covering conflict detection, gating, prompt generation, and resolution logic                                                                                                                                                             |

## Files Modified

| File                                        | Change                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/skills/general/phase-execute.skill.ts` | Added Step 7.25 (Verification Tribunal) between verification routing and Loop B. Conditional on config flag, COMPLEX+ complexity, and T1/T3 conflict detection. Spawns 3 diagnostic agents in parallel, displays tribunal results, routes by consensus category. |
| `src/agents/index.ts`                       | Added barrel exports for all verification tribunal schemas (12 value exports), types (7 type exports), and helpers (6 function exports)                                                                                                                          |

## Key Design Decisions

1. **Reuse tribunal patterns from 92-A**: Follows the same snake_case schema conventions, Zod safeParse patterns, and functional helper architecture established by the Design Tribunal (tribunal.schemas.ts, tribunal-detector.ts, tribunal-rebuttals.ts).

2. **Three distinct diagnostic perspectives**: Each agent evaluates the conflict from their domain expertise -- test coverage (lu-test-writer), goal specification accuracy (lu-verifier), and cross-component wiring (lu-integration-checker). This ensures the diagnosis captures different failure modes.

3. **Majority vote with confidence tiebreaker**: 2-of-3 agreement determines consensus. Three-way splits (rare) fall through to highest-confidence perspective. This avoids deadlock while preserving dissenting views.

4. **Conflict type detection aligned with lu-verifier signal matrix**: The three conflict types (t1_pass_t3_partial, t1_pass_t3_fail, t1_partial_t3_partial) map directly to the Signal Priority Matrix in lu-verifier Step 9. T1 fail and T1 absent are excluded since they have deterministic routing (gaps_found and T3-as-primary, respectively).

5. **Enabled by default**: verification_tribunal_enabled defaults to true in config. When disabled, phase-execute behavior is identical to pre-tribunal version.

## Verification

- `bunx --bun tsc --noEmit` passes (zero type errors)
- `bun test __tests__/src/agents/verification-tribunal.test.ts` passes (24/24 tests, 100% function/line coverage on new files)
- No cross-tier import violations (schemas and helpers stay in T2 agents domain)
- When tribunal is disabled, phase-execute behavior is identical (Step 7.25 gate check exits early)
- Token budget: ~10,500 tokens per tribunal invocation (3 diagnostic prompts), within the 10-15k target

## Commits

1. `a3dddf2` - feat(agents): #42 define verification tribunal schemas for T1/T3 conflicts
2. `da7ebc3` - feat(agents): #42 create verification tribunal helper functions
3. `143ef16` - feat(agents): #42 integrate verification tribunal into phase-execute
4. `f2bb37e` - feat(agents): #42 add verification tribunal tests
5. `e2677ed` - feat(agents): #42 export verification tribunal from agents barrel
