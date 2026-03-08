---
phase: 07
plan: 02
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 07 Plan 02: Post-Init Tour Enhancement

## Objective

Enhance the existing post-init interactive tour with dynamic file counts, harness-aware context detection, and richer guidance. The basic tour infrastructure already exists (`packages/luca-framework/src/utils/tour.ts`, `--no-tour` flag, @clack/prompts integration) but currently shows static text. This plan adds dynamic content based on what was actually installed and the detected project context.

## Context

@packages/luca-framework/src/utils/tour.ts
@packages/luca-framework/src/utils/detect.ts
@packages/luca-framework/src/commands/init.ts
@packages/luca-framework/src/utils/files.ts
@packages/luca-framework/src/types.ts

## Tasks

### 1. Add Installation Stats to generateFiles Return

**Type:** auto
**TDD:** false
**Depends on:** none

Update `generateFiles` in `packages/luca-framework/src/utils/files.ts` to track and return installation statistics:

1. Add an `InstallationStats` type to `packages/luca-framework/src/types.ts`:
   - `agent_count`: number of agent files installed
   - `skill_count`: number of skill directories installed
   - `rule_count`: number of rule files installed
   - `hook_count`: number of hook scripts installed
   - `harnesses_installed`: HarnessId[] of platforms actually scaffolded

2. Count files by category during the copy loops (agents, skills, rules, hooks) by checking file paths
3. Return `InstallationStats` alongside the manifest in the success result

**Files to create/edit:**

- `packages/luca-framework/src/types.ts` (add InstallationStats type)
- `packages/luca-framework/src/utils/files.ts` (track and return stats)

**Verification:**

- `generateFiles` returns correct counts matching actual installed files
- `bunx --bun tsc --noEmit` passes

### 2. Enhance Context Detection for Tour

**Type:** auto
**TDD:** false
**Depends on:** none

Update `packages/luca-framework/src/utils/detect.ts` to provide richer context:

1. Add `suggestedFirstCommand` logic that varies by context:
   - If the project has a README but no `.planning/` yet: suggest `/lu "help me understand this codebase"`
   - If the project has existing source code: suggest `/lu "review the architecture"`
   - Default: `/lu`

2. Add `projectDescription` field to `ProjectContext`:
   - Read `description` from `package.json` if present
   - Used in tour step 1 for personalized guidance

3. Add `hasExistingSource` boolean:
   - True if `src/` or `app/` or `lib/` directory exists
   - Helps tour suggest context-aware first commands

**Files to create/edit:**

- `packages/luca-framework/src/types.ts` (extend ProjectContext)
- `packages/luca-framework/src/utils/detect.ts` (enhanced detection)

**Verification:**

- `detectProjectContext()` returns all new fields
- `suggestedFirstCommand` varies based on project state
- `bunx --bun tsc --noEmit` passes

### 3. Update Tour Steps with Dynamic Content

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Refactor `packages/luca-framework/src/utils/tour.ts` to use dynamic installation stats and enhanced context:

1. Update `runTour` signature to accept `InstallationStats` (optional, for backward compat)
2. Step 2 ("What Was Generated") should show actual counts:
   - "Installed 28 agents, 49 skills, 12 rules, 8 hooks into .claude/, .cursor/"
   - Instead of the current static description
3. Step 4 ("Your First Command") should use the enhanced `suggestedFirstCommand` from context detection
4. Add a Step 0 intro that personalizes based on `projectDescription` if available:
   - "Setting up Luca for [project description]..." vs generic intro

Update `packages/luca-framework/src/commands/init.ts` to pass `InstallationStats` to the tour.

**Files to create/edit:**

- `packages/luca-framework/src/utils/tour.ts` (dynamic content)
- `packages/luca-framework/src/commands/init.ts` (pass stats to tour)

**Verification:**

- Tour shows actual file counts instead of static text
- Tour shows context-aware first command suggestion
- `--no-tour` and `--quick` flags still skip the tour
- `bunx --bun tsc --noEmit` passes

## Verification

- `generateFiles` returns accurate installation stats
- `detectProjectContext` provides enhanced context fields
- Tour displays dynamic counts and personalized suggestions
- All existing init flows (interactive, quick, config-file) work unchanged
- `bunx --bun tsc --noEmit` passes

## Success Criteria

- Step 2 of the tour shows actual counts (e.g., "28 agents, 49 skills, 12 rules, 8 hooks")
- Step 4 suggests a context-aware first command based on project state
- The tour gracefully handles missing stats (backward compat with external callers)
- No regression in init command behavior

## Output Specification

- Updated `packages/luca-framework/src/types.ts` with `InstallationStats` and enhanced `ProjectContext`
- Updated `packages/luca-framework/src/utils/files.ts` with stats tracking
- Updated `packages/luca-framework/src/utils/detect.ts` with enhanced detection
- Updated `packages/luca-framework/src/utils/tour.ts` with dynamic content
- Updated `packages/luca-framework/src/commands/init.ts` to pass stats
