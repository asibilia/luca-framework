---
phase: 1
slug: 01-confidence-gate-substrate
wave: 1
tdd: false
complexity: COMPLEX
---

# Plan — Phase 1: confidence-gate-substrate

## Objective
Build the deterministic, data/logic-only substrate for confidence-gated `/lu`: extend the confidence schema with two optional planning-time fields, add a pure bucketing helper, and expose it as a read-only CLI subcommand. No orchestration wiring, no writers, no MCP. Decisions locked in `context.md` (medium→auto; bucketing rules; gate JSON shape).

## Context
- `research.md` — implementation-ready findings (file:line for every surface).
- `context.md` — locked decisions and invariants.
- Reuse: `readConfidenceJournal()` (`packages/luca-core/src/confidence/confidence-journal.ts:60`); `resolveSlug()` + `summaryCommand` pattern (`packages/luca-cli/src/commands/write-surface/confidence.ts:42-54,197-219`).

## Tasks (atomic, sequential — verify after each)

### Task 1 — Schema: add optional planning-time fields
- File: `packages/luca-core/src/confidence/schemas.ts`.
- In `ConfidenceEntrySchema` (after `reviewHint`, ~line 52) add:
  - `researchable: z.boolean().optional()`
  - `resolution: z.enum(['auto', 'research', 'ask']).optional()`
- Both MUST be `.optional()`. Do NOT touch `ConfidenceLevelSchema`, `ConfidenceCategorySchema`, `ConfidenceSummary`, or any other schema.
- **Verify:** `bunx --bun tsc --noEmit` passes. The 3 existing confidence-related test files still type-check (they build entries via spread-with-overrides, so absent optionals are fine). `git grep` shows no existing writer is forced to set the new fields.

### Task 2 — Pure helper: `selectConfidenceGateActions()`
- New file: `packages/luca-core/src/confidence/gate.ts`.
- Export interface `ConfidenceGateActions { auto: ConfidenceEntry[]; research: ConfidenceEntry[]; ask: ConfidenceEntry[]; counts: { auto: number; research: number; ask: number } }`.
- Export pure function `selectConfidenceGateActions(entries: ConfidenceEntry[]): ConfidenceGateActions`. No IO, no clock, no `Date.now()`. Bucketing precedence (top-down), per `context.md`:
  1. `entry.resolution` set → that bucket.
  2. `confidence === 'high'` → `auto`.
  3. `confidence === 'medium'` → `auto`.
  4. `confidence === 'low'` && `researchable === true` → `research`.
  5. `confidence === 'low'` && (`researchable` absent/false) → `ask`.
  - `counts` = lengths of each bucket.
- Barrel: add `export * from './gate.ts'` (or named exports) to `packages/luca-core/src/confidence/index.ts`. Confirm it re-exports out of luca-core via `src/index.ts`.
- Do NOT reference `LOW_CONFIDENCE_THRESHOLD` or postmortem logic.
- **Verify:** `bunx --bun tsc --noEmit` passes. Import resolves from `@alecsibilia/luca-core`. Manual reasoning check: an entry `{confidence:'low'}` (no researchable) → `ask`; `{confidence:'low', researchable:true}` → `research`; `{confidence:'medium'}` → `auto`; `{confidence:'low', resolution:'auto'}` → `auto`.

### Task 3 — CLI: `luca confidence gate` subcommand
- File: `packages/luca-cli/src/commands/write-surface/confidence.ts`.
- Add `gateCommand` via `citty` `defineCommand`, mirroring `summaryCommand` (`:197-219`):
  - `args: { slug: { type: 'string', description: 'Phase slug (defaults to active phase)' } }`.
  - `run`: `const cwd = process.cwd(); const slug = await resolveSlug({ explicit: args.slug, cwd }); const actions = selectConfidenceGateActions(readConfidenceJournal({ cwd, slug })); process.stdout.write(\`${JSON.stringify(actions, null, 2)}\n\`)`.
- Import `selectConfidenceGateActions` from `@alecsibilia/luca-core` (alongside existing imports, ~`:30-35`).
- Register `gate: gateCommand` in the `subCommands` map (`:249-254`).
- **Verify:** `bunx --bun tsc --noEmit` passes. `luca confidence gate --help` shows the subcommand. `luca confidence gate --slug 01-confidence-gate-substrate` runs and emits valid JSON with `auto/research/ask/counts` keys (empty buckets for an empty/absent journal — no crash).

## Success criteria
- [ ] `ConfidenceEntrySchema` has optional `researchable` + `resolution`; tsc green; no existing call site changed.
- [ ] `selectConfidenceGateActions()` is pure, exported from luca-core, buckets per the locked rules.
- [ ] `luca confidence gate` subcommand registered, emits `{auto,research,ask,counts}` JSON, handles empty journal gracefully.
- [ ] `bunx --bun tsc --noEmit` passes at repo root.
- [ ] Postmortem / `LOW_CONFIDENCE_THRESHOLD` untouched; no MCP handler touched; no writer flags added.

## Out of scope (later phases)
- Planner emitting per-decision confidence (Phase 2).
- CLI `log` writer flags for the new fields (Phase 2).
- Gate sub-step in `lu` + full-auto redefinition (Phase 3).
