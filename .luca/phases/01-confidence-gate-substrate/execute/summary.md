# Execute Summary — Phase 1: confidence-gate-substrate

**Status:** success (single wave, 3 sequential tasks). Not committed (per /lu contract — commits at finalize).

## Changes
| Task | File | Change |
|------|------|--------|
| 1 | `packages/luca-core/src/confidence/schemas.ts` | Added optional `researchable?: boolean` + `resolution?: 'auto'\|'research'\|'ask'` to `ConfidenceEntrySchema`. |
| 2 | `packages/luca-core/src/confidence/gate.ts` (new) | Pure `selectConfidenceGateActions(entries)` → `{auto,research,ask,counts}`. F1 total-branch (`else → ask`). |
| 2 | `packages/luca-core/src/confidence/index.ts` | Barrel export of gate helper + type. |
| 3 | `packages/luca-cli/src/commands/write-surface/confidence.ts` | Import helper + `gateCommand` (mirrors `summaryCommand`) + registered `gate` in `subCommands`. |

## Verification
- `bunx --bun tsc --noEmit` green after each task and at end.
- Smoke: `luca confidence gate --slug 01-confidence-gate-substrate` (run from source) → `{"auto":[],"research":[],"ask":[],"counts":{"auto":0,"research":0,"ask":0}}`, no crash on absent journal. `--help` lists `log|read|summary|render|gate`.

## Invariants honored
- New fields `.optional()`; no existing call site forced to set them.
- `LOW_CONFIDENCE_THRESHOLD`/postmortem untouched; no MCP handler touched; no writer flags added (deferred to Phase 2).
- Helper is pure (no IO/clock/randomness).

## Deviations
None substantive. Smoke run from source (global `luca` bin is the prebuilt alpha.8, predates this change) — expected per source-vs-built consumption model.
