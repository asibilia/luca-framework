# Plan 110-02 Summary: Convention Alignment

**Phase:** 110
**Wave:** 1
**Issue:** #44
**Status:** COMPLETE
**Tests:** 666 pass, 0 fail

## Tasks Completed

### Task 1: Fix bare `"path"` imports to `"node:path"`

Fixed two files:

- `src/harness/__helpers/runner.ts` — line 29: `import { join } from "path"` → `"node:path"`
- `src/harness/middleware/output-capture.ts` — line 26: `import { join } from "path"` → `"node:path"`

**Commit:** `fix(110-02): #44 fix bare "path" imports to "node:path" in harness`

---

### Task 2: Clarify harness schema documentation — mark as internal-only

Updated `src/harness/__schemas/harness.schemas.ts`:

- Added module-level JSDoc: **"Internal-only schemas"** — explicitly states camelCase is used per TypeScript conventions for internal runtime types, with cross-reference to `snakeCaseResult` transform in `runHarness()` for external consumption.
- Added inline `/** Internal: ... */` comments on `exitCode`, `rawOutput`, `totalErrors`, `totalWarnings` fields in `CheckResultSchema` and `HarnessResultSchema`.
- No field names changed.

**Commit:** `fix(110-02): #44 mark harness schemas as internal-only with JSDoc clarification`

---

### Task 3: Migrate `HookDefinitionSchema` to snake_case

Renamed 5 camelCase fields to snake_case in `HookDefinitionSchema`:

| Old Name        | New Name         |
| --------------- | ---------------- |
| `cursorEvent`   | `cursor_event`   |
| `cursorMatcher` | `cursor_matcher` |
| `piEvent`       | `pi_event`       |
| `piMatcher`     | `pi_matcher`     |
| `statusMessage` | `status_message` |

**Files updated:**

- `src/hooks/__schemas/hook.schemas.ts` — schema field renames + doc comment update
- `src/hooks/__helpers/platform-adapters.ts` — `canonicalToLegacy()` object literal updated
- `src/hooks/__helpers/config-generators.ts` — `generateCursorHooksConfig()`, `generateClaudeHooksConfig()`, `generatePiExtension()`, `buildPiMatcherCheck()`, `buildPiStdinJson()` all updated
- `__tests__/src/hooks/hook-registry.test.ts` — `cursorEvent` → `cursor_event` field reference
- `__tests__/src/hooks/hook-portability.test.ts` — all 10 field references updated
- `__tests__/src/hooks/pi-extension.test.ts` — all 12 field references updated

**Commit:** `fix(110-02): #44 migrate HookDefinitionSchema fields to snake_case`

---

### Task 4: Replace `parse()` with `safeParse()` in runner.ts and pipeline.ts

**`src/harness/__helpers/runner.ts`** (line 181):

- Replaced `MiddlewareContextSchema.parse({...})` with `safeParse` pattern
- On validation failure: logs warning and falls back to direct `runCheck()` execution

**`src/harness/__helpers/pipeline.ts`** (line 98):

- Replaced `MiddlewareResultSchema.parse({...})` with `safeParse` pattern
- On validation failure: returns safe defaults `{ pipelineDuration: 0, middlewareTiming: {}, metadata: {}, pipelineStatus: "error" }`

`DEFAULT_HARNESS_CONFIG.parse()` in `harness.schemas.ts` was left unchanged — it is an internal computed constant, not parsing external input.

**Commit:** `fix(110-02): #44 replace parse() with safeParse() in runner.ts and pipeline.ts`

---

### Task 5: Fix `~/harness/` alias imports in pipeline.ts to relative imports

Updated `src/harness/__helpers/pipeline.ts` (lines 23-30):

- `"~/harness/__schemas/harness.schemas"` → `"../__schemas/harness.schemas"` (both type and value import)
- `"~/harness/middleware"` → `"../middleware"`

**Commit:** `fix(110-02): #44 replace ~/harness/ alias imports with relative paths in pipeline.ts`

---

### Task 6: Remove dead `priorityMatch` and fix import grouping in notes/route.ts

**`packages/luca-observer/app/api/notes/route.ts`:**

- Removed 4 lines of dead code: `const priorityMatch = fm.match(...)` and the empty `if (priorityMatch) {}` block
- Fixed import grouping: merged `next/server` and `zod` into a single external imports group (previously separated by an extra blank line)

Final import order:

```
// Group 1: node: built-ins
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Group 2: external libraries
import { NextResponse } from "next/server";
import { z } from "zod";

// Group 3: internal ~/lib/ imports
import { requireApiKey } from "~/lib/auth";
...
```

**Commit:** `fix(110-02): #44 remove dead priorityMatch code and fix import grouping in notes/route.ts`

---

## Verification

- `bunx --bun tsc --noEmit` — passes (one pre-existing observer-emitter test error unrelated to this plan)
- `bun test __tests__/src/hooks/ __tests__/src/harness/` — **666 pass, 0 fail**
- All success criteria from plan-02 met
