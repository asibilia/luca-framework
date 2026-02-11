---
id: 14-02
title: Goal-Backward Verification & Specification Anchoring
phase: 14-execution-verification-audit
wave: 1
delivers: AUDIT-03, AUDIT-04
depends_on: null
tasks: 4
---

# Plan 14-02: Goal-Backward Verification & Specification Anchoring

## Objective

Add two capabilities to the verification pipeline: (1) Goal-backward verification — the verifier explicitly confirms the original PLAN.md objective was met, not just that tasks were completed. (2) Specification anchoring — re-inject PLAN.md content at verification checkpoints so the verifier works from the specification, not from memory drift.

## Context

- **Verifier agent:** `.claude/agents/lu-verifier.md` (Steps 0-10, three-level verification)
- **Execution pipeline:** `.claude/skills/lu-execute-phase/SKILL.md` (Step 7 = verifier delegation)
- **Plan format:** See any `.planning/phases/*/01-PLAN.md` for frontmatter and objective structure
- **VERIFICATION.md template:** Defined inline in lu-verifier.md (Step 10)

## Design Decisions

- **Additive, not breaking**: New steps inserted between existing steps, no renumbering
- **Backward-compatible**: If no PLAN.md files exist, specification anchoring is skipped gracefully
- **No runtime code changes**: These are agent/skill definition changes (Markdown), not TypeScript

## Tasks

### Task 1: Add Step 2.5 — Specification Anchoring (lu-verifier.md)

**Goal:** Insert a new step between Step 2 (Establish Must-Haves) and Step 3 (Verify Observable Truths).
**File:** `.claude/agents/lu-verifier.md`

The new Step 2.5 must:

1. Load all PLAN.md files for the current phase from the phase directory
2. Extract the `## Objective` section from each plan
3. Compare derived must-haves (from Step 2) against plan objectives
4. Flag any derived must-haves that don't trace to a plan objective
5. Flag any plan objectives not covered by must-haves
6. If no PLAN.md files exist, skip with a note: "No PLAN.md files found — specification anchoring skipped"

### Task 2: Add Step 9.5 — Goal-Backward Objective Check (lu-verifier.md)

**Goal:** Insert a new step between Step 9 (Determine Overall Status) and Step 10 (Structure Gap Output).
**File:** `.claude/agents/lu-verifier.md`

The new Step 9.5 must:

1. Re-read each PLAN.md objective one more time (fresh re-injection, not from memory)
2. For each objective, evaluate: "Given the verification results above, was this objective met?"
3. Classify each objective as: PASS (objective clearly met), PARTIAL (some aspects met), FAIL (objective not met), SKIP (no PLAN.md found)
4. If all artifacts verified but an objective not met → flag as "specification gap"
5. Add objective check results to the VERIFICATION.md output
6. Handle missing PLAN.md gracefully (skip with note)

### Task 3: Update VERIFICATION.md Template (lu-verifier.md)

**Goal:** Add two new sections to the VERIFICATION.md template in Step 10.
**File:** `.claude/agents/lu-verifier.md`

Add these sections to the template:

1. **Specification Anchoring** section (after Must-Haves, before Observable Truths):
   - Shows plan-objective ↔ must-have traceability matrix
   - Lists any untraced must-haves or uncovered objectives
2. **Goal-Backward Objective Check** section (before Overall Status):
   - Per-objective PASS/PARTIAL/FAIL/SKIP assessment
   - Any specification gaps identified

### Task 4: Update lu-execute-phase Step 7 — Pass PLAN.md to Verifier

**Goal:** Include PLAN.md contents in the verification context passed to lu-verifier.
**File:** `.claude/skills/lu-execute-phase/SKILL.md`

Modify the Step 7 verifier delegation to:

1. Read all PLAN.md files from the phase directory (alongside SUMMARY.md files already read)
2. Include plan contents in the context passed to lu-verifier
3. Add a `<specification_anchoring>` note in the verifier prompt explaining that the verifier should use the new Steps 2.5 and 9.5

## Verification Criteria

- [ ] lu-verifier has Step 2.5 (Specification Anchoring) with plan-objective traceability
- [ ] lu-verifier has Step 9.5 (Goal-Backward Objective Check) with per-objective assessment
- [ ] VERIFICATION.md template includes Specification Anchoring section
- [ ] VERIFICATION.md template includes Goal-Backward Objective Check section
- [ ] lu-execute-phase Step 7 passes PLAN.md contents to verifier
- [ ] Both new steps handle missing PLAN.md gracefully (skip with note)
- [ ] No existing verification behavior is broken
