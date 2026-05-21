---
phase: 164
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 164 Plan 1: Security Hardening & Architecture Cleanup

## Objective

Fix all 14 findings from the v4.5.0 milestone audit: 3 HIGH security issues (path traversal),
4 MEDIUM security issues (schema-first parsing + env safety), 2 MEDIUM architecture issues
(dead Cursor code + naming convention), 3 LOW defense-in-depth issues, and 2 tech debt items.

All fixes are fully prescribed in CONTEXT.md — no design decisions required.

## Context

- @.planning/phases/164-audit-gap-security-hardening/164-CONTEXT.md — all fix prescriptions
- @src/hooks/impl/\_lib/hook-io.ts — shared I/O utilities, dead Cursor branches here
- @src/hooks/impl/\_lib/muninn.ts — needs URL origin validation
- @src/hooks/impl/\_lib/vault.ts — imports hook-io.ts (intra-\_lib import, must also be updated)
- @src/hooks/impl/post-edit-format.ts — needs path boundary check
- @src/hooks/impl/post-edit-typecheck.ts — needs path boundary check + systemMessage sanitize
- @src/hooks/impl/statusline.ts — needs cwd boundary check
- @src/hooks/impl/context-check-throttled.ts — needs note truncation, sanitize, vault fix
- @src/hooks/impl/context-monitor.ts — needs realpathSync for symlink-safe validation
- @src/hooks/impl/session-start.ts — needs env value quoting + session-end Zod schema
- @src/hooks/impl/pre-commit-gate.ts — needs schema-first input parsing
- @src/hooks/impl/pre-compact-checkpoint.ts — needs schema-first input parsing
- @src/hooks/impl/subagent-stop.ts — needs schema-first input parsing
- @packages/luca-observer/lib/muninn-config.ts — needs engram ID validation
- @scripts/build-utils.ts — remove .cursor and .pi from SAFE_CLEAN_ROOTS

## Tasks

### 1. Rename \_lib/ to \_\_helpers/ and update all import paths

**Type:** auto
**TDD:** false
**Depends on:** none

Rename the directory `src/hooks/impl/_lib/` to `src/hooks/impl/__helpers/`. This aligns with
the project's domain architecture rule (all internal helpers live in `__helpers/`) and removes
the non-standard single-underscore naming.

Step 1: Rename the directory using the OS move (two-step: rename to a temp name is not needed,
direct rename works since only the trailing character changes).

Step 2: Update every import path in the 15 consumer files from `./_lib/` to `./__helpers/`.
Also update the intra-library import inside `vault.ts` which imports `hook-io.ts` using
`"./hook-io.ts"` (relative, no prefix — this one stays unchanged since it is intra-directory).
The `vault.ts` file imports `hook-io.ts` via `"./hook-io.ts"` — that path is correct and
does not change.

Files with `_lib/` imports to update (15 files):

- `src/hooks/impl/context-check-throttled.ts`
- `src/hooks/impl/context-monitor.ts`
- `src/hooks/impl/post-edit-format.ts`
- `src/hooks/impl/post-edit-typecheck.ts`
- `src/hooks/impl/post-tool-use-failure.ts`
- `src/hooks/impl/pre-commit-drift-check.ts`
- `src/hooks/impl/pre-commit-gate.ts`
- `src/hooks/impl/pre-compact-checkpoint.ts`
- `src/hooks/impl/session-compact-restore.ts`
- `src/hooks/impl/session-persist.ts`
- `src/hooks/impl/session-start.ts`
- `src/hooks/impl/snapshot-sync.ts`
- `src/hooks/impl/statusline.ts`
- `src/hooks/impl/subagent-stop.ts`
- `src/hooks/impl/user-prompt-submit.ts`

**Files to create/edit:**

- Rename: `src/hooks/impl/_lib/` → `src/hooks/impl/__helpers/` (OS rename)
- Edit all 15 files above: replace `"./_lib/` with `"./__helpers/`

**Verification:**

- `ls src/hooks/impl/__helpers/` shows 4 files: bridge.ts, hook-io.ts, muninn.ts, vault.ts
- `ls src/hooks/impl/_lib/` returns "no such file"
- `grep -r "_lib/" src/hooks/impl/ --include="*.ts"` returns no results
- `bunx --bun tsc --noEmit` passes with no new errors

