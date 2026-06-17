# Audit — architecture

## Verdict
APPROVE

## Summary
The change is well-layered: a pure bucketing helper (`gate.ts`) sits correctly as a peer of `confidence-journal.ts`, the barrel export is explicit and hygienic, the CLI command mirrors the existing `summaryCommand` pattern exactly, and no IO/clock leaks into the pure core. Three real issues are noted (two SHOULD-FIX, one NOTE), none blocking.

## Findings

- **[SHOULD-FIX]** `luca-confidence-log` write-surface handler does not accept the new optional fields (`researchable`, `resolution`) added to `ConfidenceEntrySchema`, creating a schema-drift between the read and write paths.
  - File: `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts:54–94`
  - Suggestion: Per `context.md` §2, writer flags for the new fields are explicitly deferred to Phase 2 — this is intentional, not accidental. Mark it with a `// TODO(Phase 2)` comment on the `inputSchema` definition so future reviewers know the gap is tracked, not forgotten. Alternatively, add both fields as `.optional()` in `inputSchema` now since the underlying `appendConfidenceEntry` accepts them via `Omit<ConfidenceEntry, 'timestamp'>` spread, which means they would pass through even if the write handler's schema validates them.
  - Cross-phase: true

- **[SHOULD-FIX]** `entry.resolution === 'ask'` is handled by the implicit `else` branch in `gate.ts` rather than an explicit `else if (entry.resolution === 'ask') ask.push(entry)`. If the `resolution` enum grows (e.g. `'escalate'`) the fallthrough is still safe, but only because the enum is fixed in `schemas.ts`. The silent fallthrough to `ask` for any unknown resolution value is technically correct right now but fragile.
  - File: `packages/luca-core/src/confidence/gate.ts:48–50`
  - Suggestion: Replace the final `else` in the `entry.resolution` branch with explicit `else if (entry.resolution === 'ask') ask.push(entry); else ask.push(entry) /* unknown, fail-toward-human */` or add a type-exhaustiveness check (`entry.resolution satisfies never`). The schema enum is the guard — note that TypeScript will already warn if the enum expands without updating the switch-like chain, provided strict mode is on.

- **[NOTE]** The `gate` subcommand's `run` handler calls `readConfidenceJournal` synchronously (it returns `ConfidenceEntry[]` directly, not a `Promise`). The command is correctly declared `async run` because `resolveSlug` is async, but the `readConfidenceJournal` call is immediately awaited as a direct value — this is fine today, but if `readConfidenceJournal` is ever made async the call site at `confidence.ts:261` will silently return a Promise rather than the resolved value. Low risk given the module is inside luca-core and under team control.
  - File: `packages/luca-cli/src/commands/write-surface/confidence.ts:260–263`

## Verified locations

1. `packages/luca-core/src/confidence/gate.ts` — confirmed pure (no `import`s from `node:fs`, `node:path`, or any IO module; no `Date`, no `Math.random()`). Import is type-only from `./schemas.ts`.
2. `packages/luca-core/src/confidence/index.ts:24–25` — `selectConfidenceGateActions` and `ConfidenceGateActions` explicitly named in the barrel; both also re-exported through `packages/luca-core/src/index.ts:20` (`export * from './confidence/index.ts'`), confirming the public API chain is complete.
3. `packages/luca-cli/src/commands/write-surface/confidence.ts:244–265` — `gateCommand` mirrors `summaryCommand` structurally (same `slug` arg, same `resolveSlug` helper, same `process.stdout.write` output pattern). No novel IO paths introduced.
4. `packages/luca-core/src/confidence/schemas.ts:52–63` — `researchable` and `resolution` are both `.optional()` with no `.default()`, satisfying the backward-compatibility constraint from `context.md` §constraints.
5. `packages/luca-core/src/confidence/gate.ts:46–58` — bucketing precedence matches the 5-rule spec in `context.md` §3 exactly; the `else` final branch is fail-toward-human (ask), matching the gate-enforcement fail-closed convention.

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 2
- NOTE: 1
- CROSS_PHASE: 1
