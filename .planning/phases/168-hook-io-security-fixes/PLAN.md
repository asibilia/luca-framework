---
phase: 168
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 168 Plan 1: Hook I/O & Security Fixes

## Objective

Fix 10 correctness and security findings identified in the v4.5.0 post-consolidation audit. Covers: the `emitResult` overwrite bug (HOOK-001/SEC-05), misplaced import statements (HOOK-002), inline `require("fs")` calls (HOOK-005/SEC-04), missing loopback validation in the observer (SEC-01), single-quote injection in env export (SEC-03), raw proxy data leak (SEC-02), missing Zod schema on post-tool-use-failure (SEC-08), missing safeParse in zone-history route (SEC-06), ANSI escape bypass in the sanitizer (SEC-07), and a stale barrel re-export for `PlatformHookConfig` (ARCH-003).

Delivered in two waves: Wave 1 fixes the CRITICAL and HIGH items (emitResult, import ordering, require→ESM); Wave 2 fixes MEDIUM and LOW items (security hardening + architecture).

## Context

- @src/hooks/\_\_helpers/hook-io.ts
- @src/hooks/scripts/session-start.ts
- @src/hooks/scripts/context-monitor.ts
- @src/hooks/scripts/pre-compact-checkpoint.ts
- @src/hooks/scripts/subagent-stop.ts
- @src/hooks/scripts/post-tool-use-failure.ts
- @src/hooks/scripts/context-check-throttled.ts
- @src/hooks/index.ts
- @packages/luca-observer/lib/muninn-config.ts
- @packages/luca-observer/lib/muninn-route-helper.ts
- @packages/luca-observer/app/api/muninn/zone-history/route.ts

---

## Wave 1 — CRITICAL & HIGH fixes

