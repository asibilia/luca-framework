---
phase: 10
plan: 3
type: feature
autonomous: true
wave: 2
depends_on: [1, 2]
---

# Phase 10 Plan 3: Skill Enhancements, Plan Review Skill, and Decisions Documentation

## Objective

Thread graduation report context into phase-plan, add research context injection to phase-execute, create the new phase-plan-review skill with convergence loop, register it in the skill registry, and document open question resolutions in CANONICAL-DECISIONS.md. This plan depends on Plans 1 and 2 because the skills reference the schemas (Plan 1) and agent sections (Plan 2) created there.

## Context

@src/skills/general/phase-plan.skill.ts
@src/skills/general/phase-execute.skill.ts
@src/skills/general/phase-research-review.skill.ts (template for plan review)
@src/skills/\_\_helpers/build-skill-registry.ts
@.planning/phases/10-v2-plan-executor-config/CONTEXT.md (Decisions 1-7)
@.planning/phases/10-v2-plan-executor-config/10-RESEARCH.md (Components 3-6)
@.planning/phases/10-v2-plan-executor-config/PREMORTEM.md

## Tasks

### 1. Thread GRADUATION-REPORT.md into phase-plan planner context

**Type:** auto
**Depends on:** none
**Research refs:** research:approach-graduation-report-threading

Edit `src/skills/general/phase-plan.skill.ts`.

In Step 7 (Read Context Files), add reading the graduation report:

```bash
GRADUATION_REPORT_CONTENT=$(cat "${PHASE_DIR}/research/GRADUATION-REPORT.md" 2>/dev/null || echo "No graduation report -- omit research refs from tasks.")
```

In Step 8 (Spawn lu-planner), add `{graduation_report_content}` to the `<planning_context>` block, after the `{research_content}` section:

```markdown
**Graduated Research Engrams (for research_refs):**
{graduation_report_content}
```

This gives the planner the list of available concept names to populate `**Research refs:**` lines.

**Files to create/edit:**

- `src/skills/general/phase-plan.skill.ts` (EDIT)

**Verification:**

- Step 7 reads `GRADUATION-REPORT.md` from `${PHASE_DIR}/research/`
- Step 8 Task() prompt includes `graduation_report_content` in planning context
- Fallback text is provided when report is absent
- `bunx --bun tsc --noEmit` passes

### 2. Add research context injection to phase-execute executor spawn

**Type:** auto
**Depends on:** none
**Research refs:** research:approach-per-task-recall, research:pitfall-wrong-vault-recall

Edit `src/skills/general/phase-execute.skill.ts`.

Between reading plan content and spawning executors (Step 4, around line 600), add research refs extraction and recall. The orchestrator parses refs and assembles context; the executor receives it pre-assembled (per 10-RESEARCH.md open question 1 resolution).

Add before the executor Task() calls:

```bash
# Parse research refs from all tasks in this plan
RESEARCH_REFS=$(echo "$PLAN_N_CONTENT" | grep -oP '(?<=\*\*Research refs:\*\*\s).*' | tr ',' '\n' | sed 's/^ *//' | sort -u)

# For each ref, recall from MuninnDB repo vault and build context block
RESEARCH_CONTEXT=""
RESEARCH_GAPS=""
for REF in $RESEARCH_REFS; do
  # muninn_recall(vault: REPO_VAULT, context: REF)
  # If result returns engrams: append to RESEARCH_CONTEXT
  # If no results: append REF to RESEARCH_GAPS
done
```

Then in the executor Task() prompt, add after `</execution_context>`:

```xml
<research_context>
{research_context_block}
</research_context>

<research_gaps>
{research_gaps -- refs with no engrams found}
</research_gaps>
```

CRITICAL: All recall calls MUST use `REPO_VAULT` (not `"default"`) because `research:*` prefix routes to repo vault only (CONTEXT.md Decision 6, PREMORTEM Pitfall 4).

