---
phase: 09
plan: 01
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 09 Plan 01: Delete src/memory/ Domain and Clean Root References

## Objective

Remove the entire `src/memory/` domain (25 files, ~60 exports) and clean all structural references to the memory domain from build scripts, domain boundary checkers, and tier maps. This is the foundation for all subsequent plans -- once the domain is deleted, consumers must migrate to MuninnDB.

No TypeScript import dependencies exist from other domains into `~/memory` (confirmed by research), so deletion will not cause `tsc` errors. Runtime breakage in agent/skill prompt text is expected and addressed in Plans 03-04.

## Context

@src/memory/index.ts
@src/memory/**schemas/memory.schemas.ts
@src/memory/**helpers/bridge.ts
@scripts/check-domain-boundaries.ts
@scripts/build-shared.ts
@.planning/phases/09-muninn-memory-migration/09-RESEARCH.md
@.planning/phases/09-muninn-memory-migration/CONTEXT.md

## Tasks

### 1. Delete the entire src/memory/ directory

**Type:** auto
**TDD:** false
**Depends on:** none

Delete all 25 files in `src/memory/`:

- `src/memory/__schemas/memory.schemas.ts`
- `src/memory/__helpers/` (23 files: auto-compaction, brain-parser, brain-serializer, bridge, cognitive-profile, compression, context-monitor, context-pruning, json-persistence, memory-parser, memory-serializer, meta-cognition, milestone-recall, procedure-lifecycle, procedure-parser, procedure-recall, procedure-replay, quality-scorer, quality-trend, semantic-search, suspend-checkpoint, token-estimator, working-memory)
- `src/memory/index.ts`

Use `rm -rf src/memory/` to remove the entire directory.

**Verification:**

- `ls src/memory/` returns "No such file or directory"
- `bunx --bun tsc --noEmit` still passes (no other domain imports from `~/memory`)

### 2. Remove memory from domain boundary checker

**Type:** auto
**TDD:** false
**Depends on:** 1

Edit `scripts/check-domain-boundaries.ts` to remove `memory: 1` from the tier map. Without this, the boundary checker will error on missing domain directory.

**Files to create/edit:**

- `scripts/check-domain-boundaries.ts` -- remove `memory: 1` entry from tier map

**Verification:**

- `bun run scripts/check-domain-boundaries.ts` runs without "domain directory not found" error
- No reference to `memory` remains in the tier map

### 3. Remove luca-memory.ts from Pi extension build list

**Type:** auto
**TDD:** false
**Depends on:** 1

Edit `scripts/build-shared.ts` to remove `"luca-memory.ts"` from the `PI_EXTENSION_FILES` array. Without this removal, the build will fail trying to copy a deleted file.

**Files to create/edit:**

- `scripts/build-shared.ts` -- remove `"luca-memory.ts"` from `PI_EXTENSION_FILES`

**Verification:**

- `bun run build:all` does not fail on missing luca-memory.ts
- grep for `luca-memory` in `scripts/build-shared.ts` returns no matches

### 4. Delete Pi extension luca-memory.ts

**Type:** auto
**TDD:** false
**Depends on:** 3

Delete the Pi extension file `src/hooks/pi-extensions/luca-memory.ts` (470 lines). This file provided Pi IDE tools for reading BRAIN.md, MEMORY.md, WORKING.md and is now fully replaced by MuninnDB MCP.

**Files to create/edit:**

- `src/hooks/pi-extensions/luca-memory.ts` -- DELETE

**Verification:**

- File no longer exists
- No references to `luca-memory` in build configuration

### 5. Verify clean build

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Run full typecheck to confirm no compilation errors from the deletion.

```bash
bunx --bun tsc --noEmit
```

**Verification:**

- TypeScript compilation succeeds with zero errors
- No orphaned imports referencing `~/memory`

## Verification

1. `src/memory/` directory does not exist
2. `src/hooks/pi-extensions/luca-memory.ts` does not exist
3. `bunx --bun tsc --noEmit` passes
4. `bun run scripts/check-domain-boundaries.ts` passes (no memory in tier map)
5. `scripts/build-shared.ts` has no reference to `luca-memory.ts`

## Success Criteria

- The `src/memory/` domain is completely removed (25 files, ~60 exports gone)
- All build scripts and boundary checkers updated to reflect the removal
- TypeScript compilation passes cleanly
- No structural references to the memory domain remain in build/check infrastructure

## Output Specification

**Files deleted:**

- `src/memory/__schemas/memory.schemas.ts`
- `src/memory/__helpers/*.ts` (23 files)
- `src/memory/index.ts`
- `src/hooks/pi-extensions/luca-memory.ts`

**Files modified:**

- `scripts/check-domain-boundaries.ts`
- `scripts/build-shared.ts`
