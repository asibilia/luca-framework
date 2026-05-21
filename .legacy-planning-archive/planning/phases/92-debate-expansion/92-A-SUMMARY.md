# 92-A Summary: Milestone Audit Adversarial Debate Round

## Status: COMPLETE

## What Was Built

Added an optional adversarial debate round to the milestone-audit skill. After the existing 5 parallel code reviewers complete their independent reviews, findings are normalized through the tribunal infrastructure, disagreements are detected by file:line grouping, and a rebuttal round runs where conflicting reviewers challenge each other. The debate produces unified recommendations with confidence ratings, replacing raw merged findings in the audit report. Gated behind config flag (milestone_debate_enabled), COMPLEX+ complexity, and HIGH/CRITICAL severity disagreements.

## Files Created

| File                                               | Purpose                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/skills/__schemas/milestone-debate.schemas.ts` | Zod schemas: milestoneDebateConfigSchema (enabled, min_complexity, max_rebuttal_rounds, token_budget), milestoneDebateResultSchema (wraps tribunalResultSchema with milestone metadata)              |
| `src/skills/__helpers/milestone-debate.ts`         | Pure functions: shouldRunMilestoneDebate (4-gate evaluation), buildMilestoneRebuttalContext (milestone-augmented prompt pairs), buildMilestoneDebateResult (cross-phase counting, consensus summary) |
| `__tests__/src/skills/milestone-debate.test.ts`    | 31 tests covering schemas, gate logic, orchestration, integration pipeline, and edge cases                                                                                                           |

## Files Modified

| File                                          | Change                                                                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/skills/general/milestone-audit.skill.ts` | Added Step 4.5 (Adversarial Debate Round) with 5 sub-steps, Debate Analysis section in audit report (high-confidence/contested/withdrawn tables), debate stats in Route B display, updated success criteria |
| `src/skills/index.ts`                         | Added barrel exports for milestone debate schemas, types, and helpers                                                                                                                                       |

## Key Design Decisions

1. **Reuse tribunal infrastructure from ~/agents**: All core logic (normalizeFindings, detectDisagreements, shouldRunTribunal, buildRebuttalPrompts, resolveRebuttals, buildTribunalResult) is reused without duplication. Milestone-specific helpers only add domain context.

2. **4-gate evaluation**: shouldRunMilestoneDebate checks (1) config enabled, (2) complexity threshold, (3) disagreement existence, (4) severity gate (CRITICAL/HIGH required). All gates must pass.

3. **Cross-phase disagreement heuristic**: Counts disagreements where conflicting findings reference files in different top-level source directories (e.g., src/agents/ vs src/skills/).

4. **Consensus summary generation**: Automatically synthesizes a human-readable 1-3 sentence summary from rebuttal outcomes (upheld/withdrawn/modified counts, confidence distribution).

5. **Opt-in by default**: milestoneDebateConfigSchema defaults enabled=false. When disabled, milestone-audit behavior is identical to pre-debate version.

## Verification

- `bunx --bun tsc --noEmit` passes (zero type errors)
- `bun test __tests__/src/skills/milestone-debate.test.ts` passes (31/31 tests, 100% function/line coverage on new files)
- `bun test __tests__/src/skills/` passes (132/132 tests, no regressions)
- No cross-tier import violations (skills domain imports from agents domain, both T2)
- When debate is disabled, milestone-audit behavior is identical (Step 4.5 gate check exits early)

## Commits

1. `f5369e0` - feat(skills): #42 define milestone debate schemas
2. `91b5cd9` - feat(skills): #42 create milestone debate orchestration helper
3. `dfead3a` - feat(skills): #42 add adversarial debate round to milestone-audit skill
4. `7a13703` - feat(skills): #42 add tests for milestone debate infrastructure
5. `147d756` - feat(skills): #42 export milestone debate schemas and helpers from barrel