### 2. Remove dead Cursor output branches from hook-io.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

The `emitResult()` function and `exitBlock()` function in `src/hooks/impl/__helpers/hook-io.ts`
contain else branches that emit Cursor-shaped output (`followup_message`, `permission`/`user_message`).
These are dead code — the hooks only run in Claude Code. Remove the else branches and simplify both
functions to Claude-only output.

`emitResult()` changes:

- Remove the `if (isClaude()) / else` branch on systemMessage handling — always emit `systemMessage`
- Remove the `if (isClaude()) / else` branch on followupMessage handling — always emit `systemMessage`
- The `isClaude()` function itself is kept (still used in session-start.ts and context-monitor.ts)

`exitBlock()` changes:

- Remove the else branch that emits `{ permission: "deny", user_message: reason }`
- Simplify to always call `emitResult({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: reason } })`

**Files to create/edit:**

- `src/hooks/impl/__helpers/hook-io.ts`

**Verification:**

- `emitResult()` body no longer contains `followup_message` string
- `exitBlock()` body no longer contains `user_message` string
- `bunx --bun tsc --noEmit` passes

---

## Wave 2 Tasks

### 3. Add projectDir() boundary check in post-edit-format.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

The hook reads `filePath` from stdin and passes it to Prettier without verifying it resolves
within the project directory. An adversarial tool_input.file_path could escape the project.

Add a path boundary check immediately after extracting filePath, before the extension check:

```
import { resolve } from "path";
...
const pd = projectDir();
const resolved = resolve(filePath);
if (!resolved.startsWith(pd + "/")) return exitSuccess();
```

Use the resolved path (not the raw filePath) for `existsSync` and the Prettier invocation.

**Files to create/edit:**

- `src/hooks/impl/post-edit-format.ts`

**Verification:**

- File contains `resolve(filePath)` and `startsWith(pd + "/")`
- `bunx --bun tsc --noEmit` passes

### 4. Add path boundary check and systemMessage sanitization in post-edit-typecheck.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Two fixes in this file:

Fix A — Path boundary check (same pattern as Task 3):
After extracting filePath, add:

```
import { resolve } from "path";
...
const resolved = resolve(filePath);
if (!resolved.startsWith(pd + "/")) return exitSuccess();
```

Use the resolved path for existsSync and downstream usage.

Fix B — Sanitize filePath before embedding in systemMessage:
The current systemMessage embeds `filePath` directly:

```
systemMessage: `TypeScript type errors found after editing ${filePath}:...`
```

Replace with `basename(filePath)` (import `basename` from `"path"`) to avoid leaking
absolute paths or injecting newlines from a crafted path:

```
import { basename } from "path";
...
systemMessage: `TypeScript type errors found after editing ${basename(resolved)}:...`
```

**Files to create/edit:**

- `src/hooks/impl/post-edit-typecheck.ts`

**Verification:**

- File contains `resolve(filePath)` and `startsWith(pd + "/")`
- `systemMessage` uses `basename(resolved)` not raw `filePath`
- `bunx --bun tsc --noEmit` passes

### 5. Add cwd boundary check in statusline.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

The `cwd` value is extracted from stdin JSON and passed directly to `git -C cwd` without
validating that it resolves within projectDir or HOME.

After extracting `cwd`, add:

```
import { resolve } from "path";
...
const pd = projectDir();
const home = process.env.HOME || "";
let validCwd = "";
if (cwd) {
  try {
    const resolvedCwd = resolve(cwd);
    if (resolvedCwd.startsWith(pd + "/") || resolvedCwd === pd ||
        (home && (resolvedCwd.startsWith(home + "/") || resolvedCwd === home))) {
      validCwd = resolvedCwd;
    }
  } catch {
    // resolve failed — discard
  }
}
```

Use `validCwd` (falling back to empty string) for the git -C call. If `validCwd` is empty,
skip the git branch fetch entirely (as today it already skips when `cwd` is falsy).

Also use `validCwd` for the `dirDisplay` computation and the metrics write path.
Keep `pd` for writing `.planning/.context-metrics.json` (unaffected by cwd validation).

**Files to create/edit:**

- `src/hooks/impl/statusline.ts`

**Verification:**

- File contains boundary check on `cwd` before git invocation
- `bunx --bun tsc --noEmit` passes

### 6. Add schema-first parsing for hook-specific inputs

