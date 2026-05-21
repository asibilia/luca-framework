# feat(mastracode): add subagent invocation telemetry

Closes #43

## Overview

Adds `subagent.invoke` and `subagent.complete` telemetry records to instrument every subagent spawn in the luca pipeline. Enables tracking subagent latency, token costs, and completion status at the aggregate level without requiring runner-layer instrumentation (subagents are spawned directly by the Mastra harness).

## What Changed

### Core Action & Telemetry
- **`record-subagent` workflowState action** — new action to emit `subagent.invoke`/`subagent.complete` records with role, correlationId, tokens, durationMs, success, model
- **Zod schema** — `recordSubagentAction` with validated fields; role/correlationId/model capped at 64/128/64 bytes to preserve JSONL PIPE_BUF atomicity
- **`clampTokens` guard** — non-finite/negative/over-10M values coerce to null; fractionals floor; zero preserved
- **TelemetryKind extension** — explicit union variants for `subagent.invoke` and `subagent.complete` (additive-only, maintains v1 schema contract)

### Prose Instrumentation
All 5 subagent spawn-site instruction files updated with `record-subagent` calls:
- `execute.md` — executor, verifier, reviewer (4 parallel), learner, fix-on-conflict
- `architect.md` — discussion, plan-reviewer
- `research.md` — researcher (5 parallel batch)
- `review.md` — reviewer (4 parallel batch)
- `finalize.md` — learner, shadow-scanner

Parallel batch protocol: emit N sequential invokes before spawn, N completes after returns, paired via distinct correlationIds (e.g. `researcher-scope-<unix-ms>`).

### Subagent Self-Report
- `shared-prefix.ts` updated with usage self-report instruction: subagents append `<!-- usage: {"inputTokens":N,"outputTokens":N,"model":"id"} -->` as last line
- Orchestrator parses last 256 bytes with strict regex; null on absent/malformed block

### Tool-Manifest & Tests
- `record-subagent` registered in tool-manifest allowlists for research, architect, execute, review, finalize modes
- 7 new tests in `workflow-state-actions.test.ts` (invoke emit, complete emit, missing role validation, null tokens, clamp >10M, event→kind dispatch)
- NEW `subagent-telemetry-prose.test.ts` — presence scan for record-subagent in all 5 instruction files

## Requirements Coverage

| Criterion | Status |
|-----------|--------|
| `record-subagent` action in WORKFLOW_STATE_ACTIONS | ✅ |
| `subagent.invoke` + `subagent.complete` TelemetryKind variants | ✅ |
| Token clamp guard (non-negative, finite, ≤10M) | ✅ |
| `correlationId` field + parallel batch protocol | ✅ |
| All 5 instruction files contain `record-subagent` prose | ✅ |
| shared-prefix.ts usage instruction; delta <200 chars | ✅ |
| String length caps (role:64, correlationId:128, model:64) | ✅ |
| All tests pass; tsc clean | ✅ (315/315 pass) |

## Verification

- tsc: pass (no errors/warnings)
- bun-test: 315/315 pass
- Claim gate: 7/7 criteria MET
- Postmortem gate: 0 critical violations

## Testing Checklist

- [x] Wave 1 (schema + action + manifest) — 3 changes + tool entry
- [x] Wave 2 (prose in 5 instruction files) — correlationId protocol documented, referenced at 13 spawn sites
- [x] Wave 3 (usage self-report + tests) — shared-prefix updated, 8 test cases
- [x] Review (0 MUST-FIX, 8 SHOULD-FIX advisory) — all requirements MET

## Related

Foundation for futures todo #39 #41 #42
