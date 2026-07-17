PERSPECTIVE: architecture
VERDICT: APPROVE

## Verified evidence (correctness pass, 5 probe axes)

### 1. Assign-action parity invariant — CONFIRMED
- `incFixLoop`/`resetFixLoop` are XState `assign` actions, defined in `setup({actions})` at pipeline-machine.ts:189-194 (each wraps `incFixLoopPatch`/`resetFixLoopPatch` via `assign(...)`). They mutate context, never gate.
- The ONLY edge guard is `toIs`: `advanceFor` (pipeline-machine.ts:122-135) sets `guard: {type:'toIs', ...}` and only APPENDS `actions` for the 6 fix-loop edges. No edge references `withinFixBudget`.
- `withinFixBudget` is registered in `setup({guards})` (pipeline-machine.ts:179-182) but never wired to any transition's `guard` field — edge-unwired as required (anti-02).
- No advisory-mode DENY path exists: `withinFixBudget` returns `true` unconditionally when `budgetMode !== 'enforce'` (guards.ts:45), and it is never consulted on an edge anyway. budget-guard.test.ts:62-97 confirms `.can()` is `true` at `checksFixIteration:99`.

### 2. No-op-on-undefined deviation — SOUND, no live undefined-counter path
- `incFixLoopPatch` (actions.ts:80-84) returns `{}` when `context[counter] === undefined`, else `current + 1`. `resetFixLoopPatch` (actions.ts:97-99) zeroes only the mapped `params.counter` — a single-key patch, no sibling fields touched.
- Production always threads a defined number: `decideAdvance` (luca-state-advance.ts:142-147) reads `s.checksFixIteration` etc.; the schema `.default(0)` (schemas.ts:116-120) guarantees these are numbers after `mutateState`'s parse and after the bootstrap `lucaStateSchema.parse({})` (handler:229). The no-op branch is unreachable in prod; it exists only to keep the machine's `{}` default context invariant for `getAdjacencyMap` graph exploration. Verified: no live read of a counter that bypasses the schema default.

### 3. Counter write-back — off PERSISTED value, no clobber — CONFIRMED
- `machineVerdict` seeds context from persisted inputs (machine-verdict.ts:110-120), drives the real `transition` (line 153), then reads `next.context[edge.counter]` and returns `counterUpdate` (lines 158-165). The increment is therefore computed off the persisted counter, not a zero baseline.
- `decideAdvance` returns `{pipelineStep, counterUpdate?}` (luca-state-advance.ts:160-166); the handler spreads `{...s, pipelineStep, [field]: value}` (handler:218-227). `...s` first preserves every other field; only `pipelineStep` + the single mapped counter are overwritten.
- Empirically confirmed: handler test 195-221 asserts `checksFixIteration` 1→2 (off persisted 1) with the other 10 counter/cap fields byte-unchanged.

### 4. Telemetry — rework-only, correct verdict, failure-open — CONFIRMED
- Emit gated on `counterUpdate !== undefined && reworkCap !== undefined` (handler:315). `REWORK_EDGE_CAPS` (handler:173-177) lists ONLY the 3 rework edges; reset edges produce a `counterUpdate` but have no `reworkCap`, so no emit (verified by test:282-299).
- Non-rework advances produce no `counterUpdate` → no emit.
- `verdict: nextValue >= budget ? 'exceeded' : 'within'` (handler:338-339); budget resolved from `BUDGET_BY_COMPLEXITY[state.complexity]` with `DEFAULT_BUDGET` fallback (handler:316-320). Whole block in try/catch → failure-open (handler:393-397). test:249-280 asserts exactly one record with the expected meta.

### 5. Enforce path off-by-one — CORRECT
- `withinFixBudget` returns `count < cap` (guards.ts:48). counter<cap allows, counter===cap denies (`cap < cap` false), counter>cap denies. Zero-cap denies first attempt (`0 < 0` false). Verified by budget-guard.test.ts:124-161 (cap boundary + zero-cap) and the 5×3 property test:100-122.

FINDINGS:
- [NOTE] Telemetry `budget` is resolved from `BUDGET_BY_COMPLEXITY[complexity][cap]` (handler:316-320), a DIFFERENT source than the persisted `state.max*` caps that the enforce-mode `withinFixBudget` will read (guards.ts:47). Today the persisted caps are schema defaults (3/2/2, schemas.ts:123-127) while the complexity budgets differ (e.g. COMPLEX checks=5). Because `resolveBudgetLimits` is wired nowhere in prod (plan note), the advisory telemetry `verdict` can disagree with a future enforce deny once enforce flips. Advisory-only today; flag for the enforce slice to unify the cap source.
  Cross-phase: true
- [NOTE] `verdict: 'exceeded'` fires at `nextValue === budget` (counter reached cap), not strictly above it. This is consistent with the enforce deny boundary (the next `withinFixBudget` denies at counter===cap), so it reads as a correct leading indicator — but the label "exceeded" for an at-cap value is a mild naming imprecision if surfaced to operators.
  Cross-phase: false
- [NOTE] `FIX_LOOP_EDGES` (actions.ts:49-58) is a single source of truth consumed by both the machine wiring and `machineVerdict`, while the rework subset is re-declared as `REWORK_EDGE_CAPS` (handler:173-177) and again as `REWORK_EDGES` in budget-guard.test.ts:28-52. Three parallel edge lists risk drift if a 4th rework edge is added later (the deferred plan-review→plan / research→research edges). Consider deriving the rework subset from `FIX_LOOP_EDGES` (`action === 'incFixLoop'`).
  Cross-phase: false

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 1
