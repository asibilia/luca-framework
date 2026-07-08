PERSPECTIVE: correctness + simplification
VERDICT: APPROVE

## Correctness (MUST-FIX)

No MUST-FIX defects found. Each of the four correctness probes was checked against source and passes:

1. **`decideAdvance` purity/totality — PASS.** `decideAdvance` (luca-state-advance.ts:121-137) is a pure function: it reads `from = s.pipelineStep`, calls `machineVerdict({ currentStep, requestedStep, complexity: s.complexity, oversight: s.oversight })`, and returns `verdict.resultingStep` or throws. It correctly threads `complexity`/`oversight` off state (ac-02 evidence confirmed at line 123-128). `machineVerdict` (machine-verdict.ts:72-128) gates unknown steps ABOVE `resolveState` (lines 77-90), so for schema-valid inputs it never throws — the only throw in `decideAdvance` is the intended rejection throw. Total for schema-valid inputs.

2. **Rejection message / reason codes — PASS.** The throw (lines 131-134) embeds `verdict.reason`, so `illegal-transition` naturally contains the substring `illegal` (ac-04). `same-step-no-op`, `unknown-current-step`, `unknown-requested-step` all interpolate into a sensible `rejected transition [<reason>]: 'from' → 'to'. Allowed next steps from 'from': [...]` message — no empty/confusing message for any reachable reason code. Verified `same-step-no-op` message does NOT contain `illegal-transition` (test:76-96 asserts `not.toContain('illegal-transition')`).

3. **Edge cases vs old `isLegalTransition` path — PASS.** Bootstrap (idle from absent state) is preserved via `bootstrapIfMissing: lucaStateSchema.parse({})` (line 172; ac-09, test:218-232). A persisted UNKNOWN step degrades cleanly: `mutateState` parses the raw file with `lucaStateSchemaTolerant` (mutate-state.ts:160), whose `pipelineStep` field is the `PipelineStep` enum — an unknown value throws a ZodError at the READ (before `decideAdvance` is ever reached), which the handler's try/catch converts to `isError` (lines 174-184). No process crash. The old `isLegalTransition` path had identical read-time behavior, so no regression.

4. **Throw shape — PASS.** `throw new Error(...)` is a plain `Error` (line 131), caught by the handler's own try/catch → `stringifyError` (line 179), and by `run-handler`'s catcher. Shape unchanged from the old generic throw. Existing catchers keep working.

## Simplification (SHOULD-FIX / NOTE)

- [SHOULD-FIX] `decideAdvance` error-message builder is not defensive against the `unknown-current-step` verdict.
  File: packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts:130
  When `verdict.reason === 'unknown-current-step'` (i.e. `from ∉ PIPELINE_TRANSITIONS`), `machineVerdict` returns a clean `allowed:false` verdict — but the message builder then does `PIPELINE_TRANSITIONS[from].join(', ')`, which throws `TypeError: Cannot read properties of undefined (reading 'join')`, converting the machine's graceful rejection into a confusing crash. This is NOT a regression (the read-path Zod parse rejects an invalid persisted `from` first, so it is unreachable in the live write-path; and the old `isLegalTransition` had the same `undefined.includes` fragility) — but the seam is now EXPORTED and directly tested, and the machine deliberately models `unknown-current-step`, so `decideAdvance` should not discard that.
  Suggestion: `const allowed = (PIPELINE_TRANSITIONS[from] ?? []).join(', ')`. One-token guard; makes the exported seam total for the machine's full reason-code set.
  Cross-phase: false

- [NOTE] Success message uses the requested `to`, not the persisted `resultingStep`.
  File: packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts:368
  The `pipelineStep advanced: 'from' → 'to'` text and the state write use different sources (`decideAdvance` returns `verdict.resultingStep`; the message prints `to`). Benign because P1a parity proves `resultingStep === to` for every legal flat-table edge, but if the machine ever produced a non-identity leaf the message would silently drift from the persisted value.

- [NOTE] Allowed-next-steps enumeration is duplicated across `decideAdvance` and `checkPipelineGuard`.
  Both build the `PIPELINE_TRANSITIONS[from]` list for their rejection messages. This is intentional per the locked plan decision (the hook keeps `checkPipelineGuard` for rich messages; the mutation gets its own reason-code message) and they live in different packages (luca-cli vs luca-core), so consolidation is not warranted. `machineVerdict` correctly returns no `message` field, so building it at the mutation seam is the right place. Recorded only for awareness.

- [NOTE] Mild test overlap on the `plan → execute` illegal case.
  File: packages/luca-cli/src/write-surface/handlers/luca-state-advance.test.ts:44-74
  "rejects illegal jumps with isError" (line 44) and "illegal cross-step error carries the illegal-transition reason code" (line 61) both exercise `plan → execute`; the first adds a state-unchanged assertion, the second the reason-code assertion. Could be one test, but the split keeps each assertion focused. The equivalence harness (test:251-285) is correctly table-driven over 6 representative pairs — good non-redundant coverage. No action required.

The `decideAdvance` extraction itself is the right seam: thin, pure, exported, and directly proven equivalent to `machineVerdict` by the table-driven harness. Not over-engineered.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
