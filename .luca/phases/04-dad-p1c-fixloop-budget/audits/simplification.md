PERSPECTIVE: simplification

VERDICT: APPROVE

SUMMARY:
P1c is well-scoped to advisory-first. The enforce machinery is NOT over-built:
`withinFixBudget` is a single ~9-line pure function (guards.ts:41-49), registered
once in `setup({guards})` but edge-unwired (pipeline-machine.ts:179-182). No
RELAXATION_PATHS wiring, no escape-hatch config, no budgetMode plumbing beyond a
single optional context field (pipeline-machine.ts:84-85). The load-bearing
no-op-on-undefined quirk is heavily and correctly documented as the
structural-finiteness mechanism (actions.ts:60-85), not an accidental quirk.
Seams for the deferred slice are clean (budget matrix already carries
maxPlanReviewIterations/maxResearchReviewIterations for the 2 deferred edges).

The one material simplification issue is a scattered counter↔cap↔edge mapping:
the rework-edge set is expressed three times.

FINDINGS:

- [SHOULD-FIX] The counter↔cap pairing for rework edges has no single source of
  truth; the rework-edge set is duplicated across three files. `FIX_LOOP_EDGES`
  (actions.ts:49-58) maps `from->to → {action, counter}` but carries NO cap.
  `REWORK_EDGE_CAPS` (luca-state-advance.ts:173-177) independently re-lists the
  same three rework-edge keys mapped to their cap. `REWORK_EDGES` in the test
  (budget-guard.test.ts:28-52) hand-pairs counter+cap a third time. The implicit
  triple (checks->execute ↔ checksFixIteration ↔ maxChecksFixIterations, etc.)
  lives nowhere canonical. This is exactly the mapping the deferred enforce slice
  needs (`WithinFixBudgetParams` is `{counter, cap}`), so it will grow a fourth
  hand-pairing when the guard is wired.
  File: packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts:173-177
  Suggestion: Add an optional `cap?: FixLoopCap` to `FixLoopEdge` (populate it on
  the 3 rework rows only; reset rows need no cap). Then derive `REWORK_EDGE_CAPS`
  by filtering `FIX_LOOP_EDGES` to `action === 'incFixLoop'` and reading `.cap`,
  and import the pairing into the test fixture. That makes `FIX_LOOP_EDGES` the
  lone home for the edge/counter/cap triple and pre-wires the enforce slice.
  (FixLoopCounter is already in actions.ts; FixLoopCap is in guards.ts — a
  type-only import back into actions.ts is fine, or co-locate both in actions.ts.)
  Cross-phase: false

- [NOTE] Dead plumbing in the shipped advisory path: `decideAdvance` threads the
  three cap fields (maxChecksFixIterations etc.) into `machineVerdict` context
  (luca-state-advance.ts:145-147 → machine-verdict.ts:116-118), but nothing reads
  them in advisory mode — the only consumer is the edge-unwired `withinFixBudget`
  guard, and the telemetry budget is resolved from `BUDGET_BY_COMPLEXITY` at emit
  time (luca-state-advance.ts:316-320), not from context. This is a deliberate
  seam readying the enforce slice; acceptable, but it is currently unexercised
  plumbing. If the enforce flip slips, consider dropping the cap threading until
  then. Not a blocker.

- [NOTE] Redundant test coverage: the "cap boundary" test
  (budget-guard.test.ts:124-147) is fully subsumed by the property test above it
  (lines 103-122), which already samples counter ∈ {0, cap-1, cap, cap+1} and
  asserts `allows iff count < cap` per complexity × edge. The boundary test adds
  no branch the property test doesn't already cover. Could be deleted for DRY, or
  kept as a readability anchor — a judgment call, not a defect.

- [NOTE] The per-edge parameterized action approach (actions.ts + `advanceFor`
  appending `{type, params:{counter}}` in pipeline-machine.ts:122-135) is clean
  and correctly justified (shared `execute` target across two counters means
  event.to keying is impossible). No duplication in the machine wiring itself —
  the increment/reset patch logic is single-sourced in actions.ts and delegated
  to by the inline `assign` wrappers. Good separation.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
