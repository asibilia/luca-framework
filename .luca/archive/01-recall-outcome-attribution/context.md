# Context — Phase 1: recall-outcome-attribution (v13.1.0, COMPLEX)

User decisions locked during `/phase-discuss`. Downstream planner/executor must honor these without re-asking.

## Decision 1 — Surface of record (REQ-11) `[user-input]`

**Wire record-recall at BOTH surfaces, and add `.ts` test coverage.**

- Port the canonical `record-recall` emit directive into the **4 missing v13 luca-tools `.ts` modes**: `architect.ts`, `execute.ts`, `review.ts`, `finalize.ts` (triage.ts already has it). Use `triage.ts:84` as the template.
- Leave the legacy luca-mastracode `.md` instructions as-is (already green under `recall-prose.test.ts`).
- **Add/extend a test asserting the `.ts` artifacts** carry a runnable record-recall directive in all 5 modes — so the v13 surface is regression-protected (today only `.md` is tested).
- Rationale: both runtimes are live (Claude Code harness runs `.ts` materialized to `~/.claude/`; Mastra Code harness runs `.md`). Parity required; the real recall-without-emit gap is in `.ts`.

## Decision 2 — REQ-12 mechanism `[user-input]`

**Approach 1: utilization telemetry (low-risk).**

- Emit recalled concept IDs at recall-time, correlate to outcome valence (verify pass/fail, review verdict) at read-time (learn step / telemetry-report skill).
- **Do NOT call `muninn_feedback`** (absent from codebase; only orchestrator has MCP; signature unconfirmed; run-level→per-memory attribution noisy). Rejected as MVP.
- No telemetry schema version bump (v1 stays locked; ride the open `TelemetryKind` union). No new CLI verb. No subagent MCP access required.
- Correlation is post-hoc/statistical by `runId + step`, not a per-memory score write-back. Acceptable for MVP.

## Decision 3 — New telemetry kind name `[user-input]`

**`recall.utilization`** — new kind on the open `TelemetryKind` union, parallel to `recall.hit` / `recall.miss`. Groups cleanly with existing `recall.*` events.

## Acceptance guardrails (carried from research)

- Acceptance probes must verify **runnability** of the emit directive — full command including the REQUIRED `--run-id` flag and real meta keys matching `recordRecallAction` (`query`, `resultCount`, `verifiedCount`, `vault`, `callerMode`, `durationMs`) — NOT mere token presence. (Heeds the recurring phantom-capability pitfall.)
- Verification gate: `bunx --bun tsc --noEmit`. Tests run bounded: `timeout 120 bun test <file>`.

## Scope boundary

- This phase delivers REQ-11 + REQ-12 only. Cost reporting (REQ-13), KPI persistence (REQ-14), PR-outcome write-back (REQ-15) are later phases — do not pull them in.

## Deferred ideas

- (none captured this discussion)
