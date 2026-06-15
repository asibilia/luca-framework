PERSPECTIVE: simplification
VERDICT: APPROVE

CONVERGENCE RE-REVIEW (cycle-2, cold isolation). Both cycle-1 MUST-FIX are genuinely resolved in the wave-5 delta; both SHOULD-FIX items are applied; no new correctness or clarity defect introduced.

## Cycle-1 MUST-FIX resolution status

### MUST-FIX #1 — every `luca telemetry emit` was missing the REQUIRED `--run-id` flag → RESOLVED
- `--run-id` is `required: true` on the CLI surface (packages/luca-cli/src/commands/telemetry.ts:32-36); omitting it exits 1. Confirmed real.
- `luca telemetry new-run` is a real subcommand that mints + prints a fresh id (telemetry.ts:103-111, `generateRunId()`). Confirmed real.
- Every emit line in lu/index.ts now carries `--run-id <runId>`: lines 75, 117, 138, 143, 181, 237. Grep found zero emit lines without the flag.
- Establishment-once + fallback prose present and correct (lu/index.ts:55-65):
  - L60 `RUN_ID=$(luca state read | jq -r '.sessionId // empty')` — resolved once.
  - L61 `[ -z "$RUN_ID" ] && RUN_ID=$(luca telemetry new-run)` — `new-run` fires AT MOST ONCE, guarded by the empty test, captured into the same `RUN_ID`. The fallback does NOT mint a new id per emit.
  - L65 "Hold RUN_ID in context and pass it as --run-id everywhere below. Do NOT re-derive it or mint a second id mid-run — one run id per run." — removes the per-emit-minting ambiguity for an LLM driver.

### MUST-FIX #2 — `state.runId` does not exist (the field is `sessionId`) → RESOLVED
- Schema confirms `sessionId` is the generated pipeline RUN id; there is no `runId` field (packages/luca-core/src/state/schemas.ts:92-96).
- Zero `state.runId` / `jq '.runId'` references remain. All surviving `runId` tokens are either the `--run-id <runId>` flag placeholder (legal) or the on-disk record/filename shape `<runId>.jsonl` in the read-only luca-telemetry-report skill (pre-existing, describes the record schema, not a state field).
- Emit-side (lu/index.ts:60 reads `.sessionId`) and readback-side (session-resume/index.ts:46 reads `.sessionId`; lu/index.ts:210 reads `.luca/telemetry/<RUN_ID>.jsonl`) line up on the identical run id.
- Graceful unset handling on both sides: lu fallback mints via `new-run`; session-resume (index.ts:48-52) skips readback with an echo and does NOT invent a file path when `sessionId` is empty.

## SHOULD-FIX confirmation
- `signal.failure` → `signal.failure-dump`: emit kind is `signal.failure-dump` (lu/index.ts:138, 143). session-resume retains the broad prefix filter `startswith("signal.")` (index.ts:61-62), so it still catches `signal.failure-dump` and `signal.satisfaction` regardless of suffix. The misleading comment now reads `signal.failure-dump` (index.ts:57). APPLIED.
- `--meta` JSON safety: handler JSON-parses `--meta`, rejects non-objects/arrays, exits 1 on bad input (telemetry.ts:56-75); skill prose notes the meta is advisory and must not be `.parse()`d on the read side (lu/index.ts:126, 146). APPLIED.

## New-defect scan (wave-5 delta)
Checked and clear:
- Run-id establishment is unambiguous to an LLM: one `RUN_ID` per run, explicit "do NOT mint a second id mid-run" (L65), restated at the learn-collect step "the same value you passed as --run-id on every emit" (L210). PASS.
- Fallback does NOT create a new run-id per emit — `new-run` is guarded by `[ -z "$RUN_ID" ]` and assigns once. PASS.
- session-resume graceful-skip reads cleanly: `STATE_JSON` is populated at step 2 (index.ts:28) before the step-3 readback consumes `.sessionId`; the empty branch echoes and exits the block without touching a phantom file. PASS.
- No phantom verb/flag: every emit uses only `--kind`, `--run-id`, `--meta` — all real args on `emit` (telemetry.ts:25-52); `new-run` takes no args. PASS.

FINDINGS:
- [NOTE] Minor redundancy: the run-id resolution rationale is spelled out in prose (lu/index.ts:55-65) AND restated at the learn-collect step (L210). Intentional and helpful for a context-limited LLM driver re-entering mid-run; not worth trimming.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 1
  CROSS_PHASE_COUNT: 0
