# Context: Per-Phase Wave Duration Telemetry

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Writer lives at `src/state/telemetry.ts` | Matches session-ledger.ts / confidence-journal.ts neighborhood. State modules own append-only JSONL. |
| D2 | Path constant added to `src/util/phase-paths.ts` (single chokepoint) | JSDoc on phase-paths.ts: "only place that should construct `.planning/...` paths". |
| D3 | Telemetry dir layout: `.planning/telemetry/<runId>.jsonl` (per-run file inside dir) | Run-keyed filename = self-archiving across resets. Dir grouping keeps root tidy. |
| D4 | Add `'telemetry'` to `ROOT_WHITELIST_DIRS` (not `ROOT_WHITELIST` files) | We chose dir layout (D3). Inline comment explains semantics. |
| D5 | Add `waveStartedAt?: string` to `PhaseResult` in `luca-store.ts` | No wave-level timestamp exists today. Set in `startPhase` (wave 1) + each `advanceWave`. |
| D6 | Schema v:1 LOCKED at this commit | 4 future telemetry todos consume this writer. Add fields only, no rename/remove. Forward-compat consumers ignore unknown fields. |
| D7 | Record shape includes: `v`, `ts`, `runId`, `kind`, `phase`, `slug`, `wave`, `complexity`, `oversight`, `durationMs`, `meta` | Full pipeline context per record so consumers don't need to join against state. |
| D8 | `appendTelemetry()` NEVER throws — catches all errors internally + logs to stderr | Mirrors `tickPhaseTasks` advisory pattern. Telemetry is never on critical path. |
| D9 | Zod-validate `TelemetryRecord` inside writer before append; drop+warn on failure | Type safety for the 4 follow-on consumers. Sentinel `kind: 'telemetry-error'` not used (drop is cleaner). |
| D10 | Event kinds at v1: `phase.start`, `phase.end`, `wave.start`, `wave.end` | Discrete kinds (not `{kind, sub}`) — simpler filtering. `TelemetryKind` typed as union + `string` for future extension. |
| D11 | Hook sites: `start-phase` (emit phase.start + wave.start for wave 1), `advance-wave` (emit wave.end for prior + wave.start for new), `complete-phase` (emit wave.end for final + phase.end) | Symmetric start/end events enable durationMs calculation at consumer level too. |
| D12 | Telemetry archive/lifecycle deferred to follow-up janitor todo | Files are runId-keyed → non-destructive accumulation. Separate todo already added. |
| D13 | Writer also exports `buildTelemetryRecord()` (pure) + `readTelemetry(runId)` | Symmetric to ledger; consumed by aggregator skill todo. Read returns `[]` on missing file. |
| D14 | Tests split: writer unit tests (Pattern A, chdir-isolation) + tool instrumentation tests (Pattern B, `spyOn` at module boundary) | Matches existing codebase test conventions. |

## Constraints

- Sync-only fs API (`node:fs`), `appendFileSync` with `'utf-8'` third arg as string.
- `.js` extension in imports (ESM bundler resolution).
- Bun test runner (`import { ... } from 'bun:test'`).
- Zod 4.3.6 — no `z.discriminatedUnion`; flat z.object pattern.
- No new npm dependencies.
- Action contract (return shape of start-phase/advance-wave/complete-phase) MUST NOT change.

## Out of scope (deferred to follow-up todos)

- Telemetry janitor / archive lifecycle (separate todo created)
- Subagent invocation telemetry (Wave 1 follow-up todo)
- muninn_recall hit/miss telemetry (Wave 1 follow-up todo)
- Review iteration convergence telemetry (Wave 1 follow-up todo)
- `/luca-telemetry-report` aggregator skill (Wave 1 capstone todo)
