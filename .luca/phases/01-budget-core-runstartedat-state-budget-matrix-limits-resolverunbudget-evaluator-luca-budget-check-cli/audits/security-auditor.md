PERSPECTIVE: security
VERDICT: REQUEST_CHANGES
FINDINGS:
- [MUST-FIX] Config `budget` override can silently DISABLE the wall-time trip wire — the one invariant the guard promises to always enforce. `RunBudgetOverridesSchema` validates every field with only `z.number().nonnegative()` (no `.finite()`, no lower bound above 0). Two concrete inputs pass validation and disable the guaranteed wall-clock dimension:
  (a) `{"budget":{"maxWallClockMs":0}}` — a planted or hand-edited `.luca/config.json` where an operator applies the "0 = disabled" convention (legitimately true for `maxToolCalls`/`softCostCeilingUsd`) to wall-time. In `evaluateRunBudget` the guard `if (!(limit > 0)) continue` (resolve-run-budget.ts:89) treats `0` as "disabled" and SKIPS the dimension entirely → verdict never reaches `halt` on elapsed time.
  (b) `{"budget":{"maxWallClockMs":1e999}}` — `JSON.parse('1e999')` yields `Infinity`, which passes `z.number().nonnegative()` (Zod only rejects `NaN`, not `Infinity`). `limit = Infinity` → `fraction = elapsedMs / Infinity = 0` → never trips.
  Both paths flow through `resolveRunBudgetOverrides` → `{ ...baseLimits, ...overrides }` (budget.ts:194-197) and override the always-positive base ceiling, silently defeating the "ONE guaranteed trip wire." For dev tooling that runs against arbitrary cloned repos, a malicious repo-local `config.json` is a real trust boundary.
  File: packages/luca-core/src/state/helpers/resolve-run-budget.ts:112-118 (schema) with sink at resolve-run-budget.ts:89 and budget.ts:197
  Suggestion: Make the wall-clock override non-disabling and finite. Use `maxWallClockMs: z.number().positive().finite().optional()` (reject 0 and Infinity), and add `.finite()` to `maxToolCalls`/`softCostCeilingUsd` so `1e999` cannot slip through as `Infinity`. Because `.safeParse` fails the whole `budget` object on one bad field and returns `{}` (base ceilings retained), rejecting these degrades correctly — the guard stays armed instead of going blind. Alternatively clamp/floor `maxWallClockMs` to the base ceiling inside `resolveRunBudgetOverrides`.
  Cross-phase: false

- [SHOULD-FIX] A best-effort sidecar with `Infinity` forces a false `halt`. `ToolSidecarSchema.toolCallCount` (budget.ts:54) and `UsageSidecarSchema.totalCostUsd` (budget.ts:65) both accept `Infinity` (`1e999` via `JSON.parse`) under `z.number().nonnegative()`. In `evaluateRunBudget`, `Infinity/limit = Infinity ≥ 1` → `status = 'halt'`. This fails safe (toward halt, not disable) so it is not a MUST-FIX, but a planted local sidecar can force the advisory guard to report `halt` and (in Phase-2 wiring) wrongly abort a healthy run — a local DoS on the loop.
  File: packages/luca-cli/src/commands/write-surface/budget.ts:54, 65
  Suggestion: Add `.finite()` to `toolCallCount` and `totalCostUsd` (and `contextUsedTokens`/`contextLimit`). A non-finite sidecar value should omit the dimension, matching the "malformed → dimension omitted" contract, not force a verdict.
  Cross-phase: true

- [SHOULD-FIX] A corrupt/garbage `runStartedAt` silently disables wall-time by reading elapsed as 0. If `state.runStartedAt` is a non-empty but unparseable string, `Date.parse` → `NaN` → `elapsedMs = 0` (budget.ts:155-159), and the lazy re-stamp does NOT fire because `!runStartedAt` is false for a truthy garbage string (budget.ts:139). The wall-clock dimension then permanently reads `ok`. `runStartedAt` is always written via `toISOString()` (valid), so this only bites on external tampering of `state.json` — same trust class as the config finding but lower likelihood.
  File: packages/luca-cli/src/commands/write-surface/budget.ts:137-159
  Suggestion: Treat an unparseable `runStartedAt` as "unset" — fall into the re-stamp branch (re-anchor the baseline) rather than silently reading `elapsed = 0`, so a tampered timestamp cannot blind the guaranteed trip wire.
  Cross-phase: false

- [NOTE] `contextPct` is computed (budget.ts:183-188, passed into `evaluateRunBudget` at budget.ts:203) but the evaluator's `dimensions` array (resolve-run-budget.ts:71-79) never includes it, so it is dead in Phase 1. `UsageSidecarSchema.contextLimit` is `.positive()`, so no divide-by-zero today, but if the dimension is wired live later without `.finite()`, `Infinity/Infinity = NaN` becomes reachable. Track for Phase 2.

- [NOTE] Verified clean (no MUST-FIX) for the other stated concerns:
  • No secret/PII egress — the stdout verdict emits only numeric `value`/`limit`/`fraction` and static dimension keys (budget.ts:207); Phase 1 only READS sidecars, never writes them.
  • No prototype pollution — `resolveRunBudgetOverrides` reads only three named keys off `parsed.data` (resolve-run-budget.ts:133-141); `{ ...baseLimits, ...overrides }` spreads a Zod-narrowed object; `JSON.parse('{"__proto__":...}')` creates an own key, not a pollution.
  • No path traversal / shell — sidecar and state paths are `join(cwd, '.claude','cache', <literal>)` / `.luca/state.json` with no untrusted interpolation (budget.ts:138,162-170); no `child_process`/shell anywhere in the diff. The `complexity` flag is enum-validated via `ComplexityLevel.safeParse` (budget.ts:129).
  • No crash on malformed input — `readSidecar` wraps `JSON.parse`+`readFile` in try/catch and uses `.safeParse` (budget.ts:76-89); `loadCurrentConfig` returns `{}` on any parse failure (load-current-config.ts:26-34); the lazy `mutateState` stamp is wrapped in try/catch (budget.ts:140-151); the command always exits 0.
  • Lazy stamp race — `mutateState` holds the exclusive `.luca/state.json.lock` across read-modify-write and the mutator re-checks `s.runStartedAt` inside the lock (budget.ts:141-145, mutate-state.ts:127-166), so the stamp is idempotent and cannot corrupt or double-write. It only sets `runStartedAt` when unset, per invariant.

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 1
