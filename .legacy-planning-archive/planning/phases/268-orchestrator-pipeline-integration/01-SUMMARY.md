# Phase 268 Summary: Orchestrator Pipeline Integration

## Objective

Wire the oversight gate matrix (ORCH-02) and budget matrix (ORCH-03) into the `/lu` orchestrator template, then audit pipeline coherence against the v9.0.0 spec.

## Tasks Completed

### Task 1: Oversight Gate Matrix Schemas and Evaluator

Created the oversight gate infrastructure as standalone helper modules:

- **`src/state/__schemas/oversight-gate.schemas.ts`** -- Zod schemas defining:
  - 4 oversight modes (`full-auto`, `flagged`, `milestone`, `phase`)
  - 8 decision points (milestone_creation through cross_milestone)
  - 3 token profiles (budget, balanced, quality)
  - 8 gate actions (continue, pause, auto_create, auto_approve, auto_apply, auto_complete, auto_continue, park_continue)
  - Gate result schema with action, reason, and profile_override flag
  - CLI input schema for shell-friendly invocation

- **`src/state/__helpers/oversight-gate.ts`** -- Pure function evaluator:
  - `evaluateOversightGate(decisionPoint, oversightMode, tokenProfile)` returns `OversightGateResult`
  - Exports `OVERSIGHT_GATE_MATRIX` as the canonical 8x4 const
  - Profile modifier overrides: budget+drift=auto_apply, quality+drift=pause, critical_review=always pause
  - CLI entry point with fail-closed fallback to "pause"

### Task 2: Budget Matrix Schemas and Resolver

Created the budget matrix infrastructure:

- **`src/state/__schemas/budget-matrix.schemas.ts`** -- Zod schemas defining:
  - 5 complexity levels, 3 profiles
  - Base budget limits schema (5 params per level)
  - Resolved budget schema with profile metadata
  - Convergence override result schema
  - CLI input schema

- **`src/state/__helpers/budget-matrix.ts`** -- Pure function resolver:
  - `resolveBudgetMatrix(complexity, profile)` returns `ResolvedBudget`
  - `resolveConvergenceOverride(budgetStatus, convergenceSignal)` for loop decisions
  - Exports `BASE_BUDGET_MATRIX` (5x5 table) and `PROFILE_MULTIPLIERS` (3 values)
  - Floor rule: min 1 for active loops, 0 allowed for TRIVIAL review_fix
  - Task sizing limits NOT profile-modified
  - CLI entry point with fail-closed fallback to MODERATE/balanced defaults

### Task 3: Wire Oversight Gates into SKILL.md (8 Decision Points)

All 8 decision points from the spec Section 6 are now wired:

1. **Milestone creation (2A)** -- Handled by `/milestone-new` skill (external), `milestone_creation` decision point available
2. **WSJF / Roadmap revision (2B)** -- Added at Step 5 after backlog scan
3. **Before each phase (5b)** -- Replaced hardcoded `oversight != "full-auto"` at Step 7b with proper matrix evaluation
4. **Phase gaps (5k)** -- Added at Step 7p before gap closure retry
5. **CRITICAL review findings (5l)** -- Added at Step 7k after code review (safety gate, always pauses)
6. **Drift detected (5q+)** -- Added at Step 7o-drift after state update
7. **Milestone boundary (6)** -- Added at Step 8 before milestone agents
8. **Cross-milestone (7)** -- Added at Step 9 before state reset

Every gate call uses fail-closed semantics: `|| echo '{"action":"pause",...}'`

### Task 4: Wire Budget Matrix into SKILL.md

- **Budget resolution** added at Step 7c-budget, after per-phase complexity re-classify
- **HARNESS_FIX_ITERATIONS** at Step 7i now reads from resolved budget (not hardcoded)
- **MAX_IMPL_ITERATIONS** at Step 7h now caps the outer implementation loop
- **REVIEW_FIX_ITERATIONS** at Step 7k-fix now caps the new review fix loop
- **Task sizing limits** passed to planner at Step 7g for enforcement
- **Convergence override** documented inline at Step 7i where loop conditions are checked
- **Fallback** on budget resolution failure: MODERATE/balanced defaults

### Task 5: Pipeline Coherence Audit

Audit of SKILL.md against spec `06-final-workflow.md` Steps 0-8d:

