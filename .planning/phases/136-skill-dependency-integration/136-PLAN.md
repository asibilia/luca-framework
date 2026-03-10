# Phase 136: Skill Dependency Graph Integration

## Goal

Wire existing `buildDependencyOrder`, `detectConflicts`, `groupParallelBatches` from `src/skills/__schemas/skill-dependencies.ts` into the skill execution pipeline so skills respect dependency ordering and conflict detection.

## Context

The skill dependency infrastructure already exists (schemas + helpers) but is not wired into phase-execute or any execution path. This phase connects the existing code to the runtime.

## Tasks

### Task 1: Add dependency metadata to key skill definitions

**Files:** `src/skills/luca/*.skill.ts`, `src/skills/general/*.skill.ts`

Add `dependencies` field to skill definitions that have natural ordering:

- `phase-execute` → requires `phase-plan` before it
- `phase-plan` → requires `phase-discuss` or `phase-research` before it
- `verify` → requires `phase-execute` before it
- `milestone-complete` → requires `verify` before it
- `git-commit` → must not run concurrently with `phase-execute` (mutually exclusive)

### Task 2: Wire dependency helpers into autopilot/phase-execute skill ordering

**Files:** `src/skills/general/phase-execute.skill.ts` or `src/skills/luca/autopilot.skill.ts`

Add a pre-execution step that:

1. Calls `detectConflicts()` on the current skill set to warn about conflicts
2. Uses `buildDependencyOrder()` to validate execution ordering
3. Uses `groupParallelBatches()` to identify safely parallelizable skills

### Task 3: Export dependency validation utility

**Files:** `src/skills/__helpers/`

Create `validate-skill-order.ts` that takes a list of skill names and validates they can execute in that order per the dependency graph.

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Skill definitions include dependency metadata
- [ ] `buildDependencyOrder` returns correct ordering for known dependency chains
- [ ] `detectConflicts` flags mutually exclusive skills
