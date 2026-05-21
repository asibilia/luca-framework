---
phase: 09
plan: 06
type: improvement
autonomous: true
wave: 3
depends_on: ["PLAN-01"]
---

# Phase 09 Plan 06: Migrate State Machine and Context Domain

## Objective

Update the state machine files (suspend/resume checkpoint, bridge, snapshot) and context domain files to remove WORKING.md dependencies and update memory-related comments. The state machine suspend/resume is particularly critical -- it currently reads WORKING.md content directly for checkpoint snapshots, and this must be converted to reference MuninnDB session context.

## Context

@packages/luca-framework/src/state/bridge.ts
@packages/luca-framework/src/state/machine.ts
@packages/luca-framework/src/state/snapshot.ts
@packages/luca-framework/src/state/types.ts
@packages/luca-framework/src/state/suspend-checkpoint.ts
@src/context/**schemas/context.schemas.ts
@src/context/**helpers/defaults.ts
@src/shared/\_\_helpers/cli-utils.ts
@.planning/phases/09-muninn-memory-migration/CONTEXT.md
@.planning/phases/09-muninn-memory-migration/09-RESEARCH.md (pitfall 4)

## Tasks

### 1. Update state machine suspend-checkpoint

**Type:** auto
**TDD:** false
**Depends on:** none

Update `packages/luca-framework/src/state/suspend-checkpoint.ts` to remove WORKING.md content from checkpoints. This is the most critical state machine change (Pitfall 4).

**Changes required:**

1. **Update `working_memory_snapshot` field** (line 24) -- This field previously stored WORKING.md content. Change semantics:
   - Option A: Remove the field entirely (session context lives in MuninnDB, not in checkpoints)
   - Option B: Keep the field but document it as "MuninnDB session snapshot reference" rather than WORKING.md content
   - **Choose Option A:** Remove `working_memory_snapshot`. MuninnDB session context persists independently via `muninn_session` and `muninn_where_left_off`. Checkpoints no longer need to snapshot working memory.
2. **Update `saveSuspendCheckpoint`** (line 33-34) -- Remove the code that reads WORKING.md content
3. **Update `loadSuspendCheckpoint`** -- Remove code that restores WORKING.md content

**Files to create/edit:**

- `packages/luca-framework/src/state/suspend-checkpoint.ts`

**Verification:**

- No references to `WORKING.md` or file-based working memory in checkpoint code
- `bunx --bun tsc --noEmit` passes

### 2. Update state machine bridge

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `packages/luca-framework/src/state/bridge.ts` to remove WORKING.md snapshot for suspend/resume.

**Changes required:**

1. **`memory_tags` in allowlist** (line 484) -- KEEP. The field still exists in agent schemas.
2. **WORKING.md snapshot for suspend** (lines 962-978) -- Remove the code that reads WORKING.md content when suspending a phase. Suspend no longer captures working memory file content.
3. **WORKING.md restoration for resume** (lines 1128-1129) -- Remove code that restores WORKING.md from checkpoint.
4. **Update comments** referencing BRAIN.md/MEMORY.md/WORKING.md operations.

**Files to create/edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `memory_tags` still in allowlist
- No WORKING.md read/write operations in suspend/resume code
- `bunx --bun tsc --noEmit` passes

### 3. Update state machine types and comments

**Type:** auto
**TDD:** false
**Depends on:** none

Update comment-level references in state machine files:

**machine.ts (line 10):**

- Old: "BRAIN.md, MEMORY.md recall"
- New: "MuninnDB recall"

**snapshot.ts (lines 337-338):**

- `memory_tags` rendering in STATE.md snapshot -- keep, update comment

**types.ts (lines 140, 177, 179):**

- `memory_tags` field definition -- keep field, update comment from "MEMORY.md recall filtering" to "MuninnDB recall context"

**Files to create/edit:**

- `packages/luca-framework/src/state/machine.ts`
- `packages/luca-framework/src/state/snapshot.ts`
- `packages/luca-framework/src/state/types.ts`

**Verification:**

- No references to BRAIN.md/MEMORY.md/WORKING.md as operational data sources
- `memory_tags` field and rendering preserved
- `bunx --bun tsc --noEmit` passes

### 4. Update context domain schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/context/__schemas/context.schemas.ts` comments and field documentation.

**Changes required (lines 6, 108-119):**

1. Update comment "BRAIN.md summary" to "Brain identity from MuninnDB"
2. Update field comments for `memory_entries`, `working_content`, `brain_summary`, `brain_full`, `memory_full`
3. Keep the schema fields themselves -- they describe context document slots that are still valid (agents still receive brain/memory content, just sourced from MuninnDB instead of files)

**Files to create/edit:**

- `src/context/__schemas/context.schemas.ts`

**Verification:**

- Comments reference MuninnDB as data source
- Schema structure unchanged
- `bunx --bun tsc --noEmit` passes

### 5. Update context domain defaults

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/context/__helpers/defaults.ts` comments referencing MEMORY.md/BRAIN.md.

**Changes required (lines 25-27, 36, 43, 60, 75, 78, 85):**

- Update tier-to-document mapping comments from "BRAIN.md" to "MuninnDB brain tree"
- Update "MEMORY.md" references to "MuninnDB recalled engrams"
- Keep the actual tier/document mapping logic -- it still maps context tiers to document inclusion

**Files to create/edit:**

- `src/context/__helpers/defaults.ts`

**Verification:**

- Comments reference MuninnDB
- Logic unchanged
- `bunx --bun tsc --noEmit` passes

### 6. Update shared domain CLI utils comment

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/shared/__helpers/cli-utils.ts` line 5 to remove reference to `memory/bridge.ts`.

**Files to create/edit:**

- `src/shared/__helpers/cli-utils.ts`

**Verification:**

- No reference to `memory/bridge.ts` remains
- `bunx --bun tsc --noEmit` passes

## Verification

1. State machine suspend/resume no longer reads/writes WORKING.md
2. `working_memory_snapshot` field removed or updated in checkpoint schema
3. `memory_tags` preserved in bridge allowlist, types, and snapshot rendering
4. All BRAIN.md/MEMORY.md/WORKING.md comments updated to reference MuninnDB
5. Context domain schema fields preserved with updated documentation
6. `bunx --bun tsc --noEmit` passes
7. `bun run build:all` succeeds

## Success Criteria

- Phase suspend/resume works without WORKING.md (checkpoint no longer captures file content)
- Context domain correctly documents MuninnDB as data source
- State machine types preserve `memory_tags` field with updated semantics
- No operational references to deleted memory files in state machine or context domain

## Output Specification

**Files modified:**

- `packages/luca-framework/src/state/suspend-checkpoint.ts`
- `packages/luca-framework/src/state/bridge.ts`
- `packages/luca-framework/src/state/machine.ts`
- `packages/luca-framework/src/state/snapshot.ts`
- `packages/luca-framework/src/state/types.ts`
- `src/context/__schemas/context.schemas.ts`
- `src/context/__helpers/defaults.ts`
- `src/shared/__helpers/cli-utils.ts`
