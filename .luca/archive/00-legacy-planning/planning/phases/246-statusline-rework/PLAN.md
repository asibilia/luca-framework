# Phase 246: Statusline Rework — Skill Identity, Step Progression & Status Bus

## Objective

Rework the statusline to show real-time workflow information: which skill is active, actual wave progress, sub-step granularity within EXECUTING, and visibility for non-`/lu` skills via a lightweight status bus.

## Context

- `src/hooks/scripts/statusline.ts` — current renderer, reads `state.json`, renders 2-line HUD
- `packages/luca-framework/src/state/types.ts` — `current_wave_count` defaults to 0, phase context has `current_wave`/`total_waves`
- `packages/luca-framework/src/state/machine.ts:440` — passes `total_waves: context.current_wave_count || 1` (the `|| 1` fallback masks the real problem)
- `packages/luca-framework/src/state/actors/phase-actor.ts:150-151` — initializes `current_wave: 0`, `total_waves: input.total_waves ?? 1`
- `packages/luca-framework/src/state/persistence.ts` — `persistActor()` writes snapshot to disk

## Root Causes

| Symptom | Root Cause |
|---|---|
| Always shows `1/1` | `current_wave_count` is never set by the lu orchestrator after planning |
| Always `EXECUTING` | No sub-step info written to state; coarse XState state is all renderer sees |
| No other skills shown | Only the `/lu` XState machine feeds `state.json`; other skills are invisible |
| No skill/workflow label | Renderer doesn't track or display the active skill name |

## Wave 1 — Status Bus Schema + Renderer Integration

### Task 1.1: Create status bus schema and writer

**File:** `src/shared/__schemas/status-bus.schemas.ts`

Create a Zod schema for `.planning/.statusline.json`:

```typescript
export const StatusBusSchema = z.object({
  skill: z.string().default(""),           // e.g., "lu", "pr-address", "scout"
  stage: z.string().default(""),           // e.g., "EXECUTING", "REVIEWING"
  step: z.string().default(""),            // e.g., "research", "discuss", "plan", "execute", "verify"
  phase: z.number().int().optional(),      // Phase number if applicable
  wave_current: z.number().int().nonnegative().default(0),
  wave_total: z.number().int().nonnegative().default(0),
  complexity: z.string().default(""),
  detail: z.string().default(""),          // Free-form detail string
  updated_at: z.string().default(""),      // ISO 8601 timestamp
});
```

**File:** `src/shared/__helpers/status-bus.ts`

Create a writer function:
- `writeStatusBus(data: Partial<StatusBusInput>)` — merges with existing bus data, writes atomically
- `readStatusBus()` — reads and parses, returns null on failure
- `clearStatusBus()` — removes the file

**Verification:**
- [ ] Schema parses valid bus data
- [ ] Writer creates `.planning/.statusline.json` with atomic write
- [ ] Reader returns null when file doesn't exist
- [ ] Types exported from `src/shared/index.ts` barrel

### Task 1.2: Update statusline renderer to read status bus

**File:** `src/hooks/scripts/statusline.ts`

Update `readWorkflowState()` to:
1. Read `.planning/.statusline.json` (the bus) first
2. Fall back to `state.json` if bus file is missing or stale (>60s old)
3. Merge bus data into HUD state: skill prefix, step, wave data

Update `renderHudLine()` to:
1. Prepend skill name: `lu > EXECUTING` instead of just `EXECUTING`
2. Show step within state when available: `lu > execute P246 [===...] 2/3 MODERATE`
3. Keep existing color scheme and progress bar

**Verification:**
- [ ] Renderer shows skill prefix when bus data present
- [ ] Renderer falls back to state.json when bus missing
- [ ] Stale bus data (>60s) is ignored
- [ ] Existing HUD appearance preserved when no bus data

### Task 1.3: Wire status bus writes into lu orchestrator prompts

**File:** `src/skills/__helpers/agent-prompts.ts`

Add a `statusBusProtocol()` helper that generates instructions for the orchestrator to write status bus data at each pipeline step. The lu orchestrator (which runs inline, not as a sub-agent) will call `writeStatusBus()` at each step boundary.

Since the lu orchestrator is a skill that runs in the main conversation (not a compiled agent), we need to add the status bus writes as inline instructions in the lu skill spec.

**File:** `src/skills/luca/lu.skill.ts` — Add `writeStatusBus()` calls at each step boundary in the skill's compiled output.

**Verification:**
- [ ] Status bus updated at each major pipeline step (preflight, route, discuss, plan, execute, verify, learn, commit)
- [ ] Bus cleared on pipeline completion
- [ ] Non-lu skills can write to the same bus file

## Wave 2 — Wave Counter Fix + Frequent Persistence

### Task 2.1: Fix wave counter propagation

**File:** `packages/luca-framework/src/state/machine.ts`

The `current_wave_count` context field needs to be set when the orchestrator knows the wave count (after planning). Currently `machine.ts:440` passes `total_waves: context.current_wave_count || 1` — the `|| 1` fallback masks the real issue.

**Fix:** Add a `SET_WAVE_COUNT` event to the machine that sets `current_wave_count` from the planner output. The lu orchestrator should send this event after planning completes.

**File:** `packages/luca-framework/src/state/types.ts`

Add `SET_WAVE_COUNT` to the event union if not present.

**Verification:**
- [ ] Wave count updates from planner output
- [ ] Progress bar shows correct wave fraction
- [ ] `|| 1` fallback only applies when truly no waves planned

### Task 2.2: Add frequent persistence in phase actor

**File:** `packages/luca-framework/src/state/actors/phase-actor.ts`

The phase actor already tracks `current_wave` and `total_waves` but the parent machine's snapshot only persists at coarse boundaries. The fix is in the bridge/persistence layer — ensure `persistActor()` is called after wave transitions.

Since the lu orchestrator controls when `persistActor()` is called (via bridge transitions), this is actually about ensuring the bridge `transition` command persists after wave-advancing events. Check that `WAVE_COMPLETE` events trigger persistence in the bridge.

**Verification:**
- [ ] After each wave completes, `state.json` reflects updated wave count
- [ ] Statusline picks up new wave count on next render

## Success Criteria

- [ ] Statusline shows `lu > EXECUTING P246 [======....] 2/3 MODERATE v8.6.0` during lu execution
- [ ] Non-lu skills (scout, pr-address) show their name: `scout > INGESTING`
- [ ] Wave counter reflects actual planner wave count, not always `1/1`
- [ ] Sub-step shows within EXECUTING: `execute`, `verify`, `learn`, etc.
- [ ] Graceful fallback: no bus file = existing behavior unchanged
