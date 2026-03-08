---
phase: 09
plan: 05
type: improvement
autonomous: true
wave: 3
depends_on: ["PLAN-01"]
---

# Phase 09 Plan 05: Migrate Hook Scripts and Pi Extensions

## Objective

Update the 3 hook shell scripts and 4 Pi extension files that reference the memory bridge CLI, BRAIN.md, MEMORY.md, or WORKING.md. These are the runtime-critical files that would silently fail after `src/memory/` deletion because they use `2>/dev/null || true` fallback patterns.

Hook scripts run automatically on session events (start, persist, context-monitor) and must be updated to either use MuninnDB MCP or remove memory-specific behavior entirely.

## Context

@src/hooks/scripts/session-start.sh
@src/hooks/scripts/session-persist.sh
@src/hooks/scripts/context-monitor.sh
@src/hooks/pi-extensions/**helpers/session-init.ts
@src/hooks/pi-extensions/luca-state.ts
@src/hooks/pi-extensions/**helpers/luca-constants.ts
@src/hooks/pi-extensions/luca-commands.ts
@.planning/phases/09-muninn-memory-migration/CONTEXT.md
@.planning/phases/09-muninn-memory-migration/09-RESEARCH.md (pitfalls 1, 5, 7)

## Tasks

### 1. Update session-start.sh hook

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/hooks/scripts/session-start.sh` to remove file-based memory initialization.

**Changes required:**

1. **Remove `run_memory_bridge()` function** (lines 49-54) -- This function called `bun run src/memory/__helpers/bridge.ts ensure-init`. With memory domain deleted, this is dead code.
2. **Remove Step 6b** that calls `run_memory_bridge ensure-init` -- The bridge no longer exists.
3. **Remove or simplify BRAIN.md auto-detection** (lines 289-404) -- This step auto-detected project info and created BRAIN.md. Two options:
   - Option A (recommended): Remove entirely. Users run `/seed-memory` to populate MuninnDB.
   - Option B: Convert to a MuninnDB session initialization using `mcp__muninn__muninn_session`. However, hooks are shell scripts and cannot call MCP tools directly, so this is impractical.
   - **Choose Option A:** Remove the BRAIN.md auto-detection block. Session start focuses on state machine init, planning dir setup, and session ID generation.
4. **Remove comments** referencing memory bridge or BRAIN.md/MEMORY.md/WORKING.md.

**Files to create/edit:**

- `src/hooks/scripts/session-start.sh`

**Verification:**

- `grep -n "memory\|bridge.ts\|BRAIN.md\|MEMORY.md\|WORKING.md" src/hooks/scripts/session-start.sh` returns zero matches (or only contextual comments about MuninnDB)
- Script syntax is valid: `bash -n src/hooks/scripts/session-start.sh`

### 2. Update session-persist.sh hook

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/hooks/scripts/session-persist.sh` to remove WORKING.md interactions.

**Changes required (addressing Pitfall 7):**

1. **Remove WORKING.md existence checks** (line 22) -- No longer checking if WORKING.md exists
2. **Remove session-end footer appending** (lines 87-120) -- Previously appended timestamps and session context to WORKING.md on session end
3. **Replace with no-op or comment** -- Session end tracking now handled by MuninnDB's `muninn_session` which tracks session lifecycle natively. Since hooks cannot call MCP tools directly, simply remove the WORKING.md operations. Session context persists in MuninnDB automatically.

**Files to create/edit:**

- `src/hooks/scripts/session-persist.sh`

**Verification:**

- `grep -n "WORKING.md\|working_memory\|bridge.ts" src/hooks/scripts/session-persist.sh` returns zero matches
- Script syntax is valid: `bash -n src/hooks/scripts/session-persist.sh`

### 3. Update context-monitor.sh hook

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/hooks/scripts/context-monitor.sh` to remove WORKING.md size checking.

**Changes required (addressing Pitfall 5):**

1. **Remove WORKING.md size checks** (lines 32-35) -- Previously used WORKING.md file size as a proxy for context usage
2. **Remove `append-working` bridge call** (line 218) -- Appended context snapshots to WORKING.md
3. **Remove memory bridge reference** (line 209-222) -- The entire memory bridge interaction block
4. **Keep transcript-based monitoring** -- The primary context monitoring signal (Claude transcript size) remains. WORKING.md size was a secondary signal that is now removed.

**Files to create/edit:**

- `src/hooks/scripts/context-monitor.sh`

**Verification:**

- `grep -n "WORKING.md\|bridge.ts\|append-working" src/hooks/scripts/context-monitor.sh` returns zero matches
- Script syntax is valid: `bash -n src/hooks/scripts/context-monitor.sh`

### 4. Update Pi extension session-init.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/hooks/pi-extensions/__helpers/session-init.ts` to remove memory file creation.

**Changes required:**

1. **Remove memory file creation** from `ensurePlanningDir()` function (lines 35, 47, 89) -- Previously created BRAIN.md, MEMORY.md, WORKING.md in `.planning/`
2. **Remove `memory_recall: true` and `working_memory: true`** from session context (lines 277-278, 663-664) -- These flags indicated file-based memory availability
3. **Keep planning directory creation** -- Still needed for STATE.md, ROADMAP.md, config.json, etc.

**Files to create/edit:**

- `src/hooks/pi-extensions/__helpers/session-init.ts`

**Verification:**

- `grep -n "BRAIN.md\|MEMORY.md\|WORKING.md\|memory_recall\|working_memory" src/hooks/pi-extensions/__helpers/session-init.ts` returns zero matches
- `bunx --bun tsc --noEmit` passes

### 5. Update Pi extension luca-state.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/hooks/pi-extensions/luca-state.ts` to remove memory status display.

**Changes required:**

1. **Remove MEMORY.md existence check** (line 36) -- Previously checked if MEMORY.md existed for status display
2. **Remove memory segment from status bar** (lines 232-267) -- Previously showed memory file status (entries count, last updated)

**Files to create/edit:**

- `src/hooks/pi-extensions/luca-state.ts`

**Verification:**

- `grep -n "MEMORY.md\|memory_entries\|memory.*status" src/hooks/pi-extensions/luca-state.ts` returns zero matches
- `bunx --bun tsc --noEmit` passes

### 6. Update Pi extension luca-commands.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/hooks/pi-extensions/luca-commands.ts` to remove memory-related command descriptions.

**Changes required:**

1. **Update status command description** (lines 10, 91) -- Remove "memory indicators" from the description

**Files to create/edit:**

- `src/hooks/pi-extensions/luca-commands.ts`

**Verification:**

- No "memory indicators" text remains
- `bunx --bun tsc --noEmit` passes

### 7. Verify all hooks compile and have valid syntax

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6

Run comprehensive verification:

```bash
# Shell script syntax check
bash -n src/hooks/scripts/session-start.sh
bash -n src/hooks/scripts/session-persist.sh
bash -n src/hooks/scripts/context-monitor.sh

# TypeScript compilation
bunx --bun tsc --noEmit

# Verify no remaining memory references
grep -rn "bridge.ts\|BRAIN.md\|MEMORY.md\|WORKING.md" src/hooks/
```

**Verification:**

- All shell scripts pass syntax check
- TypeScript compilation passes
- No memory file references remain in hooks directory

## Verification

1. All 3 shell scripts have valid bash syntax after modifications
2. Zero references to `bridge.ts`, `BRAIN.md`, `MEMORY.md`, `WORKING.md` as file operations in hook scripts
3. Pi extensions compile without errors
4. Session-start no longer attempts BRAIN.md auto-detection
5. Session-persist no longer appends to WORKING.md
6. Context-monitor no longer checks WORKING.md file size
7. `bunx --bun tsc --noEmit` passes
8. `bun run build:all` succeeds

## Success Criteria

- Hook scripts gracefully handle the absence of memory files
- No silent failures from missing bridge.ts calls
- Session lifecycle events no longer depend on file-based memory
- Pi extensions updated to remove memory status indicators

## Output Specification

**Files modified:**

- `src/hooks/scripts/session-start.sh`
- `src/hooks/scripts/session-persist.sh`
- `src/hooks/scripts/context-monitor.sh`
- `src/hooks/pi-extensions/__helpers/session-init.ts`
- `src/hooks/pi-extensions/luca-state.ts`
- `src/hooks/pi-extensions/luca-commands.ts`