If no `**Research refs:**` lines exist in the plan, skip recall entirely and omit the `<research_context>` block (v1 behavior).

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts` (EDIT)

**Verification:**

- Research refs are parsed from plan content before executor spawn
- Recall uses REPO_VAULT, not default vault
- `<research_context>` block is included in executor prompt when refs exist
- `<research_gaps>` block lists any refs with no recall results
- When no refs exist, blocks are omitted (v1 behavior preserved)
- `bunx --bun tsc --noEmit` passes

### 3. Create phase-plan-review.skill.ts

**Type:** auto
**Depends on:** none
**Research refs:** research:approach-plan-review-loop, research:pitfall-severity-confusion

Create `src/skills/general/phase-plan-review.skill.ts` as a new skill that orchestrates cold-isolation plan review using existing reviewer agents.

Model the skill closely on `src/skills/general/phase-research-review.skill.ts` but with these differences (from CONTEXT.md Decision 2 and 10-RESEARCH.md Component 5):

| Dimension           | phase-research-review                                                     | phase-plan-review                             |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| Input corpus        | Research files in `research/` dir                                         | PLAN.md files in phase dir                    |
| Reviewer agents     | lu-completeness-reviewer, lu-accuracy-reviewer, lu-actionability-reviewer | code-architect, dx-advocate, security-auditor |
| Severity labels     | CRITICAL / IMPORTANT / MINOR                                              | BLOCKING / ADVISORY                           |
| Gap ID prefix       | G-COMP-, G-ACC-, G-ACT-                                                   | G-ARCH-, G-DX-, G-SEC-                        |
| Output file         | `research/REVIEW-LOG.md`                                                  | `PLAN-REVIEW-LOG.md` (in phase dir)           |
| Convergence trigger | B(n) = CRITICAL count                                                     | B(n) = BLOCKING count                         |
| On convergence      | APPROVED -> phase-graduate                                                | APPROVED -> execute plans                     |
| On escalation       | User reviews research gaps                                                | User reviews plan issues                      |

Structure (9 steps, same flow as phase-research-review):

1. **Load Plan Corpus** -- Read all `*-PLAN.md` files from phase dir + CONTEXT.md for phase intent
2. **Read Review Config** -- MAX_ITERATIONS from `--max-iterations` flag or `complexity.matrix.{LEVEL}.planReviewIterations` or `research.planReviewLoop.maxIterations` (default 2)
3. **Initialize Review Loop** -- iteration=1, status="REVIEWING"
4. **Spawn 3 Reviewers in Parallel** (Cold Isolation) -- code-architect, dx-advocate, security-auditor. Each receives PLAN.md files only (no planner reasoning or intermediate drafts). On iteration 2+: include prior BLOCKING findings.
5. **Collect and Parse Reviews** -- Parse `G-{PREFIX}-NNN: [severity: LEVEL] Description` lines where PREFIX is ARCH/DX/SEC and LEVEL is BLOCKING/ADVISORY
6. **Check Convergence** -- B(n) = BLOCKING count. CONVERGED if B(n)==0 or iteration>=MAX. IMPROVING if B(n) decreasing. STALLED if B(n) flat.
7. **If NEEDS_REVISION** -- Extract BLOCKING findings, spawn lu-planner with revision context (delta + prior findings), increment iteration, loop to Step 4
8. **Write PLAN-REVIEW-LOG.md** -- Structured log with all iterations, scores, gaps, and final decision
9. **Return Structured Result** -- Status, iterations, blocking/advisory counts

CRITICAL: Use BLOCKING/ADVISORY severity labels, NOT CRITICAL/IMPORTANT. These are distinct from research review (PREMORTEM Pitfall 5).

The skill is standalone -- it is NOT wired into phase-plan.skill.ts (per CONTEXT.md Decision 7, orchestrator integration deferred to M2).

Use `createSkill()` factory with `SkillConfig` type per existing pattern.

**Files to create/edit:**

- `src/skills/general/phase-plan-review.skill.ts` (NEW)

**Verification:**

- File exports `phasePlanReviewSkill` using `createSkill()`
- Skill name is `"phase-plan-review"`
- Uses BLOCKING/ADVISORY severity (not CRITICAL/IMPORTANT)
- Gap ID prefixes are G-ARCH-, G-DX-, G-SEC-
- Spawns code-architect, dx-advocate, security-auditor (not research reviewers)
- Convergence model matches phase-research-review structure
- Output file is `PLAN-REVIEW-LOG.md` in phase dir
- `bunx --bun tsc --noEmit` passes

### 4. Register phase-plan-review in skill registry

**Type:** auto
**Depends on:** 3

Edit `src/skills/__helpers/build-skill-registry.ts` to register the new skill.

Add import (near the other phase-\* imports, around line 30):

```typescript
import { phasePlanReviewSkill } from "../general/phase-plan-review.skill";
```

Add registry entry (near the other phase-\* entries, around line 100):

```typescript
"phase-plan-review": () => phasePlanReviewSkill,
```

**Files to create/edit:**

- `src/skills/__helpers/build-skill-registry.ts` (EDIT)

**Verification:**

- Import statement present for `phasePlanReviewSkill`
- Registry entry `"phase-plan-review"` maps to the skill factory
- `bunx --bun tsc --noEmit` passes

### 5. Document open question resolutions in CANONICAL-DECISIONS.md

**Type:** auto
**Depends on:** none

Create or append to `.planning/CANONICAL-DECISIONS.md` to record the resolutions for open questions Q5, Q6, Q8, Q9, Q11, Q15, Q16 (from CONTEXT.md Decision 5).

Format each decision as:

```markdown
### Decision [N]: [Title]

