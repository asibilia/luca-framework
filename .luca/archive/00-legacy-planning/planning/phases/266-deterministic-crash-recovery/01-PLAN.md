---
phase: 266
plan: 01
type: implementation
autonomous: true
wave: 1
---

# Phase 266: Deterministic Crash Recovery

## Objective

When `/lu` starts after a crash, recovery deterministically determines the resume point from structured state (lock file, state.json, git status, filesystem) without any LLM interpretation. The system produces a `RecoveryAction` JSON specifying the exact action: `fresh-start`, `restart-step`, `resume-phase`, or `advance-phase`.

## Context

@packages/luca-framework/src/state/**helpers/pipeline-lock.ts
@packages/luca-framework/src/state/**schemas/pipeline-lock.schemas.ts
@packages/luca-framework/src/state/bridge.ts
@packages/luca-framework/src/state/index.ts
@packages/luca-framework/templates/harness/claude/skills/**branding.commandPrefix**/SKILL.md

## Tasks

### Task 1: Recovery schemas (RECOV-01 partial)

type="auto"

Create `packages/luca-framework/src/recovery/__schemas/recovery.schemas.ts`:

- `recoveryActionSchema`: action enum (`fresh_start`, `restart_step`, `resume_phase`, `advance_phase`), optional step, optional phase_id, briefing string
- `convergenceStateSchema`: error_ledger (array of objects), stale_count (number), checkpoint_tags (array of strings), updated_at (string)
- Export types via `z.infer`

**Verification:**

- [ ] Schema file exports `recoveryActionSchema`, `RecoveryAction`, `convergenceStateSchema`, `ConvergenceState`
- [ ] All fields use snake_case per API conventions
- [ ] Defaults defined in schema, not destructuring

### Task 2: Recovery algorithm (RECOV-01 complete)

type="auto"

Create `packages/luca-framework/src/recovery/__helpers/recover.ts`:

- Pure deterministic function `determineRecoveryAction()` that reads:
  - Lock file status via `checkLockStatus()` and `readLock()`
  - state.json via `loadPersistedActor()` / `stateExists()`
  - Convergence state from `.planning/.convergence-state.json`
- Decision tree:
  - No lock -> `fresh_start`
  - Lock with dead PID + state=idle -> `fresh_start`
  - Lock with dead PID + pipeline_step present + state=executing -> `restart_step` at that step
  - Lock with all steps complete + phase_step=commit -> `advance_phase`
  - Lock stale (>24h) -> `fresh_start` with warning
- Returns `RecoveryAction` JSON
- CLI entry point via `import.meta.main` block
- Zero LLM, zero Agent() calls

Create barrel `packages/luca-framework/src/recovery/index.ts`.

**Verification:**

- [ ] `determineRecoveryAction()` returns valid `RecoveryAction` for all lock states
- [ ] CLI mode works: `bun packages/luca-framework/src/recovery/__helpers/recover.ts` prints JSON to stdout
- [ ] No LLM or Agent() calls anywhere in the module
- [ ] Imports follow module boundary rules (T1 importing T0 state)

### Task 3: Bridge `recover` command (RECOV-02/03)

type="auto"

Add `recover` subcommand to `packages/luca-framework/src/state/bridge.ts`:

- Add "recover" to `VALID_SUBCOMMANDS`
- Add to help text under "Recovery commands" section
- Create `handleRecover()` function that imports and calls `determineRecoveryAction()`
- Wire into switch statement
- Export from bridge and `index.ts`

Note: `lock-status` already exists from Phase 259, satisfying that part of RECOV-03.

**Verification:**

- [ ] `luca-bridge recover` returns valid RecoveryAction JSON
- [ ] `luca-bridge --help` shows the new recover command
- [ ] Export added to bridge.ts and state/index.ts

### Task 4: Convergence state persistence (RECOV-04)

type="auto"

Create `packages/luca-framework/src/recovery/__helpers/convergence-state.ts`:

- `writeConvergenceState(state: ConvergenceState)` -> atomic write to `.planning/.convergence-state.json`
- `readConvergenceState()` -> reads and parses, returns null if missing
- `clearConvergenceState()` -> deletes the file
- Path constant `CONVERGENCE_STATE_PATH`

Update `packages/luca-framework/src/recovery/index.ts` barrel with new exports.

Update lu.skill.ts template (SKILL.md) harness fix loop (Step 7i) to write convergence state after each harness iteration.

**Verification:**

- [ ] Convergence state read/write/clear functions work correctly
- [ ] lu.skill.ts template includes convergence state persistence in harness loop
- [ ] Recovery algorithm reads convergence state for mid-loop resume context

### Task 5: Orchestrator integration (RECOV-02)

type="auto"

Update lu.skill.ts template Step 1 crash recovery section to:

- On stale lock detection: call `luca-bridge recover` instead of ad-hoc shell logic
- Parse the RecoveryAction JSON
- Jump to appropriate step based on action type:
  - `fresh_start` -> continue normal flow
  - `restart_step` -> jump to the step indicated
  - `resume_phase` -> jump to phase loop at indicated phase
  - `advance_phase` -> skip to next phase

**Verification:**

- [ ] lu.skill.ts Step 1 uses `luca-bridge recover` for crash recovery
- [ ] All four RecoveryAction types handled with appropriate resume behavior
- [ ] Old ad-hoc crash recovery logic replaced

## Verification

- [ ] `bunx --bun tsc --noEmit` passes with zero errors
- [ ] `luca-bridge recover` returns valid JSON for no-lock, stale-lock, and live-lock scenarios
- [ ] Recovery module follows domain architecture (T1 core domain)
- [ ] All schemas use snake_case, safeParse patterns

## Success Criteria

1. After simulated crash, running `/lu` detects stale lock, runs recover.ts, produces RecoveryAction JSON with resume point -- all without LLM
2. `luca-bridge recover` returns structured RecoveryAction JSON, `luca-bridge lock-status` returns lock contents or "unlocked"
3. Convergence state persisted so mid-harness-loop crash recovery preserves context

## Output

- `packages/luca-framework/src/recovery/__schemas/recovery.schemas.ts` (new)
- `packages/luca-framework/src/recovery/__helpers/recover.ts` (new)
- `packages/luca-framework/src/recovery/__helpers/convergence-state.ts` (new)
- `packages/luca-framework/src/recovery/index.ts` (new)
- `packages/luca-framework/src/state/bridge.ts` (modified)
- `packages/luca-framework/src/state/index.ts` (modified)
- `packages/luca-framework/templates/harness/claude/skills/__branding.commandPrefix__/SKILL.md` (modified)