**Type:** auto
**TDD:** false
**Depends on:** 1

Three hooks read specific fields from stdin JSON via unsafe `as string` casts. Add typed Zod
schemas and use `parseHookInput` to replace `readStdinJson()` with a validated parse.

**pre-commit-gate.ts** — schema for `command` field:

```typescript
import { z } from "zod";
import { parseHookInput } from "./__helpers/hook-io.ts";

const PreCommitInputSchema = z.object({
  tool_input: z.object({ command: z.string().default("") }).optional(),
  command: z.string().default(""),
});

const data = await parseHookInput(PreCommitInputSchema);
const command = data?.tool_input?.command ?? data?.command ?? "";
```

Replace the existing `readStdinJson()` + `extractCommand()` call with this pattern.

**pre-compact-checkpoint.ts** — schema for `trigger` field:

```typescript
import { z } from "zod";
import { parseHookInput } from "./__helpers/hook-io.ts";

const PreCompactInputSchema = z.object({
  trigger: z.string().default("unknown"),
});

const data = await parseHookInput(PreCompactInputSchema);
const trigger = data?.trigger ?? "unknown";
```

Replace `readStdinJson()` + `(data.trigger as string) || "unknown"`.

**subagent-stop.ts** — schema for subagent payload fields:

```typescript
import { z } from "zod";
import { parseHookInput } from "./__helpers/hook-io.ts";

const SubagentStopInputSchema = z.object({
  subagent_id: z.string().default("unknown"),
  summary: z.string().default(""),
  output: z.string().default(""),
  tool_calls_count: z.number().optional(),
});

const data = await parseHookInput(SubagentStopInputSchema);
```

Replace `readStdinJson()` + `(data.subagent_id as string)` etc. with typed access on `data`.

**Files to create/edit:**

- `src/hooks/impl/pre-commit-gate.ts`
- `src/hooks/impl/pre-compact-checkpoint.ts`
- `src/hooks/impl/subagent-stop.ts`

**Verification:**

- None of the three files use `(data.X as string)` casts for the listed fields
- `bunx --bun tsc --noEmit` passes

**Run typecheck after Wave 2:**

```bash
bunx --bun tsc --noEmit
```

---

## Wave 3 Tasks

### 7. Quote env file values and add Zod schema for session-end marker in session-start.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Two fixes:

Fix A — Quote env file values with single quotes:
The env export block currently writes unquoted values:

```typescript
`export LUCA_RUNTIME=${runtime}`,
`export LUCA_PLANNING_DIR=${planningDir}`,
`export LUCA_SESSION_ACTIVE=1`,
```

Wrap dynamic values in single quotes to prevent shell word-splitting and injection:

```typescript
`export LUCA_RUNTIME='${runtime}'`,
`export LUCA_PLANNING_DIR='${planningDir}'`,
`export LUCA_SESSION_ACTIVE=1`,
```

Fix B — Parse session-end marker JSON through Zod schema:
The current code reads the marker with a raw `JSON.parse` and uses `as` casts. Add a Zod schema:

```typescript
import { z } from "zod";

const SessionEndMarkerSchema = z.object({
  cleanup_pending: z.boolean().optional(),
  ended_at: z.string().optional(),
});
```

Replace the raw `JSON.parse` + `marker.cleanup_pending` / `marker.ended_at` with
`parseHookInput`-style safeParse or inline safeParse using the schema. Use `.data` fields.

**Files to create/edit:**

- `src/hooks/impl/session-start.ts`

**Verification:**

- Env export lines contain single-quoted values: `'${runtime}'`, `'${planningDir}'`
- File contains `SessionEndMarkerSchema` Zod schema
- `bunx --bun tsc --noEmit` passes

### 8. Validate MUNINN_DB_URL origin in muninn.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

The `writeMuninnEngram` and `recallMuninnEngrams` functions in `src/hooks/impl/__helpers/muninn.ts`
use `process.env.MUNINN_DB_URL` without validating the value. A compromised env var could redirect
requests to an external host.

Add an origin validation helper used by both functions:

```typescript
const ALLOWED_ORIGINS = ["http://127.", "http://localhost", "http://[::1]"];

const validateMuninnUrl = (url: string): boolean =>
  ALLOWED_ORIGINS.some((origin) => url.startsWith(origin));
```

