---
phase: 268
plan: 1
type: feature
autonomous: false
wave: 1
depends_on: [258, 259, 260, 261, 262, 263, 264, 265, 266, 267]
---

# Phase 268 Plan 1: Orchestrator Pipeline Integration

## Objective

Wire the oversight gate matrix (ORCH-02) and budget matrix (ORCH-03) into the `/lu` orchestrator template (`SKILL.md`), then audit pipeline coherence against the v9.0.0 spec to ensure all v9.0.0 changes are correctly integrated end-to-end (ORCH-01).

This is an **integration phase**, not a rewrite. Phases 258-267 incrementally updated the orchestrator template (now 593 lines) and built supporting infrastructure (pipeline lock, convergence state, budget-utils, recovery, drift detection). Phase 268 adds the two missing infrastructure pieces (oversight gate matrix and budget matrix) as standalone helper modules, wires them into the template, and audits the full pipeline for coherence against the spec.

## Context

- `packages/luca-framework/templates/harness/claude/skills/__branding.commandPrefix__/SKILL.md` -- the orchestrator template, primary edit target
- `docs/research/workflow-redesign/06-final-workflow.md` -- the definitive spec (Section 6: Oversight Gate Matrix, Section 7: Budget Matrix)
- `packages/luca-framework/src/state/utils/budget-utils.ts` -- existing budget assessment utilities
- `packages/luca-framework/src/complexity/__schemas/complexity-matrix.schemas.ts` -- existing complexity schemas
- `packages/luca-framework/src/state/__schemas/pipeline-lock.schemas.ts` -- existing lock schemas
- `packages/luca-framework/src/state/types.ts` -- existing state types with oversight and token_profile fields
- `packages/luca-framework/src/recovery/__helpers/convergence-state.ts` -- convergence state persistence

## Tasks

### 1. Create oversight gate matrix schemas and evaluator

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/state/__schemas/oversight-gate.schemas.ts` with Zod schemas defining the 8 decision points, 4 oversight modes, and profile modifiers. Then create `src/state/__helpers/oversight-gate.ts` with a pure function `evaluateOversightGate(decisionPoint, oversightMode, tokenProfile)` that returns an `OversightAction` ("continue" | "pause" | "auto-apply" | "auto-create" | "auto-approve" | "auto-complete" | "auto-continue" | "park-continue").

The function encodes the full matrix from spec Section 6, including the token profile modifiers for drift detection (budget=auto-apply always, quality=PAUSE always) and the CRITICAL review safety gate (PAUSE always).

**Files to create/edit:**

- `packages/luca-framework/src/state/__schemas/oversight-gate.schemas.ts` (new)
- `packages/luca-framework/src/state/__helpers/oversight-gate.ts` (new)
- `packages/luca-framework/src/state/index.ts` (re-export new modules)

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors
- Schema defines all 8 decision points as an enum
- Schema defines all 4 oversight modes
- Schema defines all 3 token profiles
- Evaluator function returns correct action for each cell in the matrix
- Profile modifier overrides for drift detection are implemented
- CRITICAL review findings always return "pause" regardless of mode or profile

### 2. Create budget matrix schemas and resolver

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/state/__schemas/budget-matrix.schemas.ts` with Zod schemas defining the budget matrix. Then create `src/state/__helpers/budget-matrix.ts` with a pure function `resolveBudgetMatrix(complexity, tokenProfile)` that returns resolved iteration limits with profile multipliers applied.

The resolver must implement:

- Base iteration limits by complexity (5 params x 5 levels = 25 cells)
- Profile multipliers (budget=0.5x floor 1, balanced=1.0x, quality=2.0x)
- Task sizing limits (max files per task, max tasks per wave) that are NOT profile-modified
- A `resolveConvergenceOverride(budgetStatus, convergenceSignal)` function that determines whether convergence signals should override budget limits (progress extends, stalls shorten)

This module extends the existing `budget-utils.ts` (which provides `assessBudget` and `shouldStartIteration`) with the matrix dimension that was missing: complexity-to-limits mapping and profile multipliers.

**Files to create/edit:**

- `packages/luca-framework/src/state/__schemas/budget-matrix.schemas.ts` (new)
- `packages/luca-framework/src/state/__helpers/budget-matrix.ts` (new)
- `packages/luca-framework/src/state/index.ts` (re-export new modules)

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors
- `resolveBudgetMatrix("MODERATE", "budget")` returns HARNESS_FIX_ITERATIONS=1 (floor of 2\*0.5=1)
- `resolveBudgetMatrix("COMPLEX", "quality")` returns MAX_IMPL_ITERATIONS=6 (3\*2.0=6)
- Task sizing limits are identical regardless of profile
- REVIEW_FIX_ITERATIONS for TRIVIAL is always 0 (special case: no fix loop)
- Convergence override correctly extends loops making progress and shortens stalled loops

