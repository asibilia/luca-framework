---
id: "98-02"
title: "Middleware implementations: workspace-scoping, output-capture, timing"
phase: 98
wave: 2
complexity: MODERATE
depends_on: ["98-01"]
tasks:
  - id: "98-02-1"
    title: "Create middleware directory structure"
    goal: "Scaffold src/harness/middleware/ with barrel index and individual middleware files"
    verify: "Directory src/harness/middleware/ exists with index.ts, workspace-scope.ts, output-capture.ts, timing.ts"
  - id: "98-02-2"
    title: "Implement timing middleware"
    goal: "Create middleware that records high-resolution timestamps before and after check execution"
    verify: "timing middleware sets startedAt, endedAt on context and records duration in metadata"
  - id: "98-02-3"
    title: "Implement workspace-scoping middleware"
    goal: "Create middleware that restricts check execution to changed files via git diff"
    verify: "workspace-scope middleware populates scopedFiles on context; passes through when no files changed"
  - id: "98-02-4"
    title: "Implement output-capture middleware"
    goal: "Create middleware that saves raw check output to .planning/harness-runs/"
    verify: "output-capture middleware writes timestamped output file and sets outputPath on context"
  - id: "98-02-5"
    title: "Create middleware registry"
    goal: "Map middleware names to factory functions, following the parser-registry pattern"
    verify: "middlewareRegistry maps 'timing', 'workspace-scope', 'output-capture' to their factory functions"
  - id: "98-02-6"
    title: "Update harness barrel with middleware exports"
    goal: "Export middleware registry and individual middleware from src/harness/index.ts"
    verify: "middlewareRegistry importable from ~/harness; bunx --bun tsc --noEmit passes"
---

# 98-02: Middleware Implementations

## Goal

Implement the three default middleware functions specified in #24: timing, workspace-scoping, and output-capture. Each middleware follows the `CheckMiddleware` function signature defined in 98-01 and uses the next-function pattern for composability.

## Context

@src/harness/**schemas/harness.schemas.ts -- CheckMiddleware type, MiddlewareContext, CheckResult (from 98-01)
@src/harness/parsers/parser-registry.ts -- Parser registry pattern to follow for middleware registry
@src/harness/parsers/index.ts -- Parser barrel pattern to follow
@src/harness/**helpers/runner.ts -- runCheck function that middleware wraps
@.planning/todos/pending/24-harness-tool-middleware.md -- Spec: workspace-scoping, output-capture, timing

**Design principles:**

- Each middleware is a factory function returning a `CheckMiddleware` (mirrors parser registry pattern)
- Middleware is pure functional -- no classes, no mutable shared state
- Each middleware file exports a single factory function
- The middleware registry maps names to factory functions
- All middleware is optional and gracefully degrades

## Tasks

### Task 98-02-1: Create middleware directory structure

Create the `src/harness/middleware/` directory with the following files:

```
src/harness/middleware/
  index.ts              # Barrel: re-exports registry + individual middleware
  middleware-registry.ts # Maps middleware names to factory functions
  timing.ts             # Timing middleware
  workspace-scope.ts    # Workspace-scoping middleware
  output-capture.ts     # Output-capture middleware
```

**Steps:**

1. Create the directory: `mkdir -p src/harness/middleware`
2. Create empty files for each module
3. Create `index.ts` as a barrel (re-exports only)

**Verify:**

- [ ] Directory `src/harness/middleware/` exists
- [ ] All five files created
- [ ] `index.ts` contains only re-export statements

### Task 98-02-2: Implement timing middleware

Create `src/harness/middleware/timing.ts` -- records high-resolution timestamps before and after check execution.

**File:** `src/harness/middleware/timing.ts`

```typescript
/**
 * Timing middleware for the harness verification pipeline.
 *
 * Records high-resolution timestamps before and after check execution.
 * Attaches startedAt, endedAt, and duration_ms to the middleware context
 * metadata. This data feeds the observer's harness verification pages.
 *
 * @returns CheckMiddleware function
 */
import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";