### Task 1: Fix emitResult followupMessage overwrite (HOOK-001/SEC-05)

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/hooks/__helpers/hook-io.ts` the `emitResult` function has this block:

```typescript
if (result.followupMessage) {
  output.systemMessage = result.followupMessage; // BUG: overwrites systemMessage
}
```

When both `systemMessage` and `followupMessage` are set the `systemMessage` value is silently dropped. Fix by emitting `followupMessage` under its own `followup_message` key instead of overwriting `systemMessage`.

After fixing `emitResult`, audit `session-start.ts` and `context-monitor.ts` for any remaining manual `process.stdout.write` calls that hand-roll the `followup_message` JSON shape. These callers bypass `emitResult` entirely and should be migrated to use `emitResult({ followupMessage })` so all Cursor-platform output flows through the single emission point.

Current manual patterns in `session-start.ts` (lines 552, 559):

```typescript
process.stdout.write(JSON.stringify({ followup_message: msgText }));
```

These should become `emitResult({ followupMessage: msgText })`.

Current pattern in `context-monitor.ts` (lines 165-173): assembles output manually then calls `process.stdout.write(JSON.stringify(output))`. This should be refactored to use `emitResult` with both `systemMessage` and `hookSpecificOutput` (for `context_breakdown`).

**Files to create/edit:**

- `src/hooks/__helpers/hook-io.ts`
- `src/hooks/scripts/session-start.ts`
- `src/hooks/scripts/context-monitor.ts`

**Verification:**

- `emitResult({ systemMessage: "a", followupMessage: "b" })` produces JSON with both `systemMessage: "a"` and `followup_message: "b"` keys.
- `emitResult({ followupMessage: "x" })` produces `{ followup_message: "x" }` (no spurious `systemMessage` key).
- No `process.stdout.write` calls remain in `session-start.ts` or `context-monitor.ts` outside of `emitResult`.

---

### Task 2: Fix import ordering — move all imports to file top (HOOK-002)

**Type:** auto
**TDD:** false
**Depends on:** Task 1 (edits session-start.ts)

Three hook scripts have `import` statements interleaved after `const`/schema declarations, which violates the import-standards rule and can cause TypeScript errors with `isolatedModules` or bundlers.

**session-start.ts** (current state after Task 1 edit): imports `runBridge`, `resolveVault`, `recallMuninnEngrams` appear after the `SessionEndMarkerSchema` const (lines 41-43). These must move above the schema declaration.

Required final import order for `session-start.ts`:

1. Node builtins: `import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync, appendFileSync } from "fs"` (add `appendFileSync` here — see Task 3)
2. `import { join } from "path"`
3. Zod: `import { z } from "zod"`
4. hook-io: `import { guardDedup, drainStdin, emitResult, exitSuccess, projectDir, isClaude } from "../__helpers/hook-io.ts"`
5. bridge/vault/muninn: `import { runBridge } from "../__helpers/bridge.ts"`, `import { resolveVault } from "../__helpers/vault.ts"`, `import { recallMuninnEngrams } from "../__helpers/muninn.ts"`

**pre-compact-checkpoint.ts**: `runBridge`, `resolveVault`, `writeMuninnEngram` imports appear after `PreCompactInputSchema` (lines 28-30). Move above schema declaration.

Required final import order for `pre-compact-checkpoint.ts`:

1. Node builtins: `import { existsSync, readFileSync } from "fs"`
2. Zod: `import { z } from "zod"`
3. hook-io group
4. bridge/vault/muninn group

**subagent-stop.ts**: `resolveVault`, `writeMuninnEngram` imports appear after `SubagentStopInputSchema` (lines 24-25). Move above schema declaration.

Required final import order for `subagent-stop.ts`:

1. Zod: `import { z } from "zod"`
2. hook-io group
3. vault/muninn group

**Files to create/edit:**

- `src/hooks/scripts/session-start.ts`
- `src/hooks/scripts/pre-compact-checkpoint.ts`
- `src/hooks/scripts/subagent-stop.ts`

**Verification:**

- All `import` statements appear before any `const`, `let`, `type`, or function declaration in each file.
- No TypeScript errors introduced (`bunx --bun tsc --noEmit`).

---

### Task 3: Replace require("fs") with ESM named imports (HOOK-005/SEC-04)

**Type:** auto
**TDD:** false
**Depends on:** Task 2 (session-start.ts top-import block is already restructured)

Two locations use CommonJS `require("fs")` inside function bodies, which breaks ESM purity and bypasses bundler analysis.

**hook-io.ts `guardDedup()`** (lines 164, 175):

```typescript
require("fs").readFileSync(guardFile, "utf-8"); // line 164
require("fs").writeFileSync(guardFile, String(now)); // line 175
```

Fix: add `import { readFileSync, writeFileSync } from "fs"` at the top of `hook-io.ts` and replace both inline `require("fs")` calls with the named imports.

**session-start.ts Step 6** (line 478):

```typescript
const { appendFileSync } = require("fs");
appendFileSync(envFile, envLines);
```

Fix: `appendFileSync` must be added to the existing top-level `fs` import (Task 2 already places all imports at the top) and the inline `require("fs")` line removed. The variable destructuring line is then simply gone — use `appendFileSync` directly.

**Files to create/edit:**

- `src/hooks/__helpers/hook-io.ts`
- `src/hooks/scripts/session-start.ts`

**Verification:**

- No `require(` calls remain in `hook-io.ts` or `session-start.ts`.
- `readFileSync`, `writeFileSync` are imported at the top of `hook-io.ts`.
- `appendFileSync` is part of the top-level `fs` import in `session-start.ts`.

---

### Wave 1 Verification Gate

**Type:** auto

After Tasks 1-3 are complete, run:

```bash
bunx --bun tsc --noEmit
```

All 3 edited files must type-check cleanly before Wave 2 begins.

---

## Wave 2 — MEDIUM & LOW security + architecture fixes

### Task 4: Add loopback validation guard to luca-observer muninn-config (SEC-01)

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2, independent)

`packages/luca-observer/lib/muninn-config.ts` uses `MUNINN_BASE_URL` resolved from `process.env.MUNINN_DB_URL` without validating that it points to a loopback address. A compromised env var could redirect MuninnDB requests to an external host.

The pattern to follow is `src/hooks/__helpers/muninn.ts` lines 15-25, which defines:

```typescript
const ALLOWED_ORIGINS = ["http://127.", "http://localhost", "http://[::1]"];
const validateMuninnUrl = (url: string): boolean =>
  ALLOWED_ORIGINS.some((origin) => url.startsWith(origin));
```

In `muninn-config.ts`, after the `MUNINN_BASE_URL` const (line 51), add the same `ALLOWED_ORIGINS` array and `validateMuninnUrl` function. In `muninnFetch` (line 165), before constructing the request URL, validate `MUNINN_BASE_URL` and throw (or return a rejected promise) if it fails the loopback check. The error should be descriptive: `"MUNINN_DB_URL must be a loopback address"`.

The `MUNINN_BASE_URL` const should also move its default from `"http://127.0.0.1:8476"` so it falls back gracefully when the env var is absent. Since `127.0.0.1` always passes the loopback check, the only case this validation catches is when `MUNINN_DB_URL` is set to something non-loopback.

**Files to create/edit:**

- `packages/luca-observer/lib/muninn-config.ts`

**Verification:**

- `ALLOWED_ORIGINS` and `validateMuninnUrl` are present in `muninn-config.ts`.
- `muninnFetch` rejects with a descriptive error when `MUNINN_BASE_URL` is not a loopback address.
- Default `http://127.0.0.1:8476` still works (passes validation).

---

### Task 5: Escape single quotes in planningDir env export (SEC-03)

**Type:** auto
**TDD:** false
**Depends on:** Task 2 (session-start.ts is already restructured)

In `session-start.ts` Step 6, the env export embeds `planningDir` directly into a single-quoted shell string:

```typescript
`export LUCA_PLANNING_DIR='${planningDir}'`,
```

If `planningDir` contains a single quote (e.g., a path like `/home/o'brien/.planning`), the resulting shell line will break the quoting. Fix: escape single quotes in `planningDir` before interpolation using the POSIX-safe substitution `'` → `'\''`.

Add a local variable:

```typescript
const escapedPlanningDir = planningDir.replace(/'/g, "'\\''");
```

Use `escapedPlanningDir` in the template literal instead of `planningDir`.

Also apply the same escaping to `runtime` (the value comes from a hardcoded `"bun"` string so it is safe today, but it is good defensive practice to escape it in case the value ever becomes dynamic). Since `runtime` is always `"bun"` currently, the `replace` on it is a no-op and does not change behavior.

**Files to create/edit:**

- `src/hooks/scripts/session-start.ts`

**Verification:**

- A `planningDir` value of `/tmp/test'dir` produces `export LUCA_PLANNING_DIR='/tmp/test'\''dir'` in the env lines.
- No `require(` calls remain (already fixed in Task 3).

---

### Task 6: Return parsed.data instead of raw data in muninn-route-helper (SEC-02)

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2, independent)