In both `writeMuninnEngram` and `recallMuninnEngrams`, after reading `baseUrl`:

```typescript
const baseUrl = process.env.MUNINN_DB_URL || "http://127.0.0.1:8476";
if (!validateMuninnUrl(baseUrl)) return; // or return [] for recall
```

The default `http://127.0.0.1:8476` always passes validation.

**Files to create/edit:**

- `src/hooks/impl/__helpers/muninn.ts`

**Verification:**

- File contains `validateMuninnUrl` function
- Both `writeMuninnEngram` and `recallMuninnEngrams` validate `baseUrl` before use
- `bunx --bun tsc --noEmit` passes

### 9. Truncate and sanitize note content before systemMessage injection in context-check-throttled.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Two fixes in this file:

Fix A — Truncate and sanitize note content (LOW defense-in-depth):
After reading `raw` from a note file and building `body` from bodyLines, sanitize and truncate:

```typescript
// Strip markdown headers (lines starting with #)
const sanitizedBody = bodyLines
  .filter((line) => !line.trim().startsWith("#"))
  .join(" ")
  .trim()
  // Remove control characters except newline/tab
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

// Truncate note body to 500 chars max
const truncated = sanitizedBody.slice(0, 500);
noteContent += `\n- ${truncated}`;
```

Fix B — Replace hardcoded vault name with resolveVault() (tech debt):
The file already imports `resolveVault` (used in the MuninnDB observation section). However,
the systemMessage at line ~390 contains a hardcoded `"luca-framework"` vault name:

```
mcp__muninn__muninn_remember(vault: "luca-framework", ...
```

Replace with a resolved vault reference. Read the vault once at the top of the relevant
if-block and interpolate it:

```typescript
const vault = await resolveVault();
systemMessage = `[Session Observer] Context at ${usagePercent}% (peak->good). Writing zone observation to MuninnDB. Please summarize your current goal and approach via: mcp__muninn__muninn_remember(vault: "${vault}", concept: "session:observation-work", content: "[current goal, approach, recent decisions]")`;
```

**Files to create/edit:**

- `src/hooks/impl/context-check-throttled.ts`

**Verification:**

- Note content sanitization includes `filter(line => !line.trim().startsWith("#"))` and `.slice(0, 500)`
- systemMessage no longer contains the hardcoded string `"luca-framework"`
- `bunx --bun tsc --noEmit` passes

### 10. Validate engram ID before URL interpolation in muninn-config.ts

**Type:** auto
**TDD:** false
**Depends on:** none

In `packages/luca-observer/lib/muninn-config.ts`, the `entity()` method interpolates
`engrams[0]!.id` directly into a URL path:

```typescript
const linksRes = await muninnFetch(
  `/api/engrams/${engrams[0]!.id}/links`,
```

Add an ID validation check before URL interpolation:

```typescript
const engramId = engrams[0]!.id as string;
if (!engramId || !/^[a-zA-Z0-9_-]+$/.test(engramId)) {
  // Skip links fetch — invalid ID
} else {
  const linksRes = await muninnFetch(
    `/api/engrams/${engramId}/links`,
    ...
  );
}
```

**Files to create/edit:**

- `packages/luca-observer/lib/muninn-config.ts`

**Verification:**

- File contains regex test `/^[a-zA-Z0-9_-]+$/` before the `/api/engrams/${engramId}/links` URL
- `bunx --bun tsc --noEmit` passes

### 11. Use realpathSync for symlink-safe path validation in context-monitor.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

The path validation in `context-monitor.ts` uses `resolve(transcriptPath)` which does not
resolve symlinks. A crafted symlink could bypass the `startsWith(home + "/")` check.

Replace `resolve` with `realpathSync` from `fs` (already imported partially in the file):

```typescript
import { existsSync, statSync, realpathSync } from "fs";
```

In the path validation block:

```typescript
try {
  const resolved = realpathSync(transcriptPath);
  if (resolved.startsWith(home + "/")) {
    validTranscriptPath = resolved;
  }
} catch {
  // realpathSync throws if path doesn't exist or is a broken symlink — reject
}
```

Remove the `import { resolve } from "path"` line if `resolve` is no longer used, or keep
it only if used elsewhere in the file. Inspection shows `resolve` is only used in the
transcript path validation — remove the `resolve` import after replacing it.

**Files to create/edit:**

- `src/hooks/impl/context-monitor.ts`

