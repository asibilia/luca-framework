# Research: Per-Phase Wave Duration Telemetry

## Summary

Foundation work for 4 follow-on telemetry todos. Blast radius is small (4 edits + 1 new module) but has 3 design-blocking issues that must be resolved in PLAN.md: fail-safe writes, missing `waveStartedAt`, and lifecycle decision for archived telemetry files. The codebase has a clean, established JSONL-writer pattern (`session-ledger.ts` / `confidence-journal.ts`) to copy verbatim — `mkdirSync` + `appendFileSync`, no Zod on write, sync everywhere.

## Scope

**Files to edit** (5):
| File | Change |
|------|--------|
| `src/tools/workflow-state.ts` | 3 hook sites in `start-phase` (L577), `advance-wave` (L640), `complete-phase` (L752); also stamp `waveStartedAt` in state |
| `src/tools/repo-cleanup.ts` | Add `'telemetry'` to `ROOT_WHITELIST_DIRS` (L90-97) |
| `src/util/phase-paths.ts` | Add `TELEMETRY_DIR()` + `TELEMETRY_PATH(runId)` (after L342) |
| `src/state/luca-store.ts` | Add `waveStartedAt?: string` to `PhaseResult` (L30-47); set in `startPhase` + `advanceWave` |
| `src/__tests__/workflow-state-actions.test.ts` | Add `spyOn(telemetry, 'appendTelemetry')` + assertions |

**Files to create** (2):
| File | Purpose |
|------|---------|
| `src/state/telemetry.ts` | Writer module: `appendTelemetry()`, `buildTelemetryRecord()`, `readTelemetry()`, `TelemetryRecord` type |
| `src/__tests__/telemetry.test.ts` | Writer unit tests via chdir-isolation pattern |

**Read-only context**: `session-ledger.ts`, `confidence-journal.ts`, `phase-paths.ts`, `execute.md` (callsite confirmation).

**Callsite stability**: `start-phase`/`advance-wave`/`complete-phase` called only by execute orchestrator (execute.md L81/88/90/446) + finalize (`complete-phase` L136/154). Stable.

## Architecture

**Dispatch**: `workflow-state.ts` uses single switch (L423-1148). Each case: parseAction → luca-store helper → appendLedger → return. State-write + side effects in same case body. **Inject after existing `appendLedger`, before return.**

**Error contract**: Outer catch (L1149-1154) handles only `ActionValidationError`. Other errors re-throw → kill pipeline. **Telemetry calls MUST be wrapped in inner try/catch** — mirrors `tickPhaseTasks` advisory wrap (L783-810).

**Writer location**: `src/state/telemetry.ts` — matches `session-ledger.ts` / `confidence-journal.ts`. Exported, consumable by 4 future telemetry todos.

**Path constant**: `phase-paths.ts` is the documented single chokepoint. Add:
```ts
export function TELEMETRY_DIR(): string { return join(planningRoot(), 'telemetry') }
export function TELEMETRY_PATH(runId: string): string { return join(TELEMETRY_DIR(), `${runId}.jsonl`) }
```

**Record schema (v:1, locked at initial commit)**:
```jsonc
{
  "v": 1,
  "ts": "<ISO>",
  "runId": "<run-id>",
  "kind": "phase.start" | "phase.end" | "wave.start" | "wave.end",
  "phase": "<phase-name>" | null,
  "slug": "<phase-slug>" | null,
  "wave": <number> | null,
  "complexity": "<level>" | null,
  "oversight": "<mode>" | null,
  "durationMs": <number> | null,
  "meta": {}
}
```

**Writer API**:
```ts
export type TelemetryKind = 'phase.start' | 'phase.end' | 'wave.start' | 'wave.end' | string
export interface TelemetryRecord { /* as above */ }
export function appendTelemetry(kind, meta?, overrides?): void  // NEVER throws
export function buildTelemetryRecord(...): TelemetryRecord       // pure
export function readTelemetry(runId): TelemetryRecord[]
```

Contract: never throws, sync, idempotent mkdir, self-archiving (runId-keyed filename).

## Patterns

**Canonical JSONL append** (confidence-journal.ts:103-117):
```ts
mkdirSync(dirname(p), { recursive: true })
appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8')
```
Third arg is string `'utf-8'`, not options object. Compact (no pretty-print). No locking.

**ANTI-PATTERN to avoid**: verification-result.ts:145-153 does read-all-then-rewrite for JSONL — O(n), TOCTOU. **Do NOT copy.**

**Test fixtures**:
- Writer unit tests → Pattern A (`mkdtempSync` + `process.chdir`, phase-paths.test.ts:24-38)
- Tool instrumentation tests → Pattern B (`spyOn` at module boundary, workflow-state-actions.test.ts:14-30)

