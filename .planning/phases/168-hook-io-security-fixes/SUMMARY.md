# Phase 168 Summary: Hook I/O & Security Fixes

## Outcome

All 10 audit findings resolved across 2 waves, 2 commits.

## Wave 1 — CRITICAL & HIGH (commit bc6390d0)

### Task 1: Fix emitResult followupMessage overwrite (HOOK-001/SEC-05)

- **hook-io.ts**: Changed `emitResult` to emit `followupMessage` as a separate `followup_message` key instead of overwriting `systemMessage`. Both keys now coexist when both are provided.
- **session-start.ts**: Replaced 2 manual `process.stdout.write(JSON.stringify({ followup_message }))` calls with `emitResult({ followupMessage })`.
- **context-monitor.ts**: Replaced manual `process.stdout.write` assembly with `emitResult({ systemMessage, hookSpecificOutput })` for both Claude and non-Claude branches.

### Task 2: Fix import ordering (HOOK-002)

- **session-start.ts**: Moved `runBridge`, `resolveVault`, `recallMuninnEngrams` imports above `SessionEndMarkerSchema` declaration.
- **pre-compact-checkpoint.ts**: Moved `runBridge`, `resolveVault`, `writeMuninnEngram` imports above `PreCompactInputSchema` declaration.
- **subagent-stop.ts**: Moved `resolveVault`, `writeMuninnEngram` imports above `SubagentStopInputSchema` declaration.

### Task 3: Replace require("fs") with ESM imports (HOOK-005/SEC-04)

- **hook-io.ts**: Added `import { readFileSync, writeFileSync } from "fs"` at top; replaced 2 inline `require("fs")` calls in `guardDedup()`.
- **session-start.ts**: Added `appendFileSync` to existing top-level `fs` import; removed inline `const { appendFileSync } = require("fs")` in Step 6.

## Wave 2 — MEDIUM & LOW (commit fe81a7bb)

### Task 4: Add loopback validation (SEC-01)

- **muninn-config.ts**: Added `ALLOWED_ORIGINS` array and `validateMuninnUrl()` function. `muninnFetch()` now rejects with descriptive error when `MUNINN_BASE_URL` is not a loopback address. Default `http://127.0.0.1:8476` passes validation.

### Task 5: Escape single quotes in env export (SEC-03)

- **session-start.ts**: Added `escapedRuntime` and `escapedPlanningDir` variables with `replace(/'/g, "'\\''")` POSIX-safe escaping. Used in template literals for env export lines.

### Task 6: Return parsed.data on success (SEC-02)

- **muninn-route-helper.ts**: `muninnProxyHandler` now returns `NextResponse.json(parsed.data)` when `responseSchema.safeParse` succeeds. Falls through to `NextResponse.json(data)` on parse failure (preserving existing behavior).

### Task 7: Add PostToolUseFailureInputSchema (SEC-08)

- **post-tool-use-failure.ts**: Added Zod schema with `tool_name`, `error_message`, `command` fields (all with defaults). Replaced `readStdinJson()` with `parseHookInput(PostToolUseFailureInputSchema)`. Removed manual `as string` casts.

### Task 8: Apply ContextMetricsSchema.safeParse (SEC-06)

- **zone-history/route.ts**: Added inline `ContextMetricsSchema` Zod schema. Applied `safeParse` to raw JSON before field access. Returns `emptyResponse` on validation failure. Removed manual `as string`/`as number` casts.

### Task 9: ANSI escape regex comment (SEC-07)

- **context-check-throttled.ts**: Added clarifying comment confirming that `\x0E-\x1F` range covers ESC (0x1B). Regex unchanged (was already correct).

### Task 10: PlatformHookConfig barrel export (ARCH-003)

- **hooks/index.ts**: Changed `PlatformHookConfig` type re-export source from `./__helpers/platform-adapters` to `./__schemas/hook.schemas` (canonical definition location).

## Verification Results

- `bunx --bun tsc --noEmit`: 0 errors (excluding stale dist/plugin/ artifact)
- `grep -r 'require(' src/hooks/`: 0 results
- `grep 'process.stdout.write' src/hooks/scripts/session-start.ts`: 0 results
- `grep 'process.stdout.write' src/hooks/scripts/context-monitor.ts`: 0 results
- All 10 audit items confirmed resolved

## Deviations

None. All tasks executed as specified in the plan.

## Files Modified

- `/Users/alecsibilia/Github/luca-framework/src/hooks/__helpers/hook-io.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/scripts/session-start.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/scripts/context-monitor.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/scripts/pre-compact-checkpoint.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/scripts/subagent-stop.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/scripts/post-tool-use-failure.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/scripts/context-check-throttled.ts`
- `/Users/alecsibilia/Github/luca-framework/src/hooks/index.ts`
- `/Users/alecsibilia/Github/luca-framework/packages/luca-observer/lib/muninn-config.ts`
- `/Users/alecsibilia/Github/luca-framework/packages/luca-observer/lib/muninn-route-helper.ts`
- `/Users/alecsibilia/Github/luca-framework/packages/luca-observer/app/api/muninn/zone-history/route.ts`
