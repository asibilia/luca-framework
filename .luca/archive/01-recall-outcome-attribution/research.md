# Research Brief — Phase 1: recall-outcome-attribution (v13.1.0, COMPLEX)

## Summary

REQ-11 (record-recall at all 5 modes) is **architecturally trivial but surface-ambiguous**: the proven extension pattern already exists, and the asserting test passes against the *legacy* luca-mastracode `.md` instructions (which already have all 5 directives) — NOT against the v13 luca-tools `.ts` artifacts (where only triage.ts emits). The planner must first resolve **which surface is the v13 source of truth and what the acceptance contract should be**. REQ-12 (memory-utilization attribution) is genuinely novel: `muninn_feedback` is called nowhere, and recalled concept-IDs are never threaded to outcomes. The lowest-risk approach reuses the established "new telemetry kind on the open union" pattern rather than wiring `muninn_feedback`.

## Key Findings

### record-recall current state

- **luca-tools `.ts` artifacts (v13 mode source of truth)** — only `triage.ts` contains the `record-recall` directive:
  - `packages/luca-tools/src/artifacts/modes/triage.ts:84`: *"After the recall returns, emit `record-recall` telemetry via `luca telemetry emit` so the aggregator can compute hit/miss rates and verified-tier hit rate per mode."*
  - `architect.ts:91-92`, `execute.ts:310`, `review.ts:141`, `finalize.ts:90,286` all call `mcp__muninn__muninn_recall` but **emit NO record-recall**. **Confirmed gap: 4 of 5 modes recall-without-emit.**
- **luca-mastracode `.md` instructions (legacy Mastra surface)** — ALL 5 files contain the canonical `// → record-recall { query, resultCount, verifiedCount, vault, mode, durationMs }` inline directive.

### The asserting test

- `packages/luca-mastracode/src/__tests__/recall-prose.test.ts` reads from `../instructions/*.md` (luca-mastracode), **NOT** the luca-tools `.ts` artifacts. Per file it checks:
  1. `raw.toContain('record-recall')`
  2. directive appears OUTSIDE fenced code blocks
  3. `outsideFences` matches `/\/\/\s*→\s*record-recall/` — the canonical `// →` inline form
  4. NO `// →` directive INSIDE a fence
  5. coverage: every file has ≥1 inline directive
- **This test is currently GREEN** — the `.md` files already satisfy it. It does NOT cover the `.ts` artifacts. **The todo's premise ("test asserts all 5 but only triage wired") is mis-stated: the test targets the legacy `.md` surface, where all 5 already pass.** (Most important finding for the planner.)

### Telemetry schema for recall (REQ-11)

- `packages/luca-core/src/telemetry/schemas.ts:36-37` — `recall.hit` / `recall.miss` are in the open `TelemetryKind` union. Meta field shapes are defined in the luca-mastracode handler `recordRecallAction` (`workflow-state.ts:711-755`): `query` (≤512, no CR/LF/tab), `resultCount`, `verifiedCount` (clamped to resultCount; null-preserving), `vault` (`^[a-z0-9_-]+$`), `callerMode` (semantic|recent|balanced|deep), `durationMs`. **Schema already supports everything REQ-11 needs — no schema change required for REQ-11.** `verifiedCount` already carries the verified-tier signal.
- Schema is v1-LOCKED with an open union — additions allowed, no version bump.

### The emit mechanism — TWO distinct paths

- **Path A (v13 active): CLI** `luca telemetry emit --kind <k> --run-id <id> --meta '<json>'` (`packages/luca-cli/src/commands/telemetry.ts:19-101`). `--run-id` is **REQUIRED**. `--kind` is free-form (accepts `recall.hit`/`recall.miss`). The `/lu` orchestrator drives all emits this way; run id established once at Step 0.
- **Path B (legacy Mastra): programmatic** `appendTelemetry()` via the `record-recall` action in `workflow-state.ts:1809-1866`, which dispatches `recall.hit` vs `recall.miss` by `resultCount` and clamps `verifiedCount`.
- **The v13 mode `.ts` artifacts use Path A.** Exact shape a mode directive must produce: `luca telemetry emit --kind recall.hit --run-id <runId> --meta '{"query":"...","resultCount":N,"verifiedCount":M,"vault":"...","callerMode":"semantic","durationMs":D}'` (kind = `recall.miss` when resultCount is 0). The CLI does NOT auto-dispatch hit/miss — the directive must pick the kind.

### REQ-12 design — the hard part

