PERSPECTIVE: independence
VERDICT: REQUEST_CHANGES
FINDINGS:
- [MUST-FIX] `runStartedAt` is never reset at run completion, so any SECOND run on the same `state.json` measures wall-clock from the FIRST run's start and the guaranteed trip wire is permanently tripped (spurious `halt`).
  File: packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts:213-216 (and the mirror guard in packages/luca-cli/src/commands/write-surface/budget.ts:139)
  Failure scenario: `research` is reachable ONLY via `triage → research` (packages/luca-core/src/state/configs/pipeline-transitions.ts:14). Within one milestone run the stamp is correctly per-run — research is entered once, and later phases loop `learn → plan` (pipeline-transitions.ts:24), never re-entering research, so the persisted stamp stays put (this half IS coherent). BUT the run-complete edge `finalize → idle` (pipeline-transitions.ts:25) is a supported terminal, and `idle → triage → research` legitimately begins a NEW run in-place. On that second run `s.runStartedAt` is still set from run #1, so the advance stamp is skipped (`s.runStartedAt === undefined` is false) AND the CLI lazy-stamp is skipped (`!runStartedAt` is false). `elapsedMs = Date.now() - <run#1 start>` is then huge → `wallClockMs` fraction ≥ 1 → `halt` for the entire second run. Nothing in the diff (grep of all of `packages/` for `runStartedAt` confirms) ever writes `runStartedAt` back to `undefined`. This defeats the stated "per-run trip wire" requirement; Phase 2 loop wiring would act on the spurious halt.
  Suggestion: Make run-start truly per-run. Either (a) drop the `=== undefined` guard on the `triage → research` stamp so that edge ALWAYS (re)stamps — safe because that edge fires exactly once per run and cannot fire mid-phase — and correspondingly clear/overwrite in the CLI; or (b) clear `runStartedAt` (set to `undefined`) on the `finalize → idle` run-complete edge in luca-state-advance.ts. Option (b) is the smallest, most explicit fix and keeps the lazy-stamp fallback meaningful.
  Cross-phase: true

- [SHOULD-FIX] `EvaluateRunBudgetInput.contextPct` is documented and plumbed but never evaluated — dead input that misleads callers.
  File: packages/luca-core/src/state/helpers/resolve-run-budget.ts:44 (declared/doc'd) vs. :71-79 (the `dimensions` array has only wallClockMs/toolCalls/costUsd); passed in at packages/luca-cli/src/commands/write-surface/budget.ts:183-188,203.
  Failure scenario: The CLI computes `contextPct = contextUsedTokens / contextLimit` and threads it into `evaluateRunBudget`, and the input's JSDoc says "Skipped when undefined" (implying it IS used when defined). It is silently ignored — there is no `BudgetLimits` field for context, so it can never trip or appear in `signals`. Reviewers/consumers will reasonably assume a context ceiling is enforced when it is not.
  Suggestion: Either remove `contextPct` from `EvaluateRunBudgetInput` and stop computing it in the CLI until a context dimension/limit exists, or add a `maxContextPct` limit and a fourth dimension. At minimum, correct the JSDoc to state it is currently inert.
  Cross-phase: false

- [SHOULD-FIX] Best-effort sidecar numeric fields accept `Infinity`, which can force a `halt` from a malformed sidecar — contradicting "best-effort signals never force a halt."
  File: packages/luca-cli/src/commands/write-surface/budget.ts:53-57 (ToolSidecarSchema) and :64-69 (UsageSidecarSchema); consumed by resolve-run-budget.ts:91-95.
  Failure scenario: `z.number()` rejects `NaN` but ACCEPTS `Infinity`. JSON has no `Infinity` literal, but `JSON.parse('{"toolCallCount": 1e999}')` yields `Infinity`, which passes `.nonnegative()`. That flows to `fraction = value / limit = Infinity ≥ 1` → `halt` on a best-effort dimension the design says must never coerce a halt from garbage.
  Suggestion: Add `.finite()` to the numeric sidecar fields (`toolCallCount`, `totalCostUsd`, `contextUsedTokens`, `contextLimit`), or clamp/guard non-finite values to `undefined` before passing to `evaluateRunBudget`.
  Cross-phase: false

- [SHOULD-FIX] One bad override field discards ALL config overrides (whole-object `safeParse`), silently reverting every dimension to defaults.
  File: packages/luca-core/src/state/helpers/resolve-run-budget.ts:129-130.
  Failure scenario: `.luca/config.json` `budget: { maxWallClockMs: 5000000, maxToolCalls: -1 }` → `.nonnegative()` fails on `maxToolCalls` → `safeParse` fails → returns `{}` → the perfectly valid `maxWallClockMs` override is also dropped. A user narrowing one dim loses an unrelated valid override with no signal. (Behavior is fail-safe-to-defaults, so not a hard bug, but it is surprising and undiscoverable.)
  Suggestion: Parse each field independently (per-field `.safeParse`) so a single invalid dimension is dropped without nuking valid siblings; or use `.catch()` per field. Optionally warn on dropped fields.
  Cross-phase: false

- [NOTE] A `0` config override silently disables a dimension — including the "guaranteed" wall-clock trip wire. `RunBudgetOverridesSchema` permits `0` via `.nonnegative()`, and `evaluateRunBudget` treats `!(limit > 0)` as disabled (resolve-run-budget.ts:89). This is consistent with the `softCostCeilingUsd: 0 = disabled` convention, but it means `budget.maxWallClockMs: 0` in config silently removes the only guaranteed signal. Intentional footgun; document it or floor wall-clock to a positive minimum.

- [NOTE] Boundary math verified correct: at exactly `warnFraction` → `warn`, at exactly `1.0` (value === limit) → `halt`; negative `elapsedMs` is double-guarded (`Math.max(0, …)` in budget.ts:159 AND `value <= 0 ? 0` in resolve-run-budget.ts:91); `limit > 0` guard prevents divide-by-zero. No off-by-one or NaN in the worst-of loop for finite inputs.

- [NOTE] Verified degrade paths are sound: missing `state.json` → `elapsedMs = 0` → wall-clock reads `ok`, exit 0 (budget.ts:153-159); lazy stamp is idempotent under the state lock (budget.ts:141-146); `readSidecar` truly never throws (existsSync + try/catch + safeParse, budget.ts:76-89); `resolveRunBudgetOverrides` returns `{}` on missing/malformed/non-object `budget` (resolve-run-budget.ts:129-130, matches its tests); command has no `process.exit`, so citty resolves 0 even on `halt` — advisory contract met.

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 3
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 1
