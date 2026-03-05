---
id: 110-02
title: "Convention Alignment: Bare Imports, Harness Docs, HookDefinition snake_case, safeParse, Dead Code"
phase: 110
wave: 1
depends_on: []
complexity: SIMPLE
---

# Plan 110-02: Convention Alignment

## Objective

Fix six convention violations found in the re-audit: bare `"path"` imports that should be
`"node:path"`, misleading harness schema documentation that implies API usage (the schemas are
internal-only), `HookDefinitionSchema` fields that use camelCase when the project convention is
snake_case, two `parse()` calls in harness code that should use `safeParse()`, a `~/` alias import
in `pipeline.ts` that violates the observer convention of relative imports, and a dead `priorityMatch`
variable that reads a frontmatter field but performs no action. Also fixes the import group ordering
in `notes/route.ts`.

## Context

- @src/harness/\_\_helpers/runner.ts — bare `"path"` import on line 29; also has `MiddlewareContextSchema.parse()` on line 181
- @src/harness/middleware/output-capture.ts — bare `"path"` import on line 26
- @src/harness/\_\_schemas/harness.schemas.ts — schema JSDoc says "API-facing" / lacks internal-only clarification
- @src/hooks/\_\_schemas/hook.schemas.ts — `HookDefinitionSchema` uses `cursorEvent`, `cursorMatcher`, `piEvent`, `piMatcher`, `statusMessage` (all camelCase)
- @src/harness/\_\_helpers/pipeline.ts — `MiddlewareResultSchema.parse()` on line 98; uses `~/harness/` alias imports
- @packages/luca-observer/app/api/notes/route.ts — `priorityMatch` declared on line 50 but result unused; also needs import group fix

## Tasks

### Task 1: Fix bare `"path"` imports to `"node:path"`

**Goal:** Follow the project convention of using explicit Node.js built-in protocol prefixes so
imports are unambiguous and consistent with all other Node built-in imports in the codebase.

**Files:**

- `src/harness/__helpers/runner.ts` — line 29: `import { join } from "path";`
- `src/harness/middleware/output-capture.ts` — line 26: `import { join } from "path";`

**Steps:**

1. In `runner.ts`, change `import { join } from "path"` to `import { join } from "node:path"`.
2. In `output-capture.ts`, change `import { join } from "path"` to `import { join } from "node:path"`.
3. No other changes needed — only the module specifier changes, not the usage.

**Verification:**

- [ ] `grep -n '"path"' src/harness/__helpers/runner.ts` returns no results
- [ ] `grep -n '"path"' src/harness/middleware/output-capture.ts` returns no results
- [ ] Both files use `"node:path"` consistently
- [ ] `bunx --bun tsc --noEmit` passes at root

### Task 2: Clarify harness schema documentation — mark as internal-only

**Goal:** The harness schemas (`harness.schemas.ts`) use camelCase for TypeScript internal
properties (`totalErrors`, `totalWarnings`, `rawOutput`, `exitCode`, etc.) because they represent
in-memory runtime types, not API payloads. The module-level JSDoc currently does not make this
distinction clear. Fix the documentation to explicitly state these schemas are internal-only and
explain why camelCase is used here (consistent with TypeScript conventions for internal types).

**Files:**

- `src/harness/__schemas/harness.schemas.ts` — update module-level JSDoc

**Steps:**

1. Update the module-level JSDoc block at the top of the file to add a clear statement:
   - Add: "**Internal-only schemas** — not used as API request/response payloads. Use camelCase
     per TypeScript conventions for internal runtime types. The harness runner serializes to
     snake_case when writing `harness-result.json` for external consumption."
2. For the `HarnessResultSchema` and `CheckResultSchema`, add inline comments on the camelCase
   fields explaining they are internal TypeScript types:
   - e.g., `/** Internal: total error count across all checks */` on `totalErrors`
3. Do not change any field names — they are correct for internal TypeScript usage.

**Verification:**

- [ ] Module-level JSDoc explicitly says "Internal-only schemas"
- [ ] Explanation of camelCase usage is present in the file header
- [ ] No field names changed
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Migrate `HookDefinitionSchema` to snake_case