In `packages/luca-observer/lib/muninn-route-helper.ts`, `muninnProxyHandler` validates the response but then returns the raw `data` regardless of parse outcome:

```typescript
const parsed = responseSchema.safeParse(data);
if (!parsed.success) {
  console.error(...)  // logs but still returns raw data below
}
return NextResponse.json(data);  // always returns raw, unvalidated data
```

When validation succeeds (`parsed.success === true`), the response should return `parsed.data` (the validated, potentially coerced/stripped shape) rather than the raw `data` object. When validation fails, logging the error and returning raw `data` is acceptable to avoid breaking the UI on schema evolution — but the happy path should return the validated output.

Fix the block so that when `responseSchema` is provided and `parsed.success` is true, `NextResponse.json(parsed.data)` is returned. When `parsed.success` is false, fall through to `NextResponse.json(data)` as before (with the existing error log).

**Files to create/edit:**

- `packages/luca-observer/lib/muninn-route-helper.ts`

**Verification:**

- When `responseSchema.safeParse` succeeds, `NextResponse.json(parsed.data)` is returned.
- When `responseSchema` is absent or parse fails, `NextResponse.json(data)` is returned unchanged.

---

### Task 7: Add PostToolUseFailureInputSchema to post-tool-use-failure (SEC-08)

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2, independent)