**Logging**: `console.warn('[telemetry] ...')` on parse error; silent on success.

**Imports**: `.js` extension required (ESM bundler resolution). Use `'node:fs'` not `'fs'`.

## Dependencies

- Zod 4.3.6 (z.discriminatedUnion banned — flat z.object pattern)
- Bun test runner (`import { ... } from 'bun:test'`)
- No new npm packages
- Sync-first fs API throughout
- runId format: `run_<ts36>_<rand36>` from session-ledger.ts:47-51

No prior telemetry collision — zero `.planning/telemetry` references in repo.

## Risks

Ordered by severity. All blockers have concrete mitigations folded into the PLAN.

| # | Sev | Risk | Mitigation |
|---|-----|------|------------|
| R-1 | 🔴 P0 | **Silent break** — bare `appendFileSync` propagates errors to outer catch → re-throws → halts pipeline | Wrap every telemetry call site in `try { ... } catch { /* never block */ }`. Mirror `tickPhaseTasks`. |
| R-2 | 🔴 P0 | **No `waveStartedAt`** — wave-level durations impossible to compute | Add `waveStartedAt?: string` to `PhaseResult`; set in `startPhase` (wave 1) and each `advanceWave` |
| R-3 | 🔴 P0 | **Orphan state** — `archivePriorRun` doesn't move telemetry files; `.planning/telemetry/` accumulates | Filenames are runId-keyed → non-destructive accumulation. **Decision**: ship as-is; defer janitor to a later todo. Document in writer JSDoc. |
| R-4 | 🟡 P1 | **Whitelist semantics** — reviewer may misread `ROOT_WHITELIST_DIRS` addition as permission grant | Add inline comment: `'telemetry', // straggler-detection allowlist only, not permissions` |
| R-5 | 🟡 P1 | **Schema churn** — 4 follow-on todos depend on record shape | Lock `v:1` in initial commit + JSDoc contract: add fields only, never rename/remove, ignore unknown fields, bump `v:2` for breaks |
| R-6 | 🟡 P1 | **No type safety on writes** — agents could emit malformed records | Zod-validate `TelemetryRecord` in `appendTelemetry`; on failure log+drop, never throw |
| R-7 | 🟡 P1 | **Test gaps** — no behavioral tests for `advance-wave` case logic exist today | Add 5 test categories: error-swallow, writer unit, phase-boundary integration, whitelist regression, schema validation |
| R-8 | 🟢 P2 | **Concurrency** — multi-process appends | POSIX `O_APPEND` atomic up to PIPE_BUF (~4KB); single record << 4KB; document assumption |
| R-9 | 🟢 P2 | **PII in `slug`** — derived from user intent | Already on disk in `luca-state.json` + ledger; no new surface |
| R-10 | 🟢 P2 | **Performance** — sync appendFileSync per boundary | ~10 calls/run × 1-5ms = 10-50ms total; negligible |

## Recommendations

For architect:

1. **3-wave plan**:
   - Wave 1: writer module + schema + path constant + `waveStartedAt` state field + writer unit tests
   - Wave 2: workflow-state.ts hook sites (3 actions) with try/catch wraps + whitelist update + integration tests
   - Wave 3: documentation (JSDoc contract, schema lock), regression tests, postmortem

2. **Lock the schema in Wave 1.** Subsequent telemetry todos must consume it as-is.

3. **Writer never throws.** Implement as: try { ... } catch (e) { console.warn(`[telemetry] write failed: ${e}`) } inside the function — caller doesn't need to wrap. Still wrap call sites defensively though, per existing codebase convention.

4. **`waveStartedAt` lifecycle**:
   - `startPhase`: set `waveStartedAt = new Date().toISOString()` on the new phase (wave 1)
   - `advanceWave`: emit telemetry for old wave (duration = now − waveStartedAt), then set `waveStartedAt = new Date().toISOString()` for new wave
   - `completePhase`: emit telemetry for final wave + emit `phase.end`

5. **Test mock strategy**: tool tests must spy on `appendTelemetry` (mock-at-boundary). Writer tests use chdir-isolation. Both patterns are pre-existing.

6. **No new dependencies.** Match sync-first, bun:test, ESM `.js` extension conventions.

## Open Questions

None block the plan. Architect may pick:

1. Should writer be named `appendTelemetry` (matches `appendLedger`) or `recordTelemetry`? → recommend `appendTelemetry` for symmetry.
2. Should `readTelemetry(runId)` exist in this todo, or defer to the aggregator skill todo? → recommend ship it now for symmetry with `readLedger`.
3. Should `phase.start` carry `meta.startedAt` separate from `ts`? → no; `ts` IS the start time.
