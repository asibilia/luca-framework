---
title: "v2 Phase 2: Review Loop — convergence-based research review"
area: agents
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/phased-rollout.md
---

## Context

v2 adds a multi-reviewer quality gate (Step 5) that evaluates research output for completeness, accuracy, and actionability before graduation/planning. Uses gap-severity convergence model with cold-isolated reviewers.

## Task

Create 3 reviewer agents + 2 new skills:

### New Files (6)

- `src/agents/general/lu-completeness-reviewer.agent.ts` — coverage gap assessment
- `src/agents/general/lu-accuracy-reviewer.agent.ts` — source grounding verification (gets WebFetch for live verification)
- `src/agents/general/lu-actionability-reviewer.agent.ts` — planner usability evaluation
- `src/agents/__helpers/research-reviewer-shared-sections.ts` — cold isolation block, scoring protocol
- `src/skills/general/phase-research-review.skill.ts` — review loop orchestration
- `src/skills/general/phase-research-expand.skill.ts` — targeted deep expansion (Step 4)

### Modified Files (3)

- `src/agents/__helpers/build-agent-registry.ts` — register 3 reviewers
- `src/skills/__helpers/build-skill-registry.ts` — register both new skills
- `src/complexity/__helpers/model-routing.ts` — add DEEP_ANALYSIS preset for 3 reviewers

### Key Decisions

- Decision 3: Gap-severity convergence (CRITICAL/IMPORTANT/MINOR), loop while CRITICAL exists
- Decision 8: Reviewer-prefixed gap IDs (G-COMP-001, G-ACC-001, G-ACT-001)
- Decision 10: DEEP_ANALYSIS preset for reviewers
- Decision 13: 3 reviewers at ALL complexity levels
- Decision 14: Iteration budgets (TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=3, CRITICAL=3)
- Decision 16: Revision spawns targeted researcher agents, not full re-research

### Convergence Logic

- Loop continues while any CRITICAL findings exist
- Loop MAY continue for IMPORTANT findings (configurable: `continueForImportant`)
- Stops at 0 CRITICAL + 0 IMPORTANT, or max iterations reached
- Diminishing returns detection: if finding count increases, escalate

### Verification

- All 3 reviewers + 2 skills pass `bunx --bun tsc --noEmit`
- REVIEW-LOG.md format matches spec
- Convergence terminates (APPROVED, NEEDS_EXPANSION, or ESCALATE)

## Notes

- Depends on Phase 1 (reviews research files produced by Phase 1 researchers)
- Medium risk — convergence logic may need tuning
- Full specs in `docs/workflow-system/v2/05-review-loops/` and `docs/workflow-system/v2/04-agent-orchestration/review-team.md`