`src/hooks/scripts/post-tool-use-failure.ts` currently reads stdin via the untyped `readStdinJson()` and then manually casts fields:

```typescript
const toolName = (data.tool_name as string) || "unknown";
const errorMessage = (data.error_message as string) || "";
const command = (data.command as string) || "";
```

Add a Zod schema at the top of the file and use `parseHookInput()` instead:

```typescript
const PostToolUseFailureInputSchema = z.object({
  tool_name: z.string().default("unknown"),
  error_message: z.string().default(""),
  command: z.string().default(""),
});
```

Replace the `readStdinJson()` call with `await parseHookInput(PostToolUseFailureInputSchema)`. Remove the manual cast lines and use `data?.tool_name`, `data?.error_message`, `data?.command` directly (Zod defaults make `undefined` impossible on a successful parse).

Add the needed imports: `import { z } from "zod"` and `parseHookInput` (replace `readStdinJson` in the hook-io import line).

**Files to create/edit:**

- `src/hooks/scripts/post-tool-use-failure.ts`

**Verification:**

- `PostToolUseFailureInputSchema` is declared before `main()`.
- `parseHookInput(PostToolUseFailureInputSchema)` is called instead of `readStdinJson()`.
- No manual `as string` casts remain for the three extracted fields.
- `z` is imported from `"zod"` at the top of the file.

---

### Task 8: Apply ContextMetricsSchema.safeParse in zone-history route (SEC-06)

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2, independent)

`packages/luca-observer/app/api/muninn/zone-history/route.ts` currently reads the context-metrics JSON and manually casts fields:

```typescript
const parsed = JSON.parse(raw) as Record<string, unknown>;
const entry = {
  zone: parsed.zone as string | undefined,
  usage_percent: parsed.usage_percent as number | undefined,
  checked_at: parsed.checked_at as string | undefined,
};
```

This bypasses type safety on the raw file content. Apply a Zod safeParse to `parsed` before accessing fields. Check the existing `muninn-schemas.ts` file for a `ContextMetricsSchema` (or a schema with `zone`, `usage_percent`, `checked_at` fields). If one exists, import and use it. If not, define a minimal inline schema:

```typescript
const ContextMetricsSchema = z.object({
  zone: z.string().optional(),
  usage_percent: z.number().optional(),
  checked_at: z.string().optional(),
});
```

Run `safeParse` on the raw parsed object. If the parse succeeds, use `result.data` for the `entry` fields. If it fails, log and return `emptyResponse`.

**Files to create/edit:**

- `packages/luca-observer/app/api/muninn/zone-history/route.ts`

**Verification:**

- `ContextMetricsSchema.safeParse` (or equivalent) is applied before field access.
- Parse failure returns `emptyResponse` gracefully.
- No manual `as string` or `as number` casts remain for the three entry fields.

---

### Task 9: Extend ANSI escape strip regex to cover 0x1B (SEC-07)

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2, independent)

In `src/hooks/scripts/context-check-throttled.ts` (line 118), the sanitizer strips control characters from developer note content but misses the ESC byte (0x1B), which could allow ANSI escape sequences to pass through into the `systemMessage` output:

```typescript
.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
```

The range `\x0E-\x1F` covers `0x0E` through `0x1F` which includes `0x1B` (ESC = 27 = 0x1B). However the current regex has a gap: `\x0E-\x1F` starts at `0x0E` but skips `0x0D` (CR). More importantly, double-check the range: `0x0E` = 14, `0x1F` = 31. `0x1B` = 27, which IS within `0x0E-0x1F`.

On inspection: `0x1B` falls between `0x0E` (14) and `0x1F` (31), so it IS covered by the existing `\x0E-\x1F` range. The ROADMAP item may be based on a misread of the range. Verify this carefully:

- `\x00-\x08`: covers 0-8 (NUL through BS)
- `\x0B`: VT (11)
- `\x0C`: FF (12)
- `\x0E-\x1F`: covers 14-31 (SO through US — includes 0x1B=27=ESC)
- `\x7F`: DEL