**Verification:**

- `realpathSync` is used for transcript path validation
- `resolve` from `"path"` is removed (no longer used in this file)
- `bunx --bun tsc --noEmit` passes

### 12. Remove .cursor and .pi from SAFE_CLEAN_ROOTS in build-utils.ts

**Type:** auto
**TDD:** false
**Depends on:** none

`scripts/build-utils.ts` has `SAFE_CLEAN_ROOTS = [".claude", ".cursor", ".pi", "dist"]`.
The `.cursor` and `.pi` outputs are no longer generated by the build pipeline (platform
simplification removed them). Remove them from the allowlist to prevent accidental deletion
of any future files placed there.

```typescript
export const SAFE_CLEAN_ROOTS = [".claude", "dist"] as const;
```

Update the JSDoc example to remove `.cursor` and `.pi` references if present.

**Files to create/edit:**

- `scripts/build-utils.ts`

**Verification:**

- `SAFE_CLEAN_ROOTS` contains exactly `[".claude", "dist"]`
- `bunx --bun tsc --noEmit` passes

**Run final typecheck after Wave 3:**

```bash
bunx --bun tsc --noEmit
```

## Verification

After all three waves:

1. `ls src/hooks/impl/__helpers/` shows: bridge.ts, hook-io.ts, muninn.ts, vault.ts
2. `grep -r '"\./\_lib/' src/hooks/impl/ --include="*.ts"` returns no results
3. `grep -r 'followup_message' src/hooks/impl/__helpers/hook-io.ts` returns no results
4. `grep -r 'user_message' src/hooks/impl/__helpers/hook-io.ts` returns no results
5. Each of the 3 HIGH security files contains a `resolve()` or `realpathSync()` boundary check
6. `grep 'validateMuninnUrl' src/hooks/impl/__helpers/muninn.ts` returns a match
7. `grep '\.slice(0, 500)' src/hooks/impl/context-check-throttled.ts` returns a match
8. `grep '"luca-framework"' src/hooks/impl/context-check-throttled.ts` returns no results
9. `grep "SAFE_CLEAN_ROOTS" scripts/build-utils.ts` shows only `.claude` and `dist`
10. `bunx --bun tsc --noEmit` exits 0

## Success Criteria

- All 14 audit findings addressed (3 HIGH + 4 MEDIUM + 3 LOW + 2 arch + 2 tech debt)
- Zero TypeScript errors introduced
- No new files created (pure modification/rename)
- `_lib/` directory is gone; `__helpers/` directory contains the same 4 files
- Dead Cursor output code removed from hook-io.ts

## Output Specification

Modified files (no new files created):

- `src/hooks/impl/__helpers/hook-io.ts` (renamed + dead code removed + Wave 2 schema work)
- `src/hooks/impl/__helpers/muninn.ts` (renamed + URL validation)
- `src/hooks/impl/__helpers/bridge.ts` (renamed only)
- `src/hooks/impl/__helpers/vault.ts` (renamed only)
- `src/hooks/impl/post-edit-format.ts` (path boundary check)
- `src/hooks/impl/post-edit-typecheck.ts` (path boundary check + basename sanitize)
- `src/hooks/impl/statusline.ts` (cwd boundary check)
- `src/hooks/impl/pre-commit-gate.ts` (schema-first input)
- `src/hooks/impl/pre-compact-checkpoint.ts` (schema-first input)
- `src/hooks/impl/subagent-stop.ts` (schema-first input)
- `src/hooks/impl/session-start.ts` (env quoting + Zod session-end schema)
- `src/hooks/impl/context-check-throttled.ts` (note truncation + vault fix + all 15 import paths)
- `src/hooks/impl/context-monitor.ts` (realpathSync + import path)
- `src/hooks/impl/post-tool-use-failure.ts` (import path only)
- `src/hooks/impl/pre-commit-drift-check.ts` (import path only)
- `src/hooks/impl/session-compact-restore.ts` (import path only)
- `src/hooks/impl/session-persist.ts` (import path only)
- `src/hooks/impl/snapshot-sync.ts` (import path only)
- `src/hooks/impl/user-prompt-submit.ts` (import path only)
- `packages/luca-observer/lib/muninn-config.ts` (engram ID validation)
- `scripts/build-utils.ts` (SAFE_CLEAN_ROOTS cleanup)