### 3. Wire oversight gates into SKILL.md at 8 decision points

**Type:** auto
**Depends on:** 1

Update the orchestrator template to read oversight mode and token profile from state.json, then call the oversight gate evaluator at each of the 8 decision points defined in the spec. Each gate call should follow this pattern:

```bash
GATE_ACTION=$(bun src/state/__helpers/oversight-gate.ts \
  --decision="decision_point_name" \
  --oversight="$OVERSIGHT_MODE" \
  --profile="$TOKEN_PROFILE" 2>/dev/null || echo "pause")
```

The 8 wiring points in SKILL.md are:

1. **Step 2A (milestone creation)** -- before auto-creating milestone
2. **Step 2B (WSJF revision)** -- before auto-approving roadmap changes
3. **Step 7b / 5b (before each phase)** -- before entering phase execution
4. **Step 7p / 5k (phase gaps)** -- when implementation loop exits with gaps
5. **Step 7k / 5l (CRITICAL review findings)** -- after code review with CRITICAL findings
6. **Step 7o+5q+ (drift detected)** -- after drift detection finds affected phases
7. **Step 8 / 6 (milestone boundary)** -- when all phases complete
8. **Step 9 / 7 (cross-milestone)** -- before starting next milestone

For each: if GATE_ACTION is "pause", prompt user interactively. If "continue"/"auto-\*", proceed without pause.

**Files to create/edit:**

- `packages/luca-framework/templates/harness/claude/skills/__branding.commandPrefix__/SKILL.md`
- `packages/luca-framework/src/state/__helpers/oversight-gate.ts` (add CLI entry point)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 8 decision points in SKILL.md have gate evaluation calls
- Each gate call gracefully falls back to "pause" (fail-closed) on error
- The existing `oversight != "full-auto"` guard at Step 7b is replaced by proper matrix evaluation
- No hardcoded oversight behavior remains -- all decisions flow through the evaluator

### 4. Wire budget matrix into SKILL.md loop initialization

**Type:** auto
**Depends on:** 2

Update the orchestrator template to resolve budget limits before entering each iteration loop. The budget matrix is resolved once per phase (after per-phase complexity classification at Step 7c/5c) and the resolved limits are used to cap the harness fix loop, implementation loop, and review fix loop.

Add the following pattern after Step 7c (per-phase complexity classify):

```bash
BUDGET_JSON=$(bun src/state/__helpers/budget-matrix.ts \
  --complexity="$PHASE_COMPLEXITY" \
  --profile="$TOKEN_PROFILE" 2>/dev/null || echo '{"max_impl_iterations":2,"harness_fix_iterations":2,"review_fix_iterations":1,"max_files_per_task":6,"max_tasks_per_wave":4}')
```

Then wire the resolved values into:

- Step 7i (harness fix loop): use `HARNESS_FIX_ITERATIONS` from budget
- Step 7h-k (implementation loop): use `MAX_IMPL_ITERATIONS` from budget
- Step 7k (review fix loop): use `REVIEW_FIX_ITERATIONS` from budget (new -- currently not in SKILL.md)
- Step 7g (plan review): pass task sizing limits to planner for enforcement

Add convergence override integration: before each loop iteration check, also check convergence signals. If making progress, allow one extension beyond soft-stop. If stalled, enforce early exit.

**Files to create/edit:**

- `packages/luca-framework/templates/harness/claude/skills/__branding.commandPrefix__/SKILL.md`
- `packages/luca-framework/src/state/__helpers/budget-matrix.ts` (add CLI entry point)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- HARNESS_FIX_ITERATIONS loop cap in SKILL.md reads from resolved budget (not hardcoded)
- MAX_IMPL_ITERATIONS loop cap is wired (new outer loop limit)
- REVIEW_FIX_ITERATIONS loop cap is wired (new review fix loop)
- Task sizing limits are passed to the planner agent context
- Convergence override pattern is documented inline where loop conditions are checked
- Budget resolution falls back to MODERATE/balanced defaults on failure

### 5. Audit pipeline coherence against spec

**Type:** checkpoint:human-verify
**Depends on:** 3, 4

