---
phase: 08
plan: 01
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 08 Plan 01: Cross-Session Procedure Replay Engine

## Objective

Close the learning loop by enabling high-confidence procedures to auto-replay as pre-plans during phase execution. When a procedure's composite score exceeds a configurable threshold, phase-execute injects it as a pre-plan that lu-executor follows. Harness success/failure automatically updates execution stats, creating a feedback loop where the system provably improves at project-specific tasks over time.

This is the headline feature of the learning pipeline: the first framework where AI demonstrably improves at your specific project through learning-to-execution feedback loops.

## Context

@src/memory/**helpers/procedure-replay.ts
@src/memory/**helpers/procedure-recall.ts
@src/memory/**helpers/procedure-lifecycle.ts
@src/memory/**schemas/memory.schemas.ts
@src/memory/index.ts
@src/skills/general/phase-execute.skill.ts
@src/observability/\_\_helpers/scorecard.ts

## Tasks

### 1. Add Replay Threshold Configuration and Pre-Plan Schema

**Type:** auto
**TDD:** false
**Depends on:** none

Add a configurable replay confidence threshold and a pre-plan schema to the memory domain. The threshold determines when a procedure is confident enough to auto-replay. The pre-plan schema represents a procedure converted into the plan-like format that lu-executor can consume.

**Details:**

1. In `src/memory/__schemas/memory.schemas.ts`, add:
   - `replayThresholdSchema` - configurable threshold with default 0.7 (composite score combining success_rate, relevance_score, and execution_count)
   - `prePlanSchema` - represents a procedure converted to plan format with fields: `source_procedure_id`, `title`, `steps` (array of action items), `confidence_score`, `auto_generated` (boolean flag)
   - `replayResultSchema` - captures the outcome of a replayed procedure: `procedure_id`, `pre_plan_applied`, `harness_passed`, `execution_duration_ms`, `feedback_recorded`

2. Export new schemas and types from `src/memory/index.ts`

**Files to create/edit:**

- `src/memory/__schemas/memory.schemas.ts`
- `src/memory/index.ts`

**Verification:**

- New schemas parse valid data correctly
- `bunx --bun tsc --noEmit` passes
- Types are exported from barrel

### 2. Implement Step-to-Plan Conversion in Procedure Replay

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend `src/memory/__helpers/procedure-replay.ts` with a function that converts a replayed procedure into a pre-plan format consumable by lu-executor. This bridges the gap between stored procedures (ordered steps) and execution plans (structured tasks with verification criteria).

**Details:**

1. Add `convertToPrePlan(procedure, replayResult, threshold)` function:
   - Takes a ProcedureEntry and ProcedureReplayResult
   - Checks if the procedure's composite score (combining `success_rate` and `relevance_score`) meets the threshold
   - If it meets threshold, converts adapted_steps into pre-plan format
   - Each step becomes a task with: action description, expected output (verification), and tool suggestion
   - Returns `PrePlan | null` (null if below threshold)

2. Add `selectReplayableProcedures(procedures, taskDescription, threshold)` function:
   - Combines `findReplayableProcedures` with threshold gating
   - Returns only procedures where composite score >= threshold AND success_rate >= 0.5 (must have proven track record)
   - Requires minimum 3 executions before auto-replay (avoid replaying untested procedures)

**Files to create/edit:**

- `src/memory/__helpers/procedure-replay.ts`

**Verification:**

- Procedures below threshold return null
- Procedures with fewer than 3 executions are excluded
- Converted pre-plans have correct structure
- `bunx --bun tsc --noEmit` passes

### 3. Add Harness Feedback Loop to Procedure Lifecycle

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend `src/memory/__helpers/procedure-lifecycle.ts` with a function that records replay outcomes and auto-updates procedure stats based on harness results. This closes the learning loop: procedure replays feed back into procedure scoring.

**Details:**

1. Add `recordReplayOutcome(entry, harnessPassed, durationMs)` function:
   - Calls existing `updateExecutionStats(entry, harnessPassed)` for stat tracking
   - If harness failed AND success_rate drops below retirement threshold, call `evaluateRetirement()` and apply if warranted
   - Returns updated ProcedureEntry with new stats

2. Add `shouldAutoRetireAfterReplay(entry)` function:
   - After a replay failure, checks if the procedure should be auto-retired
   - Uses stricter thresholds for auto-replayed procedures: success_rate < 0.4 after 5+ executions
   - Returns retirement assessment

**Files to create/edit:**

- `src/memory/__helpers/procedure-lifecycle.ts`

**Verification:**

- Successful replay increments both execution_count and success_count
- Failed replay increments execution_count only
- Auto-retirement triggers correctly at threshold
- `bunx --bun tsc --noEmit` passes

### 4. Add Replay Bridge Commands

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Extend the memory bridge CLI with commands for procedure replay integration. This allows phase-execute (which runs as a skill/prompt) to invoke replay logic via shell commands.

**Details:**

1. In `src/memory/__helpers/bridge.ts`, add new handlers:
   - `handleFindReplayable(args)` - accepts `--task` description and `--threshold` (default 0.7), returns JSON array of replayable procedures with pre-plans
   - `handleRecordReplayOutcome(args)` - accepts `--procedure-id`, `--success` (boolean), `--duration-ms`, updates procedure stats and persists

2. Register new commands in the bridge CLI dispatch.

**Files to create/edit:**

- `src/memory/__helpers/bridge.ts`

**Verification:**

- Bridge commands produce valid JSON output
- Error cases return graceful fallback responses
- `bunx --bun tsc --noEmit` passes

### 5. Inject Pre-Plan Support into Phase-Execute Skill

**Type:** auto
**TDD:** false
**Depends on:** 4

Add procedure replay integration to the phase-execute skill. Before executing a wave, the orchestrator checks for replayable procedures and injects them as pre-plans that lu-executor can follow.

**Details:**

1. In `src/skills/general/phase-execute.skill.ts`, add a new section between step 0 (model profile resolution) and step 1 (plan discovery):
   - "Step 0.5: Procedure Replay Check"
   - Shell command to call `bun run src/memory/__helpers/bridge.ts find-replayable --task="<phase objective>" --threshold=0.7`
   - If replayable procedures found, inject their pre-plans as additional context for lu-executor
   - Pre-plans are presented as "suggested approach from past successful execution" (advisory, not mandatory)

2. After harness verification completes, add feedback recording:
   - For each pre-plan that was followed, call `bun run src/memory/__helpers/bridge.ts record-replay-outcome --procedure-id=<id> --success=<true|false> --duration-ms=<ms>`
   - This closes the feedback loop

3. Add a `--skip-replay` flag to disable procedure replay for a specific invocation.

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Phase-execute skill includes replay check step
- Replay results are recorded after harness verification
- `--skip-replay` flag disables the feature
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes successfully

### 6. Update Barrel Exports and Build

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Ensure all new functions, schemas, and types are properly exported from the memory barrel and that generated files are rebuilt.

**Details:**

1. Verify `src/memory/index.ts` exports all new items:
   - `replayThresholdSchema`, `prePlanSchema`, `replayResultSchema`
   - `convertToPrePlan`, `selectReplayableProcedures`
   - `recordReplayOutcome`, `shouldAutoRetireAfterReplay`
   - New types: `PrePlan`, `ReplayResult`, `ReplayThreshold`

2. Run `bun run build:all` to regenerate `.claude/`, `.cursor/`, `.pi/` outputs.

3. Run `bun run check:drift` to verify no drift.

**Files to create/edit:**

- `src/memory/index.ts`

**Verification:**

- All new exports are accessible via `~/memory`
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes
- `bun run check:drift` shows no drift

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. `bun run build:all` completes successfully
3. `bun run check:drift` shows no drift between source and generated files
4. New schemas in `memory.schemas.ts` parse valid test data
5. Pre-plan conversion produces valid plan-like structures
6. Bridge commands return valid JSON
7. Phase-execute skill includes replay integration sections

## Success Criteria

- Procedures with success_rate >= 0.5 and composite score >= 0.7 (after 3+ executions) are automatically surfaced as pre-plans during phase execution
- Harness pass/fail feeds back into procedure stats, closing the learning loop
- Auto-retirement triggers when replayed procedures consistently fail
- The feature is opt-out via `--skip-replay` flag
- No regressions in existing procedure recall, replay, or lifecycle functionality

## Output Specification

- Updated `src/memory/__schemas/memory.schemas.ts` with replay threshold, pre-plan, and replay result schemas
- Updated `src/memory/__helpers/procedure-replay.ts` with step-to-plan conversion and threshold gating
- Updated `src/memory/__helpers/procedure-lifecycle.ts` with replay outcome recording and auto-retirement
- Updated `src/memory/__helpers/bridge.ts` with replay bridge commands
- Updated `src/skills/general/phase-execute.skill.ts` with pre-plan injection
- Updated `src/memory/index.ts` with new exports
- Rebuilt generated files via `bun run build:all`
