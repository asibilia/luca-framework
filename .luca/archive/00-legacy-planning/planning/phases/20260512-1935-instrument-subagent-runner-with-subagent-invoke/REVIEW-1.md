# Code Review — Wave 1

**Date**: 2026-05-13
**Complexity**: MODERATE
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `record-subagent` action in WORKFLOW_STATE_ACTIONS | MET | workflow-state.ts:285, switch case L1407 |
| `subagent.invoke` + `subagent.complete` in TelemetryKind | MET | telemetry.ts:85-86 |
| Token clamp guard (non-negative, finite, ≤10M) | MET | clampTokens L113-119; test (e) verifies clamp |
| `correlationId` field in schema | MET | recordSubagentAction L261 |
| All 5 instruction files contain record-subagent prose | MET | subagent-telemetry-prose.test.ts: 5/5 pass |
| shared-prefix.ts usage self-report; delta <200 chars | MET | L27; 1393-1275=118 char delta |
| All tests pass; tsc clean | MET | 315/315 pass, tsc clean |
| role.max(64), correlationId.max(128), model.max(64) | MET | L260-261, 266 (added in review-fix) |
| Parallel batch protocol in prose | MET | execute.md Subagent Telemetry block; research.md, review.md |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.8s |
| bun-test | pass | ~230ms (315 pass, 0 fail) |

## Code Review Findings

### MUST-FIX (0)

None.

### SHOULD-FIX (8)

- **[arch+simp]** `clampTokens` duplicates 3-guard prefix from `finiteOrNull` — should compose.
  - File: `workflow-state.ts:102-119`
  - Fix: `const v = finiteOrNull(n); if (v === null || v > 10_000_000) return null; return Math.floor(v)`

- **[arch+simp]** Flat schema mirror drops `min(1)` on `role` and `correlationId` vs per-action schema — inconsistent contract.
  - File: `workflow-state.ts:438-450`
  - Fix: add `.min(1)` to match `recordSubagentAction`; add `// mirrors recordSubagentAction` comment

- **[arch]** `durationMs` placed in `meta` instead of top-level `overrides` — breaks uniform aggregation pattern set by `mode.end`/`wave.end`/`phase.end`.
  - File: `workflow-state.ts:1431-1439`
  - Fix: pass `durationMs` via 3rd `overrides` arg: `appendTelemetry(kind, { role, ... }, { durationMs: finiteOrNull(durationMs) })`

- **[simp+dx]** `subagent-telemetry-prose.test.ts` has 5 copy-pasted describe/test blocks — collapse to `test.each`.
  - File: `subagent-telemetry-prose.test.ts:21-49`
  - Fix: `test.each(['execute.md','architect.md','research.md','review.md','finalize.md'])('%s includes record-subagent', f => ...)`

- **[sec]** Return message interpolates `role`+`correlationId` without CR/LF strip — log injection via tool result sink.
  - File: `workflow-state.ts:1442`
  - Fix: wrap with `sanitizeLogMessage()` already in telemetry.ts, or add printable-ASCII regex to Zod refinement

- **[sec]** `clampTokens` silently drops >10M → null with no warning — malicious subagent can zero apparent cost.
  - File: `workflow-state.ts:117`
  - Fix: add `console.warn(sanitizeLogMessage(...))` on clamp, or add `.max(10_000_000)` to Zod schema

- **[dx]** `shared-prefix.ts` usage instruction lacks concrete example — LLM may emit literal `<N>` placeholders.
  - File: `shared-prefix.ts:27`
  - Fix: add example: `` `<!-- usage: {"inputTokens":12000,"outputTokens":3400,"model":"claude-opus-4-5"} -->` ``

- **[dx]** `clampTokens` JSDoc missing: zero-preserved, 10M cap rationale, floor behavior.
  - File: `workflow-state.ts:113`
  - Fix: expand JSDoc with zero-preserved note + cap rationale + floor intent

### NOTE (5)

- **[arch]** Prose scan test checks bare string, not structured content — future drift possible.
- **[sec]** `meta` field has no per-key constraints beyond what Zod provides — acceptable, JSON.stringify prevents JSONL split.
- **[sec]** Self-report integrity unverified by design — acceptable for telemetry, not for billing.
- **[simp]** TelemetryKind JSDoc says "extend without amending" but PR amended it — update comment to reflect real convention.
- **[simp]** Binary ternary for event→kind: safe for 2-value enum, fragile if enum grows.

## Verdict

**CLEAN** — 0 MUST-FIX. All acceptance criteria MET.

SHOULD-FIX items are advisory (8 items, all non-blocking). None constitute regressions or missing requirements.
