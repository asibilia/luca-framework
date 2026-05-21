# Phase 241: Scout Foundation

## Objective

Create the complete foundation for the scouting pipeline: directory structure, typed state machine, document templates, orchestrator skill, deterministic index updater, and shared agent sections.

## Context

- @.planning/todos/pending/scout-01-directory-structure.md
- @.planning/todos/pending/scout-02-state-machine-schema.md
- @.planning/todos/pending/scout-03-document-templates.md
- @.planning/todos/pending/scout-04-orchestrator-skill.md
- @.planning/todos/pending/scout-05-index-updater.md
- @.planning/todos/pending/scout-21-shared-sections.md

## Wave 1 — Independent Foundations (parallel)

### Task 1.1: Directory Structure

Create `docs/scouting/` with subdirectories and initial files.
**Files:** `docs/scouting/inbox.md`, `docs/scouting/INDEX.md`, dirs: `digests/`, `integration/`, `deferred/`, `manual-review/`, `.scout-state/`
**Verify:** All directories exist, inbox.md has correct format, INDEX.md has header template.

### Task 1.2: State Machine Schema

Create `src/shared/__schemas/scout-state.schemas.ts` with Zod schemas for state enum, transition table, state file schema, and `validateScoutTransition()` function.
**Files:** `src/shared/__schemas/scout-state.schemas.ts`
**Verify:** Exports ScoutStateSchema, ScoutTransitionTable, ScoutStateFileSchema, validateScoutTransition. Type-checks clean.

### Task 1.3: Shared Agent Sections

Create `src/agents/__helpers/scout-shared-sections.ts` extending researcher-shared-sections.ts with scout-specific context.
**Files:** `src/agents/__helpers/scout-shared-sections.ts`
**Verify:** Exports SCOUT_CONTEXT, SCOUT_OUTPUT_STANDARDS, SCOUT_RELEVANCE_CRITERIA, SCOUT_CODEBASE_CONTEXT. Re-exports RESEARCHER_PHILOSOPHY, RESEARCHER_VERIFICATION_PROTOCOL.

## Wave 2 — Dependent Utilities (parallel)

### Task 2.1: Document Templates

Create `src/skills/__helpers/scout-templates.ts` with template constants for all artifact types.
**Files:** `src/skills/__helpers/scout-templates.ts`
**Verify:** Exports DIGEST_TEMPLATE, IMPACT_TEMPLATE, INTEGRATION_TEMPLATE, DEFERRED_TEMPLATE, MANUAL_REVIEW_TEMPLATE. Type-checks clean.

### Task 2.2: Index Updater

Create `src/skills/__helpers/scout-index.ts` with deterministic INDEX.md generation from state files.
**Files:** `src/skills/__helpers/scout-index.ts`
**Verify:** Exports updateScoutIndex(). Reads .scout-state/\*.json, generates grouped table. Type-checks clean.

## Wave 3 — Orchestrator

### Task 3.1: Scout Orchestrator Skill

Create `src/skills/general/scout.skill.ts` deterministic state machine driver.
**Files:** `src/skills/general/scout.skill.ts`
**Verify:** Exports SkillConfig via createSkill(). Handles `/scout`, `/scout URL`, `/scout --review`, `/scout --deferred`. Uses state machine for step progression. Type-checks clean.

## Success Criteria

1. All 6 files created and type-check clean
2. State machine enforces valid transitions only (no step skipping)
3. Templates cover all 5 artifact types
4. Orchestrator supports all 4 argument modes
5. Index updater produces valid markdown table
6. Shared sections extend researcher pattern correctly