**Question:** [Original question]
**Resolution:** [Decision made]
**Rationale:** [Why this decision]
**Phase:** 10
**Date:** 2026-03-24
```

Decisions to document:

- **Q5 -- Research files vs MuninnDB (when to read which?):** Phase-dependent fallback chain. Steps 5-6 read files, Steps 7-8 read files + recall, Steps 9-10 recall only.
- **Q6 -- Cross-phase research reuse:** Recall with staleness warning. Later phases recall prior `research:*` engrams. MuninnDB timestamps provide staleness info.
- **Q8 -- Reviewer freshness across iterations:** Same agent with delta + prior summary. In review loop iteration 2+, give reviewers delta + prior findings summary.
- **Q9 -- Review scope on re-expansion:** Delta review with integration check. After deep expand, re-review only new/changed files + lightweight integration check.
- **Q11 -- User experience during research:** Respect existing oversight levels. Research steps use same progress reporting as existing steps.
- **Q15 -- Synthesizer isolation:** lu-research-synthesizer receives only file paths (cold isolation).
- **Q16 -- Researcher error handling:** Researcher failures are logged, remaining researchers continue (graceful degradation).

**Files to create/edit:**

- `.planning/CANONICAL-DECISIONS.md` (CREATE or APPEND)

**Verification:**

- All 7 decisions (Q5, Q6, Q8, Q9, Q11, Q15, Q16) are documented
- Each entry includes question, resolution, rationale, phase, and date
- Format is consistent with any existing entries in the file

## Verification

- `bunx --bun tsc --noEmit` passes across the entire project
- phase-plan.skill.ts threads graduation report to planner
- phase-execute.skill.ts extracts research refs and injects context to executor
- phase-plan-review.skill.ts exists and is registered
- CANONICAL-DECISIONS.md contains all 7 open question resolutions

## Success Criteria

- Graduation report flows from research dir through phase-plan to lu-planner prompt
- Research context flows from MuninnDB through phase-execute to lu-executor prompt
- Plan review skill can be invoked standalone as `/phase-plan-review {phase}`
- Skill registry contains `"phase-plan-review"` entry
- All open questions from CONTEXT.md Decision 5 are formally documented

## Output Specification

- `src/skills/general/phase-plan.skill.ts` (EDITED)
- `src/skills/general/phase-execute.skill.ts` (EDITED)
- `src/skills/general/phase-plan-review.skill.ts` (NEW)
- `src/skills/__helpers/build-skill-registry.ts` (EDITED)
- `.planning/CANONICAL-DECISIONS.md` (CREATED or APPENDED)
