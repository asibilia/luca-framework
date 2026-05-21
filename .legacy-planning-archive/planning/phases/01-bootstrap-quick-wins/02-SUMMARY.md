# SUMMARY: Plan 02 - Agent Team Prompt Audit Fixes

**Phase:** 1
**Plan:** 02
**Wave:** 2
**Status:** Complete

## Objective

Implement 8 prioritized agent team prompt improvements across 5 skill source files, aligning all team spawn points with best practices: own specific files, define output, name recipients, limit team size to 3-5.

## Results

### Fixes Applied

| Fix                                   | Priority | File                    | Status              | Notes                                                                                                                                       |
| ------------------------------------- | -------- | ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix 1: XML blocks in phase-research   | HIGH     | phase-research.skill.ts | Already implemented | All 4 researcher Task() prompts already have `<research_context>`, `<analysis_targets>`, `<output_requirements>`                            |
| Fix 2: Recipient declarations         | HIGH     | lu.skill.ts             | **Applied**         | Added `**Recipient:**` to 6 inline Task() prompts (lu-cognition x2, lu-router x2, lu-verifier, lu-learner). Other 4 files already had them. |
| Fix 3: Tribunal output format         | HIGH     | phase-execute.skill.ts  | Already implemented | CATEGORY/CONFIDENCE/EVIDENCE/ACTION structured output already present in `<output_format>` blocks                                           |
| Fix 4: Remove `ui` reviewer           | MEDIUM   | phase-execute.skill.ts  | Already implemented | No `ui` reviewer exists in code review section. Current team: dx-advocate, code-simplifier, code-architect, security-auditor (4 reviewers). |
| Fix 5: phase-discuss auto researchers | MEDIUM   | phase-discuss.skill.ts  | Already implemented | XML-block Task() prompts and parallel spawning already in place (Step 7a)                                                                   |
| Fix 6: Wave executor team cap         | MEDIUM   | phase-execute.skill.ts  | Already implemented | Sub-wave splitting (max 5) exists at Step 4.0.1                                                                                             |
| Fix 7: Named agent types in lu swarm  | MEDIUM   | lu.skill.ts             | Already implemented | All swarm agents use named types (lu-roadmap-architect, lu-roadmap-prioritizer, lu-roadmap-qa, lu-roadmap-synthesizer)                      |
| Fix 8: Gap-fix return format          | LOW      | phase-execute.skill.ts  | Already implemented | `<output_format>` block with status/summary/artifacts/remaining_gaps and SUMMARY.md update instruction present                              |

### Commits

| Commit   | Description                                                                      |
| -------- | -------------------------------------------------------------------------------- |
| 87b50ac4 | fix(skills): add recipient declarations to lu orchestrator inline Task() prompts |

## Deviations

- **[Assessment deviation]** 7 of 8 fixes were already implemented in the codebase. Only Fix 2 (recipient declarations in lu.skill.ts) required actual changes. This is likely because prior phases already addressed these improvements incrementally. The audit plan was authored against an earlier snapshot of the code.

## Verification

- `bunx --bun tsc --noEmit` passes cleanly after changes
- All 6 modified Task() prompts verified to include `**Recipient:**` line

## Post-Plan Requirement

User must run `bun run build:all` outside Claude Code session to regenerate .claude/ output from updated src/ source.
