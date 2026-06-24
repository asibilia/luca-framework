---
phase: 8
plan: 1
type: docs
autonomous: true
wave: 1
depends_on: []
---

# Phase 8 Plan 1: Cross-Cutting Integration (X03-X08)

## Objective

Create 5 decision/planning documents and 1 utility script for cross-cutting runtime architecture concerns. All items have exact content prescribed in their todo files.

## Context

- @.planning/todos/pending/runtime-x03-backlog-integration-audit.md
- @.planning/todos/pending/runtime-x04-targeted-recompilation-script.md
- @.planning/todos/pending/runtime-x05-behavioral-equivalence-threshold.md
- @.planning/todos/pending/runtime-x06-state-machine-integration-plan.md
- @.planning/todos/pending/runtime-x07-iteration-system-integration-plan.md
- @.planning/todos/pending/runtime-x08-open-questions-resolution.md

## Tasks

### 1. Create backlog integration decisions (X03)

**Type:** auto
**Depends on:** none

Create `docs/runtime-architecture/decisions/backlog-integration-decisions.md` with the exact content from the todo file. Contains 5 concrete decisions about v2 pipeline and runtime architecture sequencing.

**Files to create:**

- `docs/runtime-architecture/decisions/backlog-integration-decisions.md`

**Verification:**

- File exists with all 5 decisions

### 2. Create targeted recompile script (X04)

**Type:** auto
**Depends on:** none

Create `scripts/targeted-recompile.ts` — a utility script that compiles a single domain's artifacts without running the full `build:all`. Read the todo file for exact implementation (~50 lines).

**Files to create:**

- `scripts/targeted-recompile.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Script file exists and is executable

### 3. Create behavioral equivalence criteria (X05)

**Type:** auto
**Depends on:** none

Create `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md` with the exact acceptance criteria from the todo file. Defines what "identical behavior" means for DAG-compiled prose.

**Files to create:**

- `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md`

**Verification:**

- File exists with acceptance criteria sections

### 4. Add state machine DAG events (X06)

**Type:** auto
**Depends on:** none

Modify `packages/luca-framework/src/state/types.ts` to add DAG lifecycle events (DAG_STEP_START, DAG_STEP_COMPLETE, DAG_STEP_FAILED, DAG_WAVE_COMPLETE, DAG_EXECUTION_COMPLETE). Read the todo file for exact event type definitions. Also create/modify other files as specified in the todo.

**Files to modify/create:**

- `packages/luca-framework/src/state/types.ts` (add events)
- Additional files per todo

**Verification:**

- `bunx --bun tsc --noEmit` passes
- New event types exist in the union

### 5. Create iteration integration spec (X07)

**Type:** auto
**Depends on:** none

Create `docs/runtime-architecture/decisions/iteration-integration-spec.md` with the integration specification from the todo file. Documents how the DAG executor will consume `src/iteration/` helpers.

**Files to create:**

- `docs/runtime-architecture/decisions/iteration-integration-spec.md`

**Verification:**

- File exists with integration specification

### 6. Create open questions resolution (X08)

**Type:** auto
**Depends on:** none

Create `docs/runtime-architecture/decisions/open-questions-resolved.md` with concrete decisions for all 5 unresolved design questions from the todo file.

**Files to create:**

- `docs/runtime-architecture/decisions/open-questions-resolved.md`

**Verification:**

- File exists with all questions resolved

## Verification

```bash
bunx --bun tsc --noEmit
```

- All 5 decision documents exist in `docs/runtime-architecture/decisions/`
- `scripts/targeted-recompile.ts` exists
- State machine types updated (if X06 modifies code)
- No TypeScript errors

## Success Criteria

- All 6 cross-cutting items documented with concrete decisions
- Targeted recompile script functional
- State machine ready for DAG lifecycle events
- Phase 9 (v2 Research Infrastructure) can proceed

## Output Specification

- `docs/runtime-architecture/decisions/backlog-integration-decisions.md` (new)
- `scripts/targeted-recompile.ts` (new)
- `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md` (new)
- `packages/luca-framework/src/state/types.ts` (modified)
- `docs/runtime-architecture/decisions/iteration-integration-spec.md` (new)
- `docs/runtime-architecture/decisions/open-questions-resolved.md` (new)
