# Research — Phase 1: confidence-gate-substrate

## Goal
Deterministic substrate for confidence-gated `/lu`: (a) extend the confidence schema with optional planning-time fields, (b) a pure `selectConfidenceGateActions()` helper bucketing entries into auto/research/ask, (c) a `luca confidence gate` CLI subcommand emitting JSON. Data/logic layer only — no orchestration wiring (later phases).

## Verdict
Cleanly additive. The confidence domain is well-isolated (one schema file, one journal file, one barrel), with only two writers and two test files. No existing call site breaks if the new fields are `.optional()` and the helper takes already-parsed `ConfidenceEntry[]`.

## Findings (file:line)

### 1. Schema extension — `packages/luca-core/src/confidence/schemas.ts:28-53`
Add two OPTIONAL fields after `reviewHint` (line 52):
```ts
researchable: z.boolean().optional(),            // can autonomous research resolve this?
resolution: z.enum(['auto','research','ask']).optional(),  // explicit gate override
```
Optionality is mandatory and safe:
- Reader `readConfidenceJournal()` (`confidence-journal.ts:76`) uses `safeParse` — old lines parse fine.
- CLI `log` writer (`confidence.ts:152-166`) builds payload from flags; never sets new fields → undefined. No ripple.
- MCP handler `inputSchema` (`luca-confidence-log.ts:54-94`) is a **separate hand-mirrored** schema, NOT derived from core — adding core fields does NOT propagate. Stays compilable. Only update it if a planning writer must set these via MCP (see open Q3).
- Test impact: all three test factories (`confidence-journal.test.ts:24-39`, `luca-confidence-log.test.ts:61-73`, postmortem) spread-with-overrides → optionals absent → tests pass unchanged.

### 2. `selectConfidenceGateActions()` — new file `packages/luca-core/src/confidence/gate.ts`
Keep IO/aggregation in `confidence-journal.ts`; put pure analysis in `gate.ts` (mirrors `postmortem.ts`). Export via `index.ts:17-22` barrel (flows out of luca-core via `src/index.ts:20`).
```ts
export interface ConfidenceGateActions { auto: ConfidenceEntry[]; research: ConfidenceEntry[]; ask: ConfidenceEntry[] }
export function selectConfidenceGateActions(entries: ConfidenceEntry[]): ConfidenceGateActions
```
Bucketing rules (precedence top-down):
1. explicit `resolution` set → that bucket (override wins)
2. `high` → `auto`
3. `medium` → `auto` (recommended; see open Q1 — postmortem/journal only ever single out `low`)
4. `low` + `researchable === true` → `research`
5. `low` + `researchable` absent/false → `ask` (fail-toward-human, per gate-enforcement fail-closed convention)
Pure — no filesystem/clock; reads fields off the passed array.

### 3. CLI `gate` subcommand — `packages/luca-cli/src/commands/write-surface/confidence.ts`
`citty` `defineCommand`, copy `summaryCommand` (`:197-219`): `args.slug` → `resolveSlug({explicit, cwd})` (`:42-54`), `selectConfidenceGateActions(readConfidenceJournal({cwd, slug}))`, `stdout.write(JSON.stringify(actions, null, 2))`. Register in `subCommands` map (`:249-254`) as `gate`. Import helper from `@alecsibilia/luca-core` (`:30-35`). No registration ripple beyond that (group wired at `cli.ts:79-82`).

### 4. Reuse
- `readConfidenceJournal({cwd, slug})` (`confidence-journal.ts:60`) is the correct input — returns parsed, malformed-tolerant `ConfidenceEntry[]`.
- Leave `getConfidenceSummary()` alone (counting, orthogonal to bucketing).
- No MCP write-surface `gate` handler needed — `gate` is read/derive, CLI-only (like read/summary/render).

### 5. Risks / ordering
- Postmortem `LOW_CONFIDENCE_THRESHOLD = 3` (`postmortem.ts:127`) is an aggregate count, independent of bucketing — must NOT be referenced/altered; `lowConfidence` filter (`:303`) untouched by optional fields.
- Only tsc footgun is MCP `inputSchema` drift — avoided by not touching the handler this phase.
- Safe edit order: (1) schema fields → tsc; (2) `gate.ts` helper + barrel export → tsc; (3) `gateCommand` + register → tsc; (4) defer log/MCP writer flags unless in scope.

## Open questions for discuss
1. **`medium` routing** (highest leverage): recommend `medium → auto`. Alternative: `medium → research` (lightweight research on medium-confidence). Established behavior only gates `low`.
2. **`gate` JSON shape**: buckets only `{auto,research,ask}`, or also include `counts`/summary for orchestrator convenience?
3. **Writer exposure this phase**: does Phase 1 need the CLI `log` / MCP handler to SET `researchable`/`resolution`? Phase says "data/logic layer only" → likely defer to Phase 2 (planning-time emission). Confirm.