export function createTimingMiddleware(): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    const startedAt = new Date().toISOString();
    const startHrTime = performance.now();

    const enrichedCtx: MiddlewareContext = {
      ...ctx,
      startedAt,
      metadata: {
        ...ctx.metadata,
        timing_start_hr: startHrTime,
      },
    };

    const result = await next(enrichedCtx);

    const endHrTime = performance.now();
    const endedAt = new Date().toISOString();
    const durationMs = endHrTime - startHrTime;

    // Attach timing data to context metadata (available to subsequent middleware)
    enrichedCtx.endedAt = endedAt;
    enrichedCtx.metadata = {
      ...enrichedCtx.metadata,
      timing_end_hr: endHrTime,
      timing_duration_ms: durationMs,
    };

    return result;
  };
}
```

**Notes:**

- Uses `performance.now()` for high-resolution timing (sub-millisecond)
- Uses ISO timestamps for human-readable start/end times
- Attaches data to both `ctx` properties and `ctx.metadata` for flexibility
- Does not modify the `CheckResult` itself -- timing data lives in context

**Verify:**

- [ ] File exists at `src/harness/middleware/timing.ts`
- [ ] Exports `createTimingMiddleware` factory function
- [ ] Returns `CheckMiddleware` type
- [ ] Sets `startedAt` before calling `next`, `endedAt` after
- [ ] Uses `performance.now()` for high-resolution timing
- [ ] No classes used
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-02-3: Implement workspace-scoping middleware

Create `src/harness/middleware/workspace-scope.ts` -- restricts check awareness to changed files by querying `git diff`.

**File:** `src/harness/middleware/workspace-scope.ts`

```typescript
/**
 * Workspace-scoping middleware for the harness verification pipeline.
 *
 * Queries git diff to identify changed files and attaches them to the
 * middleware context. Downstream consumers (parsers, observer) can use
 * this to focus on relevant file changes rather than the entire project.
 *
 * Does NOT modify the check command itself -- that would risk breaking
 * tool-specific CLI arguments. Instead, it provides scoped file lists
 * that consumers can use for filtering results.
 *
 * @returns CheckMiddleware function
 */
import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";

/**
 * Get changed files from git diff (staged + unstaged).
 *
 * @param projectDir - Project root directory
 * @returns Array of changed file paths relative to projectDir
 */
async function getChangedFiles(projectDir: string): Promise<string[]> {
  try {
    // Get both staged and unstaged changes
    const proc = Bun.spawn(
      ["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
      {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // Git command failed (e.g., not a git repo, no HEAD) -- return empty
      return [];
    }

    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    // Non-git project or git not available -- gracefully degrade
    return [];
  }
}

export function createWorkspaceScopeMiddleware(): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    const changedFiles = await getChangedFiles(ctx.projectDir);

    const enrichedCtx: MiddlewareContext = {
      ...ctx,
      scopedFiles: changedFiles,
      metadata: {
        ...ctx.metadata,
        workspace_changed_file_count: changedFiles.length,
        workspace_changed_files: changedFiles,
      },
    };

    return next(enrichedCtx);
  };
}
```

**Notes:**

- Uses `git diff --name-only --diff-filter=ACMR HEAD` to get added/copied/modified/renamed files
- Gracefully degrades in non-git projects (returns empty array)
- Does NOT modify the check command -- only provides metadata for filtering
- The observer can use `scopedFiles` to highlight which files were checked

**Verify:**

- [ ] File exists at `src/harness/middleware/workspace-scope.ts`
- [ ] Exports `createWorkspaceScopeMiddleware` factory function
- [ ] Returns `CheckMiddleware` type
- [ ] Uses `Bun.spawn` for git command (not `node:child_process`)
- [ ] Gracefully handles non-git projects (returns empty scopedFiles)
- [ ] Attaches scopedFiles to context
- [ ] No classes used
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-02-4: Implement output-capture middleware

Create `src/harness/middleware/output-capture.ts` -- saves raw check output to `.planning/harness-runs/` for historical analysis.

**File:** `src/harness/middleware/output-capture.ts`

```typescript
/**
 * Output-capture middleware for the harness verification pipeline.
 *
 * After a check executes, saves the raw output to a timestamped file
 * in .planning/harness-runs/. This provides historical harness output
 * for the observer dashboard and debugging.
 *
 * Directory structure:
 *   .planning/harness-runs/{check-name}-{timestamp}.txt
 *
 * @returns CheckMiddleware function
 */
import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";
import { join } from "path";
import { mkdir } from "node:fs/promises";

const HARNESS_RUNS_DIR = ".planning/harness-runs";

/**
 * Generate a filesystem-safe timestamp string for output file naming.
 *
 * @returns Timestamp string in format YYYYMMDD-HHmmss-SSS
 */
function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    "-",
    pad(now.getMilliseconds(), 3),
  ].join("");
}

