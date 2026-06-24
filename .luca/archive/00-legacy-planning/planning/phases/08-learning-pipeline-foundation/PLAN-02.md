---
phase: 08
plan: 02
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 08 Plan 02: Portable Cognitive Profiles (Cross-Project Memory)

## Objective

Enable transferable learnings across projects via `~/.luca/global-memory.json`. Patterns and preferences that are portable (not project-specific) can be exported from one project and imported into another, creating cross-project learning. Auto-loaded by lu-cognition during pre-flight so that new projects benefit from accumulated knowledge immediately.

This builds on the existing `cognitive-profile.ts` module which already has `exportCognitiveProfile` and `importCognitiveProfile` functions. The work here extends those foundations with: a `source_project` field for provenance tracking, dedicated export/import skills for user-facing workflows, cross-project deduplication in the compression engine, and lu-cognition integration for automatic global profile loading.

## Context

@src/memory/**helpers/cognitive-profile.ts
@src/memory/**schemas/memory.schemas.ts
@src/memory/\_\_helpers/compression.ts
@src/memory/index.ts
@src/agents/general/lu-cognition.agent.ts
@src/skills/general/phase-execute.skill.ts

## Tasks

### 1. Add source_project Field to Memory Entry Schema

**Type:** auto
**TDD:** false
**Depends on:** none

Add a `source_project` field to `memoryEntrySchema` for provenance tracking. This field records which project originally produced a memory entry, enabling cross-project deduplication and filtering.

**Details:**

1. In `src/memory/__schemas/memory.schemas.ts`, add to `memoryEntrySchema`:
   - `source_project: z.string().optional()` - the project that originally created this entry. Undefined means it was created in the current project. When imported from another project, set to the source project's name.

2. This field does not change existing behavior -- it is purely additive. Existing entries without `source_project` are treated as local entries.

**Files to create/edit:**

- `src/memory/__schemas/memory.schemas.ts`

**Verification:**

- Schema still parses existing entries (field is optional)
- New entries with source_project parse correctly
- `bunx --bun tsc --noEmit` passes

### 2. Enhance Cognitive Profile Export with Category Filtering

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend the existing `exportCognitiveProfile` function with configurable category filtering. The default behavior already filters to high-confidence patterns and decisions. Add explicit support for the portability classification: patterns and preferences are portable; decisions are project-specific by default but can be explicitly marked portable.

**Details:**

1. In `src/memory/__helpers/cognitive-profile.ts`:
   - Add `ExportOptionsSchema` with configurable category filters:
     - `portable_categories`: default `["pattern", "preference"]` -- always portable
     - `include_decisions`: default `false` -- decisions are project-specific by default
     - `include_pitfalls`: default `true` -- pitfalls are generally portable
     - `min_confidence`: default `"medium"` -- minimum confidence for export
   - Update `exportCognitiveProfile` to accept optional `ExportOptions` parameter
   - Set `source_project` field on all exported entries to the brain's `project_name`
   - Add `exportToGlobalMemory(brain, entries, options?)` function that writes to `~/.luca/global-memory.json`:
     - Creates `~/.luca/` directory if it does not exist
     - If global memory file exists, merges (deduplicates by ID and title)
     - If global memory file does not exist, creates it with the exported profile

**Files to create/edit:**

- `src/memory/__helpers/cognitive-profile.ts`

**Verification:**

- Default export includes patterns, preferences, and pitfalls with medium+ confidence
- Decisions are excluded by default
- source_project is set on all exported entries
- Global memory file is created/merged correctly
- `bunx --bun tsc --noEmit` passes

### 3. Enhance Cognitive Profile Import with Cross-Project Dedup

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend the existing `importCognitiveProfile` function and add a dedicated global memory loader. Also enhance the compression engine with cross-project deduplication awareness.

**Details:**

1. In `src/memory/__helpers/cognitive-profile.ts`:
   - Add `loadGlobalMemory()` function:
     - Reads `~/.luca/global-memory.json` if it exists
     - Parses with `CognitiveProfileSchema.safeParse()`
     - Returns `CognitiveProfile | null` (null if file missing or invalid)
   - Add `mergeGlobalEntries(globalEntries, localEntries)` function:
     - Deduplicates by ID and normalized title (case-insensitive)
     - Preserves local entries over global ones (local takes precedence)
     - Tags imported entries with their `source_project`
     - Returns merged array and import summary

2. In `src/memory/__helpers/compression.ts`:
   - Enhance `detectDuplicates()` to consider `source_project` field
   - When two entries have the same normalized title but different `source_project` values, prefer the local entry (no `source_project`) over the imported one
   - This prevents global imports from accumulating duplicate entries

**Files to create/edit:**

- `src/memory/__helpers/cognitive-profile.ts`
- `src/memory/__helpers/compression.ts`

**Verification:**

- Global memory file loads correctly when present
- Returns null gracefully when file is missing
- Deduplication prefers local entries over imported entries
- Cross-project duplicates are detected in compression
- `bunx --bun tsc --noEmit` passes

### 4. Integrate Global Profile Loading into lu-cognition Agent

**Type:** auto
**TDD:** false
**Depends on:** 3

Update the lu-cognition agent definition to include global memory loading as part of cognitive pre-flight. During pre-flight, lu-cognition will check for `~/.luca/global-memory.json` and merge relevant entries into the session context.

**Details:**

1. In `src/agents/general/lu-cognition.agent.ts`:
   - Add a new step in the pre-flight sequence (after loading MEMORY.md, before initializing WORKING.md):
     - "Step 2.5: Load Global Memory Profile"
     - Shell command: `GLOBAL_PROFILE=$(bun run src/memory/__helpers/bridge.ts read-global-memory 2>/dev/null || echo 'null')`
     - If global profile exists, merge relevant entries into the session context
     - Log how many global entries were loaded
   - Add guidance on how global entries appear in memory recall: entries with `source_project` set are tagged as "[from: project-name]" in recall output

2. In `src/memory/__helpers/bridge.ts`:
   - Add `handleReadGlobalMemory()` handler:
     - Calls `loadGlobalMemory()` from cognitive-profile
     - Returns JSON summary: entry count, source projects, domain tags
   - Register in bridge CLI dispatch

**Files to create/edit:**

- `src/agents/general/lu-cognition.agent.ts`
- `src/memory/__helpers/bridge.ts`

**Verification:**

- lu-cognition agent definition includes global memory loading step
- Bridge command returns valid JSON
- Missing global memory file returns graceful null response
- `bunx --bun tsc --noEmit` passes

### 5. Create Profile Export and Import Skills

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Create two new skills for user-facing profile export and import workflows. These allow users to explicitly manage cross-project knowledge transfer.

**Details:**

1. Create `src/skills/general/profile-export.skill.ts`:
   - Skill name: `profile-export`
   - Description: "Export portable learnings from this project to the global memory profile"
   - Arguments: `[--include-decisions] [--min-confidence=medium]`
   - Process:
     a. Read BRAIN.md and MEMORY.md
     b. Call `exportToGlobalMemory()` with options from arguments
     c. Report how many entries were exported and from which categories
   - Model routing: uses fast model (simple I/O operation)

2. Create `src/skills/general/profile-import.skill.ts`:
   - Skill name: `profile-import`
   - Description: "Import learnings from the global memory profile into this project"
   - Arguments: `[--from=project-name] [--dry-run]`
   - Process:
     a. Load global memory profile
     b. Filter by source project if `--from` specified
     c. If `--dry-run`, show what would be imported without writing
     d. Otherwise, merge into local MEMORY.md
     e. Report import summary
   - Model routing: uses fast model (simple I/O operation)

**Files to create/edit:**

- `src/skills/general/profile-export.skill.ts`
- `src/skills/general/profile-import.skill.ts`

**Verification:**

- Both skills follow existing skill creation patterns (using `createSkill`)
- Skill frontmatter is complete
- Arguments are documented
- `bunx --bun tsc --noEmit` passes

### 6. Update Barrel Exports and Build

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5

Ensure all new functions, schemas, types, and skills are properly exported and generated files are rebuilt.

**Details:**

1. Verify `src/memory/index.ts` exports new items:
   - `ExportOptionsSchema` and `ExportOptions` type
   - `exportToGlobalMemory`, `loadGlobalMemory`, `mergeGlobalEntries`

2. Verify the skill registry picks up the new skills (skill auto-discovery via `build-skill-registry.ts`).

3. Run `bun run build:all` to regenerate `.claude/`, `.cursor/`, `.pi/` outputs.

4. Run `bun run check:drift` to verify no drift.

**Files to create/edit:**

- `src/memory/index.ts`

**Verification:**

- All new exports are accessible via `~/memory`
- New skills appear in generated output
- `bunx --bun tsc --noEmit` passes
- `bun run build:all` completes
- `bun run check:drift` shows no drift

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. `bun run build:all` completes successfully
3. `bun run check:drift` shows no drift between source and generated files
4. `source_project` field on memory entries is optional and backward-compatible
5. Export produces valid global memory file at `~/.luca/global-memory.json`
6. Import deduplicates correctly (by ID and normalized title)
7. lu-cognition pre-flight includes global memory loading step
8. Profile export and import skills follow existing patterns

## Success Criteria

- Learnings can be exported from Project A and imported into Project B
- Category filtering ensures only portable knowledge transfers (patterns, preferences, pitfalls by default; decisions opt-in)
- Cross-project deduplication prevents entry accumulation
- lu-cognition automatically loads global memory during pre-flight
- User-facing skills (`/profile-export`, `/profile-import`) provide explicit control
- No regressions in existing cognitive profile, compression, or memory parsing functionality

## Output Specification

- Updated `src/memory/__schemas/memory.schemas.ts` with `source_project` field
- Updated `src/memory/__helpers/cognitive-profile.ts` with export options, global memory I/O, and merge logic
- Updated `src/memory/__helpers/compression.ts` with cross-project dedup awareness
- Updated `src/agents/general/lu-cognition.agent.ts` with global memory loading step
- Updated `src/memory/__helpers/bridge.ts` with `read-global-memory` command
- New `src/skills/general/profile-export.skill.ts`
- New `src/skills/general/profile-import.skill.ts`
- Updated `src/memory/index.ts` with new exports
- Rebuilt generated files via `bun run build:all`