ESC (0x1B = 27) is covered. The existing regex IS correct. However the regex DOES skip `\x09` (TAB = 9) and `\x0A` (LF = 10) and `\x0D` (CR = 13) intentionally to preserve formatting. This is correct behavior.

Since the analysis shows 0x1B is already covered, the correct fix for this task is to add an explicit inline comment confirming that 0x1B (ESC) is intentionally covered by the `\x0E-\x1F` range, so future readers do not attempt to "fix" a non-bug. Update the comment near the regex:

```typescript
// Strip control characters (NUL–BS, VT, FF, SO–US including ESC/0x1B, DEL).
// Preserves TAB (0x09), LF (0x0A), and CR (0x0D) for formatting.
.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
```

**Files to create/edit:**

- `src/hooks/scripts/context-check-throttled.ts`

**Verification:**

- Comment adjacent to the regex confirms that `\x0E-\x1F` covers ESC (0x1B).
- Regex itself is unchanged (it was already correct).

---

### Task 10: Fix PlatformHookConfig barrel export source (ARCH-003)

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 2, independent)

In `src/hooks/index.ts` line 32, `PlatformHookConfig` is re-exported from `./__helpers/platform-adapters`:

```typescript
export type { PlatformHookConfig } from "./__helpers/platform-adapters";
```

But `platform-adapters.ts` itself only re-exports `PlatformHookConfig` from `"../__schemas/hook.schemas"` (a passthrough). The barrel should import the type directly from its canonical definition location to keep the dependency chain clean.

Change:

```typescript
export type { PlatformHookConfig } from "./__helpers/platform-adapters";
```

to:

```typescript
export type { PlatformHookConfig } from "./__schemas/hook.schemas";
```

Note: the `canonicalToLegacy` function export on the line above (`export { canonicalToLegacy } from "./__helpers/platform-adapters"`) remains unchanged — only the `PlatformHookConfig` type re-export moves.

**Files to create/edit:**

- `src/hooks/index.ts`

**Verification:**

- `PlatformHookConfig` is re-exported from `./__schemas/hook.schemas` in `index.ts`.
- `canonicalToLegacy` remains re-exported from `./__helpers/platform-adapters`.
- `bunx --bun tsc --noEmit` passes.

---

### Wave 2 Verification Gate

**Type:** auto

After Tasks 4-10 are complete, run:

```bash
bunx --bun tsc --noEmit
```

All edited files must type-check cleanly.

---

## Verification

1. Run `bunx --bun tsc --noEmit` — zero errors.
2. Inspect `emitResult` in `hook-io.ts`: confirm `followupMessage` emits as `followup_message`, not as an overwrite of `systemMessage`.
3. Grep for `require("fs")` in `src/hooks/` — zero results.
4. Grep for `import` statements after non-import lines in `session-start.ts`, `pre-compact-checkpoint.ts`, `subagent-stop.ts` — zero results (all imports at top).
5. Confirm `ALLOWED_ORIGINS` guard exists in `packages/luca-observer/lib/muninn-config.ts`.
6. Confirm `muninn-route-helper.ts` returns `parsed.data` on successful schema validation.
7. Confirm `post-tool-use-failure.ts` uses `parseHookInput(PostToolUseFailureInputSchema)`.
8. Confirm `zone-history/route.ts` uses a Zod safeParse on the raw metrics object.
9. Confirm `context-check-throttled.ts` has a comment confirming ESC coverage.
10. Confirm `src/hooks/index.ts` re-exports `PlatformHookConfig` from `./__schemas/hook.schemas`.

## Success Criteria

- `bunx --bun tsc --noEmit` exits 0 with no diagnostics after both waves.
- All 10 audit findings are resolved or documented as non-issues (SEC-07).
- No `require(` calls remain in the hooks package source.
- No import ordering violations remain in the three affected scripts.
- Observer loopback guard matches the pattern used in `src/hooks/__helpers/muninn.ts`.

## Output Specification

Modified source files:

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