- `muninn_feedback` is called **nowhere** in source or instructions (zero matches across luca-tools, luca-mastracode instructions, lu skill).
- Recalled IDs: `muninn_recall` returns records carrying `id` (ULID) fields, held only in the mode/orchestrator working context — **never persisted to any artifact today**.
- Outcomes land at: `verify` (verifier → `verify.json` + `signal.satisfaction` outcome record) and `review` (reviewer → `review.iteration` telemetry + outcome record).

**Two concrete approaches:**

- **Approach 1 (RECOMMENDED, lower-risk) — new telemetry kind, emit at recall-time with IDs + correlate at read-time.** Extend the recall emit to include recalled concept IDs in meta (e.g. `meta.recalledIds`), and at outcome-time emit a new `recall.utilization` kind (or ride `signal.satisfaction` meta). The aggregator (learn step / telemetry-report skill) joins recalled-IDs to the run's terminal outcome valence by runId+step. Mirrors the proven emit-only-extension pattern — no CLI verb, no schema bump, no MCP call, fail-safe. Tradeoff: correlation is post-hoc/statistical, not a per-memory score write-back.
- **Approach 2 (higher-risk) — call `muninn_feedback` at outcome-time.** Orchestrator calls `mcp__muninn__muninn_feedback(id, signal)` for each in-scope recalled ID. Tradeoffs: only the orchestrator has MCP access (subagents don't), so feedback must thread back to `/lu` which doesn't track recalled IDs across the spawn boundary; run-level outcome → individual memory attribution is noisy; the exact `muninn_feedback` signature must be confirmed against the live MCP guide. Riskiest path.
- Hybrid (emit utilization now, optionally feedback later) viable but doubles surface area.

### Blast radius & risk

- **REQ-11 touched:** `triage.ts` (template), `architect.ts`, `execute.ts`, `review.ts`, `finalize.ts` (luca-tools modes); possibly the 5 `.md` instructions if maintained; the test `recall-prose.test.ts` (extend to cover `.ts`, or add a sibling test).
- **REQ-12 touched:** recall directives (add `recalledIds` to meta); `lu/index.ts` (outcome-time emit + learn-step digest read); optionally `schemas.ts` (advisory MetaSchema only); possibly `workflow-state.ts` to keep legacy path in sync.
- **Generated vs source:** luca-tools `.ts` artifacts → materialized to `~/.claude/` by `luca init`; `.md` instructions are luca-mastracode source. Both are source (editable). `state.json`/`roadmap.md` are generated; don't hand-edit.
- **Verification gate:** `bunx --bun tsc --noEmit` (NOT bun test). Tests run bounded: `timeout 120 bun test packages/luca-mastracode/src/__tests__/recall-prose.test.ts`.
- **Riskiest assumption:** that editing luca-tools `.ts` artifacts satisfies the acceptance contract — the asserting test reads `.md`, so a planner editing only `.ts` passes tsc + ships REQ-11 but leaves the existing test unproven against the real v13 surface. Acceptance probes must check **runnability** (full command incl. `--run-id`, real meta keys), not token presence.

## Implications for Planning

1. **Resolve the surface question FIRST** (confidence gate): v13 target = luca-tools `.ts` modes, luca-mastracode `.md` instructions, or both? Test passes today against `.md`; the gap is in `.ts`. Decide whether to (a) port the canonical directive into the 4 missing `.ts` modes, and (b) extend/add a test asserting the `.ts` artifacts.
2. **Reuse proven patterns** — REQ-11 needs no schema/CLI change; REQ-12 should prefer a new `recall.utilization` kind over `muninn_feedback`.
3. **Acceptance probes must check runnability** (full command incl. `--run-id`, real meta keys matching `recordRecallAction`), not token presence.

## Open Questions (confidence gate)

1. **Surface of record (RESOLVE):** luca-tools `.ts` modes vs luca-mastracode `.md` instructions vs both? Is luca-mastracode still a live runtime in v13 or legacy? Determines the entire REQ-11 edit set and test strategy.
2. **REQ-12 mechanism (RESOLVE):** emit-utilization-telemetry (Approach 1) vs call-`muninn_feedback` (Approach 2) vs both? Recommend Approach 1 as MVP.
3. **New kind name:** `recall.utilization` vs `signal.memory-utilization` vs riding on existing `signal.satisfaction` meta?
4. **`muninn_feedback` signature** (only if Approach 2): confirm positive/negative/relevance args against the live MCP guide.
5. **ID threading for REQ-12:** where to record `recalledIds` — in the recall emit's meta, or a per-phase artifact? Affects whether the learn-step digest can join them to outcomes.