Perform a systematic audit of the SKILL.md template against all steps in the spec (`06-final-workflow.md`). For each spec step (0 through 8d), verify:

1. The step exists in SKILL.md
2. The step uses the correct infrastructure (deterministic vs Agent() vs inline)
3. State transitions and lock updates are present
4. Agent type mapping and model routing are correct
5. Error handling and fail-closed semantics are correct

Produce an audit checklist as a comment block at the top of SKILL.md (or as a separate audit artifact). Fix any gaps found during the audit.

**Key areas to audit for coherence:**

- Step 0: Crash recovery uses `luca-bridge lock-status` + `luca-bridge recover` (Phase 266)
- Step 1: Deterministic classification (Phase 258) + adaptive adjustment
- Step 2: Milestone lifecycle + WSJF backlog (with oversight gates from Task 3)
- Step 3: Git workflow setup
- Step 4: Phase execution order with backfill
- Step 5a-5q+: Full phase loop with all sub-steps
  - 5b: Oversight gate (Task 3)
  - 5c: Per-phase complexity re-classify
  - 5h: Per-wave execution with fresh context assembly (Phase 264)
  - 5i: Convergence-aware harness fix loop (Phase 262) + budget (Task 4)
  - 5j: Structured verification reads (Phase 261)
  - 5k: Implementation loop exit with convergence override (Task 4)
  - 5l: Code review + CRITICAL review safety gate (Task 3)
  - 5m: Review fix loop with budget (Task 4 -- new)
  - 5o: Mechanical process data (not LLM agent)
  - 5q+: Drift detection (Phase 265) with oversight gate (Task 3)
- Step 6: Milestone boundary with oversight gate (Task 3)
- Step 7: Cross-milestone with state reset (Phase 267) and oversight gate (Task 3)
- Step 8: Session wrap-up with lock release

**Files to create/edit:**

- `packages/luca-framework/templates/harness/claude/skills/__branding.commandPrefix__/SKILL.md` (fixes from audit)

**Verification:**

- Every spec step (0-8d) has a corresponding section in SKILL.md
- No hardcoded iteration limits remain (all flow through budget matrix)
- No hardcoded oversight decisions remain (all flow through gate matrix)
- Lock update calls are present at every step transition
- `bunx --bun tsc --noEmit` passes after all fixes
- Present audit results to user for human verification

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors after all tasks complete
2. **Oversight gate matrix completeness**: All 8 decision points x 4 modes x 3 profiles produce correct actions, verified by reading the evaluator function
3. **Budget matrix correctness**: All 5 params x 5 complexity levels x 3 profiles produce correct values, with profile multipliers applied to loop budgets but NOT to task sizing limits
4. **Pipeline coherence**: Every spec step (0 through 8d) maps to a corresponding section in the SKILL.md template, with correct infrastructure choices (deterministic vs Agent vs inline)
5. **Fail-closed semantics**: Every gate evaluation and budget resolution has a safe fallback default
6. **No regressions**: Existing pipeline behavior (Steps 1-4, 7a-7o) is preserved -- only enhanced with gate/budget wiring

## Success Criteria

- SC-1: The oversight gate evaluator correctly returns the matrix-specified action for all 32 base cells (8 points x 4 modes) plus profile modifiers
- SC-2: The budget matrix resolver correctly computes effective iteration limits for all 75 cells (5 params x 5 levels x 3 profiles) with floor-1 minimum and task sizing exemption
- SC-3: The SKILL.md template references the oversight gate evaluator at all 8 decision points with fail-closed fallback to "pause"
- SC-4: The SKILL.md template references the budget matrix resolver for all 3 loop types (harness fix, impl, review fix) with fail-closed fallback to moderate/balanced defaults
- SC-5: An audit trail confirms every spec step (0 through 8d) has a corresponding, correctly-implemented section in the template

## Output Specification

- `packages/luca-framework/src/state/__schemas/oversight-gate.schemas.ts` -- Zod schemas for oversight gate matrix
- `packages/luca-framework/src/state/__helpers/oversight-gate.ts` -- Gate evaluator function + CLI entry point
- `packages/luca-framework/src/state/__schemas/budget-matrix.schemas.ts` -- Zod schemas for budget matrix
- `packages/luca-framework/src/state/__helpers/budget-matrix.ts` -- Budget resolver function + CLI entry point
- `packages/luca-framework/templates/harness/claude/skills/__branding.commandPrefix__/SKILL.md` -- Updated orchestrator with gate and budget wiring + audit fixes
- `packages/luca-framework/src/state/index.ts` -- Updated barrel exports