**Goal:** The `HookDefinitionSchema` in `hook.schemas.ts` uses camelCase field names
(`cursorEvent`, `cursorMatcher`, `piEvent`, `piMatcher`, `statusMessage`). Per project convention,
Zod schemas should use snake_case. Migrate these fields and update all call sites.

**Files:**

- `src/hooks/__schemas/hook.schemas.ts` — rename camelCase fields to snake_case
- Any files that construct or consume `HookDefinition` objects — update to match new field names

**Steps:**

1. In `HookDefinitionSchema`, rename:
   - `cursorEvent` → `cursor_event`
   - `cursorMatcher` → `cursor_matcher`
   - `piEvent` → `pi_event`
   - `piMatcher` → `pi_matcher`
   - `statusMessage` → `status_message`
2. Update the `HookDefinition` TypeScript type (auto-inferred from schema, so field name updates
   propagate automatically via `z.infer`).
3. Search for all files that reference the old field names and update them:
   ```bash
   grep -rn "cursorEvent\|cursorMatcher\|piEvent\|piMatcher\|statusMessage" src/hooks/
   grep -rn "cursorEvent\|cursorMatcher\|piEvent\|piMatcher\|statusMessage" src/compilers/
   ```
4. Update any compiler files, hook definition files, or test files that use these field names.
5. Update the JSDoc comments on the schema fields to reflect the snake_case names.

**Verification:**

- [ ] `grep -rn "cursorEvent\|cursorMatcher\|piEvent\|piMatcher\|statusMessage" src/` returns no results outside of string literals
- [ ] `HookDefinitionSchema` fields all use snake_case
- [ ] `bunx --bun tsc --noEmit` passes at root
- [ ] `bun run build:all` completes without errors (hooks compiler uses these schemas)

### Task 4: Replace `parse()` with `safeParse()` in runner.ts and pipeline.ts

**Goal:** `parse()` throws on invalid input, which can crash the harness unexpectedly.
`safeParse()` returns a result object, enabling graceful error handling per project convention.

**Files:**

- `src/harness/__helpers/runner.ts` — line 181: `MiddlewareContextSchema.parse(...)`
- `src/harness/__helpers/pipeline.ts` — line 98: `MiddlewareResultSchema.parse(...)`

**Steps:**

_runner.ts:_

1. On line 181, replace `MiddlewareContextSchema.parse({...})` with `safeParse` pattern:
   ```typescript
   const ctxResult = MiddlewareContextSchema.safeParse({
     check,
     projectDir,
     metadata: {},
   });
   if (!ctxResult.success) {
     // Fall back to direct execution — middleware context is computed, not external input,
     // but safeParse prevents unexpected throws
     console.warn(
       "[harness] Failed to build middleware context:",
       ctxResult.error.message,
     );
     return runCheck(check, projectDir);
   }
   const ctxInput = ctxResult.data;
   ```

_pipeline.ts:_

1. On line 98, replace `MiddlewareResultSchema.parse({...})` with `safeParse` pattern:
   ```typescript
   const resultParse = MiddlewareResultSchema.safeParse({
     pipelineDuration,
     middlewareTiming: ...,
     metadata: ctx.metadata ?? {},
     pipelineStatus: error ? "error" : "completed",
     pipelineError: error,
   });
   // If schema validation fails (shouldn't happen for computed data), return safe defaults
   return resultParse.success
     ? resultParse.data
     : { pipelineDuration: 0, middlewareTiming: {}, metadata: {}, pipelineStatus: "error" as const };
   ```

**Verification:**

