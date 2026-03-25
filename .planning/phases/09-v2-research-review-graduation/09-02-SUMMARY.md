# Phase 9 Plan 2 Summary: v2 Review Loop -- Convergence-Based Research Review

**Status:** COMPLETE
**Wave:** 2
**Tasks:** 9/9
**Duration:** ~12 minutes

## Objective

Create the convergence-based research review system: 3 cold-isolated reviewer agents with shared prompt constants, 2 new orchestration skills, model routing entries, and registry updates.

## Tasks Completed

| #   | Task                                             | Commit     | Files                                                             |
| --- | ------------------------------------------------ | ---------- | ----------------------------------------------------------------- |
| 1   | Create research reviewer shared prompt constants | `badf3e15` | `src/agents/__helpers/research-reviewer-shared-sections.ts` (new) |
| 2   | Create lu-completeness-reviewer agent            | `216339df` | `src/agents/general/lu-completeness-reviewer.agent.ts` (new)      |
| 3   | Create lu-accuracy-reviewer agent                | `7d48ac74` | `src/agents/general/lu-accuracy-reviewer.agent.ts` (new)          |
| 4   | Create lu-actionability-reviewer agent           | `e63edc4b` | `src/agents/general/lu-actionability-reviewer.agent.ts` (new)     |
| 5   | Update model routing table                       | `9d3dae0c` | `src/complexity/__helpers/model-routing.ts` (edited)              |
| 6   | Update agent registry                            | `fa24cde6` | `src/agents/__helpers/build-agent-registry.ts` (edited)           |
| 7   | Create phase-research-review skill               | `6e76f323` | `src/skills/general/phase-research-review.skill.ts` (new)         |
| 8   | Create phase-research-expand skill               | `7c412b36` | `src/skills/general/phase-research-expand.skill.ts` (new)         |
| 9   | Update skill registry                            | `0d8e1971` | `src/skills/__helpers/build-skill-registry.ts` (edited)           |

## Artifacts Created

| Artifact                 | Path                                                        |
| ------------------------ | ----------------------------------------------------------- |
| Reviewer shared sections | `src/agents/__helpers/research-reviewer-shared-sections.ts` |
| Completeness reviewer    | `src/agents/general/lu-completeness-reviewer.agent.ts`      |
| Accuracy reviewer        | `src/agents/general/lu-accuracy-reviewer.agent.ts`          |
| Actionability reviewer   | `src/agents/general/lu-actionability-reviewer.agent.ts`     |
| Review skill             | `src/skills/general/phase-research-review.skill.ts`         |
| Expand skill             | `src/skills/general/phase-research-expand.skill.ts`         |

## Verification

- [x] `bunx --bun tsc --noEmit` passes with zero errors (checked after every task)
- [x] 6 new files created
- [x] Agent registry has 3 new entries (lu-completeness-reviewer, lu-accuracy-reviewer, lu-actionability-reviewer)
- [x] Skill registry has 2 new entries (phase-research-review, phase-research-expand)
- [x] Model routing has 3 new DEEP_ANALYSIS entries
- [x] All 3 reviewer agents use G-{PREFIX}-NNN gap ID format (G-COMP-, G-ACC-, G-ACT-)
- [x] phase-research-review uses gap-severity convergence model (not scored dimensions)
- [x] No test files created (per no-tests.md)

## Key Design Decisions

1. **Output-contract-first (Pre-mortem Risk 2):** Shared prompt constants define the parseable gap format (G-{PREFIX}-NNN with severity levels) BEFORE the convergence loop logic. The `RESEARCH_REVIEWER_OUTPUT_CONTRACT` constant enforces structured output across all 3 reviewers.

2. **Cold isolation:** All 3 reviewers receive only research files and phase intent -- no researcher session context or MuninnDB engrams. This ensures fresh-perspective review.

3. **WebFetch for accuracy reviewer:** lu-accuracy-reviewer has `["Read", "Grep", "WebFetch"]` tools (unique among the three) to enable live source verification of cited URLs.

4. **DEEP_ANALYSIS model routing:** All 3 reviewers use the DEEP_ANALYSIS preset (capable from MODERATE+), matching Decision 10 requirements for review quality.

5. **Gap-severity convergence model (Decision 3):** The review loop tracks B(n) (CRITICAL count), I(n) (IMPORTANT count), and F(n) (total count) per iteration. Convergence requires B(n)=0; IMPORTANT gaps trigger optional additional iterations.

## Deviations

None. All tasks implemented as specified in the plan.

## Post-Wave Note

`bun run build:all` must be run outside Claude Code session after all 3 waves complete to generate the `.claude/` output files from these new source definitions.
