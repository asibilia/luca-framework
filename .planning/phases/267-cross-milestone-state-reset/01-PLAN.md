---
phase: 267
plan: 01
type: feature
autonomous: true
wave: 1
complexity: COMPLEX
---

# Phase 267: Cross-Milestone State Reset

## Objective

When a milestone completes and cross-milestone continuation is enabled, the pipeline performs a full state reset while preserving session identity, then bootstraps the next milestone. This enables multi-milestone sessions without manual intervention.

## Context

@packages/luca-framework/src/state/**helpers/pipeline-lock.ts
@src/complexity/**helpers/routing-history.ts
@packages/luca-framework/src/state/bridge.ts
@packages/luca-framework/src/state/types.ts
@packages/luca-framework/src/state/persistence.ts
@src/skills/luca/lu.skill.ts (Steps 8-9)

## Tasks

### Task 1: Milestone reset schemas

type="auto"

Create `packages/luca-framework/src/state/__schemas/milestone-reset.schemas.ts`:

- `milestoneResetResultSchema` — Result of a milestone reset operation (session_id preserved, fields cleared, archive path)
- `milestoneReadinessSchema` — Validation result (ready: boolean, reason?: string, milestone_count, max_milestones)

**Verification:**

- [ ] Schemas export Zod types and inferred TypeScript types
- [ ] Uses snake_case for all properties
- [ ] MAX_MILESTONES_PER_SESSION constant exported (value: 3)

### Task 2: Milestone reset module

type="auto"

Create `packages/luca-framework/src/state/__helpers/milestone-reset.ts`:

- `resetForNextMilestone(opts: { session_id: string, git_workflow?: object }): Promise<Result<MilestoneResetResult>>`
  - Release lock via releaseLock()
  - Clear routing history JSONL file (truncate to empty)
  - Read state.json, clear all context fields EXCEPT session_id and git_workflow
  - Re-initialize context with preserved fields via initializeContext()
  - Write cleaned state.json back
  - Re-acquire lock via acquireLock()
  - Archive current milestone data: copy milestone files (ROADMAP, REQUIREMENTS, AUDIT) to milestones/ directory
- `validateMilestoneReadiness(phaseResults: PhaseResult[]): Result<MilestoneReadiness>`
  - Check all phases passed (no "failed" or "blocked" statuses)
  - Read milestone_count from state context
  - Enforce MAX_MILESTONES_PER_SESSION (3)
- `incrementMilestoneCount(): Promise<Result<number>>`
  - Read current milestone_count from state.json, increment, persist

**Verification:**

- [ ] resetForNextMilestone preserves only session_id and git_workflow
- [ ] validateMilestoneReadiness rejects when any phase has failed/blocked status
- [ ] milestone counter enforces max 3 per session
- [ ] Uses Result<T> pattern consistently (never throws)

### Task 3: Bridge subcommand

type="auto"

Add `milestone-reset` subcommand to `packages/luca-framework/src/state/bridge.ts`:

- Parse `--session-id` and optional `--git-workflow` args
- Call `validateMilestoneReadiness()` first, reject if not ready
- Call `resetForNextMilestone()` with preserved fields
- Call `incrementMilestoneCount()`
- Return JSON result with reset status

Update VALID_SUBCOMMANDS, HELP_TEXT, switch statement, and exports.

**Verification:**

- [ ] `luca-bridge milestone-reset --session-id=X` is a valid subcommand
- [ ] Returns JSON with success/error fields
- [ ] Validation runs before reset (fail-fast on unclean milestones)

### Task 4: State context fields

type="auto"

Add `milestone_count` field to `workflowContextSchema` in types.ts:

- `milestone_count: z.number().int().nonnegative().default(0)`

Add `milestone_count` to the SETTABLE_FIELDS allowlist in bridge.ts.

**Verification:**

- [ ] `milestone_count` field exists in workflowContextSchema
- [ ] Field is settable via bridge set-field command
- [ ] Default value is 0

### Task 5: Barrel exports

type="auto"

Update `packages/luca-framework/src/state/index.ts`:

- Export milestone-reset functions and schemas
- Export milestone-reset types

**Verification:**

- [ ] All public milestone-reset functions are re-exported from index.ts
- [ ] All milestone-reset schemas and types are re-exported

### Task 6: Orchestrator integration (lu.skill.ts)

type="auto" testable="false"

Update Step 9 in `src/skills/luca/lu.skill.ts`:

- Replace the stub "If CROSS_MILESTONE config == true and next milestone exists: loop back to Step 6"
- Add: read milestone_count from bridge, validate readiness, call milestone-reset bridge command
- Add: check milestone_count < 3 before continuing
- Add: if previous milestone had parked/failed phases, refuse continuation

**Verification:**

- [ ] Step 9 references `luca-bridge milestone-reset` command
- [ ] Safety limit of 3 milestones referenced
- [ ] Failed/blocked phase check is present before reset

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] All new files follow kebab-case naming
- [ ] All schemas use snake_case properties
- [ ] No classes used (functional patterns only)
- [ ] Result<T> pattern used for error handling

## Success Criteria

1. Milestone reset module compiles and exports correctly
2. Bridge subcommand is registered and dispatches correctly
3. State context includes milestone_count field
4. Orchestrator Step 9 references the bridge command with safety checks
5. TypeScript compilation passes with zero errors
