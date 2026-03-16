---
phase: 171
plan: 2
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 171 Plan 2: Fix context-monitor hookSpecificOutput for Stop Hooks

## Objective

Remove `hookSpecificOutput` from both `emitResult()` calls in `src/hooks/scripts/context-monitor.ts`. The Stop event does not support `hookSpecificOutput` in its JSON output schema — Claude Code validates the output and rejects payloads containing unknown keys for Stop hooks. This causes a JSON validation error at runtime.

The context breakdown data (`state_bytes`, `state_json_bytes`, `total_bytes`) is not consumed by anything downstream — it was diagnostic info that is already embedded in the `systemMessage` / `followupMessage` text. Removing it loses nothing.

## Context

@src/hooks/scripts/context-monitor.ts (lines 164-187: the two emitResult calls)
@src/hooks/__helpers/hook-io.ts (the emitResult function and HookResult interface — for reference)

## Tasks

### 1. Remove hookSpecificOutput from Claude emitResult call
**Type:** auto
**TDD:** false
**Depends on:** none

In `src/hooks/scripts/context-monitor.ts`, lines 166-175, replace the Claude Code branch:

```typescript
if (isClaude()) {
    emitResult({
      systemMessage: text,
      hookSpecificOutput: {
        context_breakdown: {
          state_bytes: stateSize,
          state_json_bytes: stateJsonSize,
          total_bytes: totalBytes,
        },
      },
    });
```

With:

```typescript
if (isClaude()) {
    emitResult({
      systemMessage: text,
    });
```

### 2. Remove hookSpecificOutput from Cursor emitResult call
**Type:** auto
**TDD:** false
**Depends on:** none

In `src/hooks/scripts/context-monitor.ts`, lines 176-187, replace the Cursor branch:

```typescript
  } else {
    emitResult({
      followupMessage: text,
      hookSpecificOutput: {
        context_breakdown: {
          state_bytes: stateSize,
          state_json_bytes: stateJsonSize,
          total_bytes: totalBytes,
        },
      },
    });
  }
```

With:

```typescript
  } else {
    emitResult({
      followupMessage: text,
    });
  }
```

### 3. Remove unused size variables
**Type:** auto
**TDD:** false
**Depends on:** 1, 2

After removing both `hookSpecificOutput` blocks, the variables `stateSize`, `stateJsonSize`, `totalBytes`, and the associated `existsSync`/`statSync` blocks (lines 145-161) are no longer referenced. Remove them entirely to keep the code clean.

Remove lines 144-161 (the "Context file size breakdown" section):
```typescript
  // --- Context file size breakdown ---
  let stateSize = 0;
  let stateJsonSize = 0;
  const stateMdPath = `${pd}/.planning/STATE.md`;
  const stateJsonPath = `${pd}/.planning/state.json`;

  try {
    if (existsSync(stateMdPath)) stateSize = statSync(stateMdPath).size;
  } catch {
    /* skip */
  }
  try {
    if (existsSync(stateJsonPath)) stateJsonSize = statSync(stateJsonPath).size;
  } catch {
    /* skip */
  }

  const totalBytes = stateSize + stateJsonSize;
```

Also check whether `statSync` is still used elsewhere in the file. If not, remove it from the import on line 12:
```typescript
import { existsSync, statSync, realpathSync } from "fs";
```

Note: `existsSync` is still used for `metricsFile` and `validTranscriptPath` checks. `realpathSync` is used for transcript path validation. But `statSync` is used both in the removed block AND in the transcript fallback (line 113). So `statSync` must stay in the import.

**Files to create/edit:**
- `src/hooks/scripts/context-monitor.ts` — remove context breakdown section and hookSpecificOutput from both emitResult calls

**Verification:**
- `statSync` import remains (still used in transcript fallback at line 113)
- The "Context file size breakdown" block is removed
- Both `emitResult()` calls emit only `systemMessage` or `followupMessage` — no `hookSpecificOutput`

## Verification

1. Run `bunx --bun tsc --noEmit` to verify TypeScript compiles
2. Read the modified `context-monitor.ts` and confirm:
   - No `hookSpecificOutput` appears in any `emitResult()` call
   - The context breakdown variables are removed
   - The core logic (statusline metrics check, transcript fallback, level/msg assignment) is unchanged
   - Both Claude and Cursor branches still emit appropriate messages

## Success Criteria

- `hookSpecificOutput` does not appear in `context-monitor.ts`
- The unused `stateSize`, `stateJsonSize`, `totalBytes` variables are removed
- The context-monitor hook emits only `systemMessage` (Claude) or `followupMessage` (Cursor)
- TypeScript compiles without errors

## Output Specification

- Modified file: `src/hooks/scripts/context-monitor.ts`