export function createOutputCaptureMiddleware(): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    const result = await next(ctx);

    // Only capture output if there is content to save
    if (!result.rawOutput || result.rawOutput.length === 0) {
      return result;
    }

    try {
      const runsDir = join(ctx.projectDir, HARNESS_RUNS_DIR);
      await mkdir(runsDir, { recursive: true });

      const timestamp = generateTimestamp();
      const safeName = ctx.check.name.replace(/[^a-z0-9-]/gi, "-");
      const fileName = `${safeName}-${timestamp}.txt`;
      const outputPath = join(runsDir, fileName);

      // Build output file with header metadata
      const header = [
        `# Harness Check Output`,
        `# Check: ${ctx.check.name}`,
        `# Command: ${ctx.check.command}`,
        `# Status: ${result.status}`,
        `# Exit Code: ${result.exitCode}`,
        `# Duration: ${result.duration}ms`,
        `# Timestamp: ${new Date().toISOString()}`,
        `# Errors: ${result.errors.length}`,
        `# Warnings: ${result.warnings.length}`,
        ``,
      ].join("\n");

      await Bun.write(outputPath, header + result.rawOutput);

      // Attach output path to context for downstream consumers
      ctx.outputPath = outputPath;
      ctx.metadata = {
        ...ctx.metadata,
        output_capture_path: outputPath,
        output_capture_size_bytes: header.length + result.rawOutput.length,
      };
    } catch {
      // Output capture is best-effort -- do not fail the check
      ctx.metadata = {
        ...ctx.metadata,
        output_capture_error: "Failed to write output file",
      };
    }

    return result;
  };
}
```

**Notes:**

- Post-processing middleware: calls `next` first, then captures the result output
- Creates `.planning/harness-runs/` directory on demand
- Includes metadata header in output file for context
- Best-effort: capture failure does not affect check result
- Uses `Bun.write` (not `node:fs`) per Bun preference

**Verify:**

- [ ] File exists at `src/harness/middleware/output-capture.ts`
- [ ] Exports `createOutputCaptureMiddleware` factory function
- [ ] Returns `CheckMiddleware` type
- [ ] Calls `next` first (post-processing pattern)
- [ ] Creates `.planning/harness-runs/` directory
- [ ] Writes timestamped output files
- [ ] Uses `Bun.write` for file operations
- [ ] Gracefully handles write failures
- [ ] No classes used
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-02-5: Create middleware registry

Create `src/harness/middleware/middleware-registry.ts` -- maps middleware names to factory functions, following the parser-registry pattern.

**File:** `src/harness/middleware/middleware-registry.ts`

```typescript
/**
 * Middleware registry for the harness verification pipeline.
 *
 * Maps middleware names (used in CheckMiddlewareConfig.name) to their
 * factory functions. Follows the same registry pattern used by
 * src/harness/parsers/parser-registry.ts.
 */
import type { CheckMiddleware } from "~/harness/__schemas/harness.schemas";

import { createTimingMiddleware } from "./timing";
import { createWorkspaceScopeMiddleware } from "./workspace-scope";
import { createOutputCaptureMiddleware } from "./output-capture";

export const middlewareRegistry: Record<string, () => CheckMiddleware> = {
  timing: createTimingMiddleware,
  "workspace-scope": createWorkspaceScopeMiddleware,
  "output-capture": createOutputCaptureMiddleware,
};

/**
 * Default middleware execution order.
 *
 * Timing wraps everything (outermost), workspace-scope provides context,
 * output-capture saves results (innermost, post-processing).
 */
export const DEFAULT_MIDDLEWARE_ORDER: string[] = [
  "timing",
  "workspace-scope",
  "output-capture",
];
```

**Verify:**

- [ ] File exists at `src/harness/middleware/middleware-registry.ts`
- [ ] Exports `middlewareRegistry` with 3 entries
- [ ] Exports `DEFAULT_MIDDLEWARE_ORDER` array
- [ ] Follows parser-registry pattern (Record<string, () => CheckMiddleware>)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-02-6: Update harness barrel with middleware exports

Update `src/harness/index.ts` to export the middleware registry and `src/harness/middleware/index.ts` as a proper barrel.

**Step 1:** Create `src/harness/middleware/index.ts`:

```typescript
/**
 * Public API barrel for the harness middleware module.
 *
 * Re-exports only -- no logic, no registries, no constants.
 */
export {
  middlewareRegistry,
  DEFAULT_MIDDLEWARE_ORDER,
} from "./middleware-registry";
export { createTimingMiddleware } from "./timing";
export { createWorkspaceScopeMiddleware } from "./workspace-scope";
export { createOutputCaptureMiddleware } from "./output-capture";
```

**Step 2:** Add to `src/harness/index.ts`:

```typescript
export { middlewareRegistry, DEFAULT_MIDDLEWARE_ORDER } from "./middleware";
export {
  createTimingMiddleware,
  createWorkspaceScopeMiddleware,
  createOutputCaptureMiddleware,
} from "./middleware";
```

**Verify:**

- [ ] `src/harness/middleware/index.ts` is a pure barrel (re-exports only)
- [ ] All middleware exports available from `~/harness`
- [ ] `middlewareRegistry` importable from `~/harness`
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Three middleware implementations created: timing, workspace-scope, output-capture
- [ ] Middleware registry maps names to factory functions
- [ ] Default middleware order defined
- [ ] All middleware follows functional patterns (no classes)
- [ ] All middleware uses Bun APIs where applicable
- [ ] Barrel exports complete
- [ ] `bunx --bun tsc --noEmit` passes
