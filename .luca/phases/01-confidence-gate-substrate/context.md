# Context — Phase 1: confidence-gate-substrate

User decisions gathered at the `discuss` step (oversight: full-auto; questions surfaced from research's open items).

## Decisions

### 1. Medium-confidence routing → `auto` [user-decided]
Only `low` confidence ever gates. `high` and `medium` proceed silently (route to `auto`).
**Why:** matches established behavior — the postmortem (`LOW_CONFIDENCE_THRESHOLD`) and the journal renderer already single out only `low`. Keeps full-auto quiet; the gate fires only on genuine low-confidence items. The `researchable` flag splits `low` into research-vs-ask.

### 2. Phase 1 scope = data/logic layer only [user-decided]
In scope:
- Add optional `researchable?: boolean` and `resolution?: 'auto'|'research'|'ask'` to `ConfidenceEntrySchema`.
- New pure helper `selectConfidenceGateActions()` in `packages/luca-core/src/confidence/gate.ts` + barrel export.
- New `luca confidence gate [--slug <phase>]` CLI subcommand (read/derive; emits JSON).

Deferred to later phases:
- CLI `luca confidence log` writer flags for `researchable`/`resolution` → Phase 2 (planning-time emission), where the planner actually sets them.

Explicitly OUT of scope (clarified with user):
- **MCP write-surface is NOT used in this project.** Do not touch `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts` or any MCP tool definition. The only writer surface that matters is the `luca` CLI.

### 3. Bucketing rules (locked) [research-recommended, accepted]
Precedence, top-down:
1. explicit `entry.resolution` set → that bucket (override wins)
2. `high` → `auto`
3. `medium` → `auto`  (per decision #1)
4. `low` + `researchable === true` → `research`
5. `low` + `researchable` absent/false → `ask`  (fail-toward-human, per gate-enforcement fail-closed convention)

### 4. `gate` JSON shape [orchestrator-decided, low-stakes]
Emit `{ auto: ConfidenceEntry[], research: ConfidenceEntry[], ask: ConfidenceEntry[], counts: { auto, research, ask } }`. Buckets carry full entries (downstream needs `decision`/`category`/`files`); `counts` added for cheap orchestrator convenience. Reuse `readConfidenceJournal()` as the input source. Leave `getConfidenceSummary()` untouched.

## Constraints / invariants
- New schema fields MUST be `.optional()` — existing journals, the CLI `log` writer, and the three luca-core test files must still parse unchanged.
- `selectConfidenceGateActions()` MUST be pure (no IO/clock) — takes already-parsed `ConfidenceEntry[]`.
- Do NOT reference or alter `LOW_CONFIDENCE_THRESHOLD` / postmortem behavior.
- Verification gate: `bunx --bun tsc --noEmit`. Do not run `bun test`.
- Safe edit order: schema → gate.ts + export → CLI subcommand → tsc after each.
