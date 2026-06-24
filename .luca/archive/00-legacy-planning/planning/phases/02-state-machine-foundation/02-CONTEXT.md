# Phase 2 Context: State Machine Foundation

## Gray Areas Resolved

### 1. Token Budget Per Appetite Level

**Decision:** Use context percentage proxy values mapped to appetite levels.
**Source:** [researched] from `docs/brainstorm/3.final-workflow.md` spec

| Appetite | Token Budget Ceiling | Context % Proxy |
| -------- | -------------------- | --------------- |
| Micro    | ~20k tokens          | 10%             |
| Small    | ~50k tokens          | 25%             |
| Medium   | ~100k tokens         | 50%             |
| Large    | ~150k tokens         | 75%             |
| XL       | ~200k tokens         | 100%            |

**Rationale:** The state machine stores `appetite_level` and `appetite_token_ceiling` as schema fields. The bridge exposes these for guard evaluation. Context % is more portable across model context windows than absolute token counts, so guards should compare against percentage thresholds.

### 2. Cooldown State Mechanics

**Decision:** Event-driven skip with no timer. Cooldown is advisory.
**Source:** [researched] from `docs/brainstorm/3.final-workflow.md` + `machine.ts` patterns

- `complete` → `cooldown` → `idle` is the default path
- A `SKIP_COOLDOWN` event transitions directly `complete` → `idle`
- No setTimeout or timer-based auto-transition — the orchestrator (or user) sends the event
- Cooldown state runs the retro prompt (Phase 5 will implement the retro agent)
- For now, Phase 2 adds the state and transitions; Phase 5 wires the retro logic

### 3. Schema Backward Compatibility

**Decision:** All new fields are optional with Zod `.default()` values.
**Source:** [researched] from `types.ts` existing patterns

- `appetite_level`: `z.enum([...]).default("Medium")`
- `appetite_token_ceiling`: `z.number().default(100000)`
- `appetite_context_percent`: `z.number().default(50)`
- `pre_mortem_result`: `z.object({...}).optional()`
- `process_data`: `z.object({...}).optional()`
- `cooldown_reason`: `z.string().optional()`

Existing state files without these fields will parse cleanly via Zod defaults. No migration script needed.

## Scope Guardrail

Phase 2 modifies ONLY the state machine foundation:

- `types.ts` — WorkflowContext schema extensions
- `machine.ts` — Guard stubs + cooldown state + transitions
- `bridge.ts` — New read/write subcommands for appetite fields
- Snapshot template updates for STATE.md rendering

Phase 2 does NOT implement:

- Pre-mortem agent logic (Phase 3)
- Process data collection (Phase 4)
- Retro/divergent mode (Phase 5)
- Appetite UI or user-facing prompts (Phase 3)