- [ ] No `.parse(` calls remain in `runner.ts` or `pipeline.ts` (only `safeParse`)
- [ ] Exception: `DEFAULT_HARNESS_CONFIG` construction in `harness.schemas.ts` uses `.parse()` — this is for internal computed defaults and is acceptable
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test src/harness/` passes

### Task 5: Fix `~/` alias import in pipeline.ts to relative imports

**Goal:** `pipeline.ts` is in `src/harness/__helpers/` and uses `~/harness/__schemas/harness.schemas`
and `~/harness/middleware`. Per the observer convention documented in Phase 109, harness internal
files should use relative imports to avoid path resolution ambiguity.

**Note:** The `~/` alias is defined for the `src/` directory root in the harness tsconfig. The
imports in `pipeline.ts` are within the same `src/harness/` domain. Per domain architecture rules,
use relative imports for intra-domain references.

**Files:**

- `src/harness/__helpers/pipeline.ts` — lines 23-30: replace `~/harness/` with relative paths

**Steps:**

1. Replace `import type { ... } from "~/harness/__schemas/harness.schemas"` with
   `import type { ... } from "../__schemas/harness.schemas"`.
2. Replace `import { MiddlewareResultSchema } from "~/harness/__schemas/harness.schemas"` with
   `import { MiddlewareResultSchema } from "../__schemas/harness.schemas"`.
3. Replace `import { middlewareRegistry } from "~/harness/middleware"` with
   `import { middlewareRegistry } from "../middleware"`.
4. Verify the relative paths resolve correctly from `src/harness/__helpers/pipeline.ts`.

**Verification:**

- [ ] No `~/` alias imports remain in `pipeline.ts`
- [ ] All imports use `../` relative paths
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes for harness tests

### Task 6: Remove dead `priorityMatch` variable and fix import grouping in notes/route.ts

**Goal:** The `priorityMatch` variable on line 50 of `notes/route.ts` reads a frontmatter field
but the result is captured in an if-block that takes no action (the comment says "Frontmatter
priority takes precedence" but no code follows). Remove the dead variable and its empty if-block.
Also fix the import grouping to separate `node:` imports from relative imports with an empty line
per project convention.

**Files:**

- `packages/luca-observer/app/api/notes/route.ts` — remove dead `priorityMatch` code; fix imports

**Steps:**

_Dead code removal:_

1. Find lines 50-53 where `priorityMatch` is declared and the empty `if` block:
   ```typescript
   const priorityMatch = fm.match(/priority:\s*(.+)/);
   if (priorityMatch) {
     // Frontmatter priority takes precedence
   }
   ```
2. Remove these four lines entirely. The `priority` variable is already set from the filename
   prefix (`filename.startsWith("0-") ? "next" : "whenever"`), so no logic is lost.

_Import grouping:_

1. The file currently has `node:fs/promises` and `node:path` imports mixed with `next/server`.
   Separate them with a blank line per the import standards rule:

   ```typescript
   // Group 1: Node built-ins
   import { readdir, mkdir } from "node:fs/promises";
   import { join } from "node:path";

   // Group 2: External libraries
   import { NextResponse } from "next/server";
   import { z } from "zod";

   // Group 3: Internal/relative imports
   import { requireApiKey } from "~/lib/auth";
   import { insertEvent } from "~/lib/db";
   import { resolveProjectDir } from "~/lib/resolve-project-dir";
   import { broadcastEvent } from "~/lib/sse";
   ```

**Verification:**

- [ ] `grep -n "priorityMatch" packages/luca-observer/app/api/notes/route.ts` returns no results
- [ ] Import groups are separated by blank lines: node: imports first, then external, then internal
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-observer`
- [ ] Note parsing still correctly sets `priority` from filename prefix

## Success Criteria

- [ ] Both `runner.ts` and `output-capture.ts` use `"node:path"` — no bare `"path"` import
- [ ] `harness.schemas.ts` module JSDoc explicitly marks schemas as internal-only
- [ ] `HookDefinitionSchema` uses snake_case for all fields (`cursor_event`, `status_message`, etc.)
- [ ] No `.parse()` calls in `runner.ts` or `pipeline.ts` — replaced by `safeParse()`
- [ ] `pipeline.ts` uses relative imports — no `~/` alias
- [ ] Dead `priorityMatch` variable removed from `notes/route.ts`
- [ ] Import grouping in `notes/route.ts` follows the convention: node: → external → internal
- [ ] `bun test` passes
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun run build:all` passes (hooks compiler consumes `HookDefinitionSchema`)