| Spec Step                  | SKILL.md Location         | Status    | Notes                            |
| -------------------------- | ------------------------- | --------- | -------------------------------- |
| 0a. Parse args             | Step 1                    | Present   | CLI flags parsed                 |
| 0b. Crash recovery         | Step 1                    | Present   | RECOV-01..04 via luca-bridge     |
| 0c. Initialize             | Step 1                    | Present   | luca-bridge ensure-init          |
| 1a. Cognitive pre-flight   | Step 2                    | Present   | Agent("cognition")               |
| 1b. Classify               | Step 2                    | Present   | Deterministic + adaptive adjust  |
| 1c. Configure              | Step 4                    | Present   | Inline, no Agent()               |
| 1d. ROUTE_COMPLETE         | Step 2                    | Present   | Bridge transition                |
| 2A. Milestone creation     | External (/milestone-new) | Delegated | Gate available but not inline    |
| 2B. Backlog/WSJF           | Step 5                    | Present   | With WSJF oversight gate         |
| 3. Git setup               | Step 4.5                  | Present   | Issue + branch + context         |
| 4. Phase order             | Step 6                    | Present   | Topological sort                 |
| 5a. Dependency check       | Step 7a                   | Present   | Inline                           |
| 5b. Oversight gate         | Step 7b                   | Present   | **ORCH-02 wired**                |
| 5c. Per-phase classify     | Step 7c                   | Present   | Deterministic                    |
| 5c+. Budget resolve        | Step 7c-budget            | **NEW**   | **ORCH-03 wired**                |
| 5d. Gate resolution        | Step 7d                   | Present   | premortem + process_data         |
| 5d-v2. Research pipeline   | Step 7d-v2                | Present   | v2 only, profile-gated           |
| 5e. Discussion             | Step 7e                   | Present   | Always separate Agent()          |
| 5f-g. Planning + review    | Steps 7f, 7g, 7g-v2       | Present   | With task sizing from budget     |
| 5h. Execute wave           | Step 7h                   | Present   | Budget-capped outer loop         |
| 5i. Harness + stuck detect | Step 7i                   | Present   | Budget-capped, convergence-aware |
| 5j. Verification           | Step 7j                   | Present   | Goal-backward JSON               |
| 5k. Loop exit              | Implicit in 7h-7j         | Present   | Budget + convergence             |
| 5l. Code review            | Step 7k                   | Present   | ALL 4 reviewers + CRITICAL gate  |
| 5m. Review fix loop        | Step 7k-fix               | **NEW**   | **ORCH-03 wired**                |
| 5n. Learning               | Step 7l                   | Present   | LLM agent, always runs           |
| 5o. Process data           | Step 7m                   | Present   | Conditional, mechanical          |
| 5p. Commit                 | Step 7n                   | Present   | Feature branch                   |
| 5q. Update state           | Step 7o                   | Present   | ROADMAP + routing history        |
| 5q+. Drift detection       | Step 7o-drift             | **NEW**   | **ORCH-02 wired**                |
| 6. Milestone boundary      | Step 8                    | Present   | **ORCH-02 wired**                |
| 7. Cross-milestone         | Step 9                    | Present   | **ORCH-02 wired**, state reset   |
| 8a. Gap detection          | Step 10                   | Present   | Advisory                         |
| 8b. Session summary        | Step 11                   | Present   | Ledger + state                   |
| 8c. Final transition       | Step 11                   | Present   | COMMIT_COMPLETE                  |
| 8d. Release lock           | Step 11                   | Implicit  | Lock released on exit            |

**Gaps identified and addressed:**

- Step 7b was hardcoded `oversight != "full-auto"` -- replaced with matrix evaluation
- Review fix loop (5m) was missing entirely -- added as Step 7k-fix
- Drift detection oversight gate (5q+) was missing -- added as Step 7o-drift
- Budget resolution was not present -- added as Step 7c-budget
- All iteration limits were hardcoded in config -- now flow through budget matrix

**Remaining known limitations (not blocking):**

- Milestone creation oversight gate (2A) is in the external `/milestone-new` skill, not wired inline
- Process data (5o) is still agent-based in SKILL.md; spec says it should be mechanical TypeScript (future improvement)
- Lock update calls are documented but not explicitly present at every sub-step transition (improvement for a future phase)

## Deviations

- [Rule 2 - Missing Critical] Added `review-fix` agent pattern (`review-fix-{NN}`) to the review fix loop, as this was missing from the agent type mapping table. The pattern already maps to `lu-executor` with ORCHESTRATOR routing.
- [Rule 3 - Blocking] Fixed TypeScript strict mode errors in CLI arg parsing where `RegExpMatchArray` index access needed null checks (`match[1]` and `match[2]` required truthiness guards).

## Verification Results

- `bunx --bun tsc --noEmit` passes with zero errors
- All 8 decision points x 4 modes x 3 profiles are encoded in OVERSIGHT_GATE_MATRIX
- All 5 params x 5 complexity levels x 3 profiles flow through BASE_BUDGET_MATRIX + PROFILE_MULTIPLIERS
- Every gate evaluation has fail-closed fallback to "pause"
- Every budget resolution has fail-closed fallback to MODERATE/balanced defaults
- No hardcoded oversight decisions remain in SKILL.md
- No hardcoded iteration limits remain in SKILL.md (all flow through budget matrix)
