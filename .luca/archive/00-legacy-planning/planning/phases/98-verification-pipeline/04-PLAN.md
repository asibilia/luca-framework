---
id: "98-04"
title: "Middleware pipeline tests"
phase: 98
wave: 3
complexity: MODERATE
depends_on: ["98-01", "98-02"]
tasks:
  - id: "98-04-1"
    title: "Test middleware schema validation"
    goal: "Verify all new schemas parse valid data, reject invalid data, and apply defaults correctly"
    verify: "bun test __tests__/packages/luca-framework/src/harness/middleware-schemas.test.ts passes"
  - id: "98-04-2"
    title: "Test timing middleware"
    goal: "Verify timing middleware records timestamps and duration correctly"
    verify: "bun test __tests__/packages/luca-framework/src/harness/timing-middleware.test.ts passes"
  - id: "98-04-3"
    title: "Test workspace-scope middleware"
    goal: "Verify workspace-scope middleware populates scopedFiles from git diff"
    verify: "bun test __tests__/packages/luca-framework/src/harness/workspace-scope-middleware.test.ts passes"
  - id: "98-04-4"
    title: "Test output-capture middleware"
    goal: "Verify output-capture middleware writes output files to .planning/harness-runs/"
    verify: "bun test __tests__/packages/luca-framework/src/harness/output-capture-middleware.test.ts passes"
  - id: "98-04-5"
    title: "Test pipeline composition and ordering"
    goal: "Verify composePipeline chains middleware in correct order, handles empty pipelines, and resolves configs"
    verify: "bun test __tests__/packages/luca-framework/src/harness/pipeline.test.ts passes"
  - id: "98-04-6"
    title: "Test runner integration with middleware"
    goal: "Verify runHarness executes checks through middleware pipeline and falls back correctly"
    verify: "bun test __tests__/packages/luca-framework/src/harness/runner-middleware.test.ts passes"
---

# 98-04: Middleware Pipeline Tests

## Goal

Write comprehensive tests for the entire middleware pipeline: schemas, individual middleware, pipeline composition, and runner integration. Tests cover happy paths, error handling, edge cases, and the critical property that existing harness behavior is preserved when middleware is not configured.

## Context

@src/harness/**schemas/harness.schemas.ts -- All schemas including new middleware schemas (from 98-01)
@src/harness/middleware/timing.ts -- Timing middleware (from 98-02)
@src/harness/middleware/workspace-scope.ts -- Workspace-scope middleware (from 98-02)
@src/harness/middleware/output-capture.ts -- Output-capture middleware (from 98-02)
@src/harness/middleware/middleware-registry.ts -- Middleware registry (from 98-02)
@src/harness/**helpers/pipeline.ts -- composePipeline, resolveMiddleware (from 98-03)
@src/harness/**helpers/runner.ts -- runHarness with middleware integration (from 98-03)
@**tests**/packages/luca-framework/harness-update.test.ts -- Existing harness test patterns
@**tests\_\_/packages/luca-framework/src/state/observer-emitter.test.ts -- Recent test patterns with fetch mocking

**Test conventions:**

- Use `bun:test` imports (describe, test, expect, beforeEach, afterEach)
- Test files go in `__tests__/packages/luca-framework/src/harness/`
- No classes in test utilities
- Clean up temp files in afterEach
- Use functional mock patterns (globalThis overrides, not jest.mock)

## Tasks

### Task 98-04-1: Test middleware schema validation

Create tests for all new Zod schemas defined in 98-01.

**File:** `__tests__/packages/luca-framework/src/harness/middleware-schemas.test.ts`

```typescript
/**
 * Tests for middleware Zod schemas.
 *
 * Validates parsing, defaults, and rejection behavior for:
 * - MiddlewareContextSchema
 * - CheckMiddlewareConfigSchema
 * - MiddlewarePipelineConfigSchema
 * - MiddlewareResultSchema
 */
import { describe, test, expect } from "bun:test";

import {
  MiddlewareContextSchema,
  CheckMiddlewareConfigSchema,
  MiddlewarePipelineConfigSchema,
  MiddlewareResultSchema,
  CheckConfigSchema,
} from "../../../../../src/harness/__schemas/harness.schemas";

describe("MiddlewareContextSchema", () => {
  test("parses valid context with all fields", () => {
    const result = MiddlewareContextSchema.safeParse({
      check: {
        name: "test",
        command: "bun test",
        enabled: true,
        timeout: 60,
        parser: "bun-test",
      },
      projectDir: "/tmp/project",
      metadata: { key: "value" },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z",
      scopedFiles: ["src/main.ts"],
      outputPath: "/tmp/output.txt",
    });
    expect(result.success).toBe(true);
  });

  test("applies default empty metadata when not provided", () => {
    const result = MiddlewareContextSchema.parse({
      check: {
        name: "test",
        command: "bun test",
        enabled: true,
        timeout: 60,
        parser: "bun-test",
      },
      projectDir: "/tmp/project",
    });
    expect(result.metadata).toEqual({});
  });

  test("optional fields are undefined when not provided", () => {
    const result = MiddlewareContextSchema.parse({
      check: {
        name: "test",
        command: "bun test",
        enabled: true,
        timeout: 60,
        parser: "bun-test",
      },
      projectDir: "/tmp/project",
    });
    expect(result.startedAt).toBeUndefined();
    expect(result.endedAt).toBeUndefined();
    expect(result.scopedFiles).toBeUndefined();
    expect(result.outputPath).toBeUndefined();
  });

  test("rejects missing required fields", () => {
    const result = MiddlewareContextSchema.safeParse({
      projectDir: "/tmp/project",
    });
    expect(result.success).toBe(false);
  });
});

describe("CheckMiddlewareConfigSchema", () => {
  test("parses valid config", () => {
    const result = CheckMiddlewareConfigSchema.safeParse({
      name: "timing",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  test("applies default enabled=true", () => {
    const result = CheckMiddlewareConfigSchema.parse({
      name: "timing",
    });
    expect(result.enabled).toBe(true);
  });

  test("applies default empty options", () => {
    const result = CheckMiddlewareConfigSchema.parse({
      name: "timing",
    });
    expect(result.options).toEqual({});
  });

  test("rejects missing name", () => {
    const result = CheckMiddlewareConfigSchema.safeParse({
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("MiddlewarePipelineConfigSchema", () => {
  test("parses valid pipeline config", () => {
    const result = MiddlewarePipelineConfigSchema.safeParse({
      enabled: true,
      middleware: [
        { name: "timing", enabled: true },
        { name: "output-capture", enabled: false },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.middleware).toHaveLength(2);
    }
  });

  test("applies default enabled=true and empty middleware array", () => {
    const result = MiddlewarePipelineConfigSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.middleware).toEqual([]);
  });
});

describe("MiddlewareResultSchema", () => {
  test("parses valid result", () => {
    const result = MiddlewareResultSchema.safeParse({
      pipelineDuration: 150.5,
      middlewareTiming: { timing: 100.2, "workspace-scope": 50.3 },
      metadata: { key: "value" },
      pipelineStatus: "completed",
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for all fields", () => {
    const result = MiddlewareResultSchema.parse({});
    expect(result.pipelineDuration).toBe(0);
    expect(result.middlewareTiming).toEqual({});
    expect(result.metadata).toEqual({});
    expect(result.pipelineStatus).toBe("completed");
    expect(result.pipelineError).toBeUndefined();
  });

  test("accepts error status with message", () => {
    const result = MiddlewareResultSchema.parse({
      pipelineStatus: "error",
      pipelineError: "Middleware failed",
    });
    expect(result.pipelineStatus).toBe("error");
    expect(result.pipelineError).toBe("Middleware failed");
  });

  test("rejects negative pipelineDuration", () => {
    const result = MiddlewareResultSchema.safeParse({
      pipelineDuration: -1,
    });
    expect(result.success).toBe(false);
  });
});
```

**Steps:**

1. Create directory: `mkdir -p __tests__/packages/luca-framework/src/harness`
2. Write the test file
3. Run: `bun test __tests__/packages/luca-framework/src/harness/middleware-schemas.test.ts`

**Verify:**

- [ ] All schema tests pass
- [ ] Tests cover parse, defaults, optional fields, and rejection
- [ ] Uses `bun:test` imports

### Task 98-04-2: Test timing middleware

Test that the timing middleware correctly records timestamps and duration.

**File:** `__tests__/packages/luca-framework/src/harness/timing-middleware.test.ts`

```typescript
/**
 * Tests for timing middleware.
 *
 * Verifies that the timing middleware records:
 * - startedAt ISO timestamp before check execution
 * - endedAt ISO timestamp after check execution
 * - High-resolution duration in metadata
 */
import { describe, test, expect } from "bun:test";

import { createTimingMiddleware } from "../../../../../src/harness/middleware/timing";
import type {
  MiddlewareContext,
  CheckResult,
} from "../../../../../src/harness/__schemas/harness.schemas";

function createMockContext(
  overrides: Partial<MiddlewareContext> = {},
): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "echo ok",
      enabled: true,
      timeout: 60,
      parser: "generic",
    },
    projectDir: "/tmp/test",
    metadata: {},
    ...overrides,
  };
}

function createMockResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "test",
    status: "passed",
    exitCode: 0,
    errors: [],
    warnings: [],
    rawOutput: "ok",
    duration: 100,
    ...overrides,
  };
}

describe("createTimingMiddleware", () => {
  test("sets startedAt before calling next", async () => {
    const middleware = createTimingMiddleware();
    const ctx = createMockContext();
    let capturedCtx: MiddlewareContext | undefined;

    await middleware(ctx, async (innerCtx) => {
      capturedCtx = innerCtx;
      return createMockResult();
    });

    expect(capturedCtx?.startedAt).toBeDefined();
    expect(typeof capturedCtx?.startedAt).toBe("string");
    // Should be a valid ISO date
    expect(new Date(capturedCtx!.startedAt!).toISOString()).toBe(
      capturedCtx!.startedAt,
    );
  });

  test("records timing_start_hr in metadata before next", async () => {
    const middleware = createTimingMiddleware();
    const ctx = createMockContext();
    let capturedMetadata: Record<string, unknown> = {};

    await middleware(ctx, async (innerCtx) => {
      capturedMetadata = innerCtx.metadata;
      return createMockResult();
    });

    expect(capturedMetadata.timing_start_hr).toBeDefined();
    expect(typeof capturedMetadata.timing_start_hr).toBe("number");
  });

  test("passes through the check result from next", async () => {
    const middleware = createTimingMiddleware();
    const ctx = createMockContext();
    const expectedResult = createMockResult({ name: "custom", exitCode: 42 });

    const result = await middleware(ctx, async () => expectedResult);

    expect(result.name).toBe("custom");
    expect(result.exitCode).toBe(42);
  });

  test("timing_duration_ms is a positive number", async () => {
    const middleware = createTimingMiddleware();
    const ctx = createMockContext();

    await middleware(ctx, async (innerCtx) => {
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));
      return createMockResult();
    });

    // After middleware completes, context metadata should have duration
    // Note: ctx is mutated by the middleware
    expect(ctx.metadata?.timing_duration_ms).toBeUndefined(); // Original ctx not mutated
  });
});
```

**Steps:**

1. Write the test file
2. Run: `bun test __tests__/packages/luca-framework/src/harness/timing-middleware.test.ts`

**Verify:**

- [ ] All timing middleware tests pass
- [ ] Tests verify pre-processing (startedAt set before next)
- [ ] Tests verify result passthrough
- [ ] Uses `bun:test` imports

### Task 98-04-3: Test workspace-scope middleware

Test that workspace-scope middleware populates scopedFiles from git.

**File:** `__tests__/packages/luca-framework/src/harness/workspace-scope-middleware.test.ts`

```typescript
/**
 * Tests for workspace-scope middleware.
 *
 * Verifies that the middleware:
 * - Calls git diff to get changed files
 * - Attaches scopedFiles to context
 * - Gracefully handles non-git directories
 * - Passes through the check result from next
 */
import { describe, test, expect } from "bun:test";

import { createWorkspaceScopeMiddleware } from "../../../../../src/harness/middleware/workspace-scope";
import type {
  MiddlewareContext,
  CheckResult,
} from "../../../../../src/harness/__schemas/harness.schemas";

function createMockContext(
  overrides: Partial<MiddlewareContext> = {},
): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "echo ok",
      enabled: true,
      timeout: 60,
      parser: "generic",
    },
    projectDir: "/tmp/nonexistent-dir-for-test",
    metadata: {},
    ...overrides,
  };
}

function createMockResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "test",
    status: "passed",
    exitCode: 0,
    errors: [],
    warnings: [],
    rawOutput: "ok",
    duration: 100,
    ...overrides,
  };
}

describe("createWorkspaceScopeMiddleware", () => {
  test("attaches scopedFiles to context", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = createMockContext();
    let capturedCtx: MiddlewareContext | undefined;

    await middleware(ctx, async (innerCtx) => {
      capturedCtx = innerCtx;
      return createMockResult();
    });

    expect(capturedCtx?.scopedFiles).toBeDefined();
    expect(Array.isArray(capturedCtx?.scopedFiles)).toBe(true);
  });

  test("passes through the check result from next", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = createMockContext();
    const expectedResult = createMockResult({ name: "custom" });

    const result = await middleware(ctx, async () => expectedResult);

    expect(result.name).toBe("custom");
  });

  test("attaches workspace_changed_file_count to metadata", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = createMockContext();
    let capturedMetadata: Record<string, unknown> = {};

    await middleware(ctx, async (innerCtx) => {
      capturedMetadata = innerCtx.metadata;
      return createMockResult();
    });

    expect(capturedMetadata.workspace_changed_file_count).toBeDefined();
    expect(typeof capturedMetadata.workspace_changed_file_count).toBe("number");
  });

  test("gracefully handles non-git directory (returns empty scopedFiles)", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    // Use a directory that is not a git repo
    const ctx = createMockContext({ projectDir: "/tmp" });
    let capturedScopedFiles: string[] = [];

    await middleware(ctx, async (innerCtx) => {
      capturedScopedFiles = innerCtx.scopedFiles ?? [];
      return createMockResult();
    });

    expect(capturedScopedFiles).toEqual([]);
  });
});
```

**Steps:**

1. Write the test file
2. Run: `bun test __tests__/packages/luca-framework/src/harness/workspace-scope-middleware.test.ts`

**Verify:**

- [ ] All workspace-scope tests pass
- [ ] Tests verify scopedFiles attached to context
- [ ] Tests verify graceful degradation for non-git dirs
- [ ] Uses `bun:test` imports

### Task 98-04-4: Test output-capture middleware

Test that output-capture middleware writes output files and handles errors.

**File:** `__tests__/packages/luca-framework/src/harness/output-capture-middleware.test.ts`

```typescript
/**
 * Tests for output-capture middleware.
 *
 * Verifies that the middleware:
 * - Writes raw output to .planning/harness-runs/
 * - Creates the runs directory if it doesn't exist
 * - Includes header metadata in output file
 * - Skips capture when rawOutput is empty
 * - Gracefully handles write failures
 */
import { describe, test, expect, afterEach } from "bun:test";
import { rm, readdir } from "node:fs/promises";
import { join } from "path";

import { createOutputCaptureMiddleware } from "../../../../../src/harness/middleware/output-capture";
import type {
  MiddlewareContext,
  CheckResult,
} from "../../../../../src/harness/__schemas/harness.schemas";

// Use a unique temp directory for each test run
const TEST_PROJECT_DIR = join(import.meta.dir, ".tmp-output-capture-test");

function createMockContext(
  overrides: Partial<MiddlewareContext> = {},
): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "echo ok",
      enabled: true,
      timeout: 60,
      parser: "generic",
    },
    projectDir: TEST_PROJECT_DIR,
    metadata: {},
    ...overrides,
  };
}

function createMockResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "test",
    status: "passed",
    exitCode: 0,
    errors: [],
    warnings: [],
    rawOutput: "Test output line 1\nTest output line 2",
    duration: 100,
    ...overrides,
  };
}

afterEach(async () => {
  try {
    await rm(TEST_PROJECT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("createOutputCaptureMiddleware", () => {
  test("creates harness-runs directory and writes output file", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = createMockContext();

    await middleware(ctx, async () => createMockResult());

    const runsDir = join(TEST_PROJECT_DIR, ".planning", "harness-runs");
    const files = await readdir(runsDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^test-\d{8}-\d{6}-\d{3}\.txt$/);
  });

  test("output file contains header and raw output", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = createMockContext();

    await middleware(ctx, async () => createMockResult());

    const runsDir = join(TEST_PROJECT_DIR, ".planning", "harness-runs");
    const files = await readdir(runsDir);
    const content = await Bun.file(join(runsDir, files[0]!)).text();

    expect(content).toContain("# Harness Check Output");
    expect(content).toContain("# Check: test");
    expect(content).toContain("# Command: echo ok");
    expect(content).toContain("# Status: passed");
    expect(content).toContain("Test output line 1");
    expect(content).toContain("Test output line 2");
  });

  test("sets outputPath on context", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = createMockContext();

    await middleware(ctx, async () => createMockResult());

    expect(ctx.outputPath).toBeDefined();
    expect(ctx.outputPath).toContain("harness-runs");
    expect(ctx.outputPath).toMatch(/\.txt$/);
  });

  test("skips capture when rawOutput is empty", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = createMockContext();

    await middleware(ctx, async () => createMockResult({ rawOutput: "" }));

    expect(ctx.outputPath).toBeUndefined();
  });

  test("passes through the check result from next", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = createMockContext();
    const expectedResult = createMockResult({ name: "custom", exitCode: 42 });

    const result = await middleware(ctx, async () => expectedResult);

    expect(result.name).toBe("custom");
    expect(result.exitCode).toBe(42);
  });

  test("sets output_capture_size_bytes in metadata", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = createMockContext();

    await middleware(ctx, async () => createMockResult());

    expect(ctx.metadata.output_capture_size_bytes).toBeDefined();
    expect(typeof ctx.metadata.output_capture_size_bytes).toBe("number");
    expect(ctx.metadata.output_capture_size_bytes as number).toBeGreaterThan(0);
  });
});
```

**Steps:**

1. Write the test file
2. Run: `bun test __tests__/packages/luca-framework/src/harness/output-capture-middleware.test.ts`

**Verify:**

- [ ] All output-capture tests pass
- [ ] Tests verify file creation, content, and metadata
- [ ] Tests verify empty output skipping
- [ ] Temp directories cleaned up in afterEach
- [ ] Uses `bun:test` imports

### Task 98-04-5: Test pipeline composition and ordering

Test the `composePipeline` and `resolveMiddleware` functions.

**File:** `__tests__/packages/luca-framework/src/harness/pipeline.test.ts`

```typescript
/**
 * Tests for middleware pipeline composition.
 *
 * Verifies that:
 * - composePipeline chains middleware in correct order (first = outermost)
 * - Empty middleware array passes through directly
 * - resolveMiddleware skips disabled and unknown middleware
 * - Pipeline handles errors gracefully
 */
import { describe, test, expect } from "bun:test";

import {
  composePipeline,
  resolveMiddleware,
} from "../../../../../src/harness/__helpers/pipeline";
import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "../../../../../src/harness/__schemas/harness.schemas";

function createMockContext(): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "echo ok",
      enabled: true,
      timeout: 60,
      parser: "generic",
    },
    projectDir: "/tmp/test",
    metadata: {},
  };
}

function createMockResult(): CheckResult {
  return {
    name: "test",
    status: "passed",
    exitCode: 0,
    errors: [],
    warnings: [],
    rawOutput: "ok",
    duration: 100,
  };
}

describe("composePipeline", () => {
  test("empty middleware array passes through to next directly", async () => {
    const composed = composePipeline([]);
    const ctx = createMockContext();
    const expected = createMockResult();
    let nextCalled = false;

    const result = await composed(ctx, async () => {
      nextCalled = true;
      return expected;
    });

    expect(nextCalled).toBe(true);
    expect(result).toEqual(expected);
  });

  test("single middleware wraps next", async () => {
    const log: string[] = [];

    const mw: CheckMiddleware = async (ctx, next) => {
      log.push("before");
      const result = await next(ctx);
      log.push("after");
      return result;
    };

    const composed = composePipeline([mw]);
    const ctx = createMockContext();

    await composed(ctx, async () => {
      log.push("core");
      return createMockResult();
    });

    expect(log).toEqual(["before", "core", "after"]);
  });

  test("multiple middleware execute in correct order (first = outermost)", async () => {
    const log: string[] = [];

    const mw1: CheckMiddleware = async (ctx, next) => {
      log.push("mw1-before");
      const result = await next(ctx);
      log.push("mw1-after");
      return result;
    };

    const mw2: CheckMiddleware = async (ctx, next) => {
      log.push("mw2-before");
      const result = await next(ctx);
      log.push("mw2-after");
      return result;
    };

    const mw3: CheckMiddleware = async (ctx, next) => {
      log.push("mw3-before");
      const result = await next(ctx);
      log.push("mw3-after");
      return result;
    };

    const composed = composePipeline([mw1, mw2, mw3]);
    const ctx = createMockContext();

    await composed(ctx, async () => {
      log.push("core");
      return createMockResult();
    });

    expect(log).toEqual([
      "mw1-before",
      "mw2-before",
      "mw3-before",
      "core",
      "mw3-after",
      "mw2-after",
      "mw1-after",
    ]);
  });

  test("middleware can short-circuit by not calling next", async () => {
    const shortCircuit: CheckMiddleware = async (ctx, _next) => {
      return {
        ...createMockResult(),
        name: "short-circuited",
        status: "skipped",
      };
    };

    const composed = composePipeline([shortCircuit]);
    const ctx = createMockContext();
    let nextCalled = false;

    const result = await composed(ctx, async () => {
      nextCalled = true;
      return createMockResult();
    });

    expect(nextCalled).toBe(false);
    expect(result.name).toBe("short-circuited");
    expect(result.status).toBe("skipped");
  });

  test("middleware error propagates to caller", async () => {
    const failingMw: CheckMiddleware = async (_ctx, _next) => {
      throw new Error("middleware failed");
    };

    const composed = composePipeline([failingMw]);
    const ctx = createMockContext();

    await expect(composed(ctx, async () => createMockResult())).rejects.toThrow(
      "middleware failed",
    );
  });
});

describe("resolveMiddleware", () => {
  test("resolves known middleware names to functions", () => {
    const resolved = resolveMiddleware([
      { name: "timing", enabled: true, options: {} },
    ]);
    expect(resolved).toHaveLength(1);
    expect(typeof resolved[0]).toBe("function");
  });

  test("skips disabled middleware", () => {
    const resolved = resolveMiddleware([
      { name: "timing", enabled: false, options: {} },
      { name: "output-capture", enabled: true, options: {} },
    ]);
    expect(resolved).toHaveLength(1);
  });

  test("skips unknown middleware names", () => {
    const resolved = resolveMiddleware([
      { name: "nonexistent", enabled: true, options: {} },
    ]);
    expect(resolved).toHaveLength(0);
  });

  test("returns empty array for empty config", () => {
    const resolved = resolveMiddleware([]);
    expect(resolved).toHaveLength(0);
  });

  test("resolves all three default middleware", () => {
    const resolved = resolveMiddleware([
      { name: "timing", enabled: true, options: {} },
      { name: "workspace-scope", enabled: true, options: {} },
      { name: "output-capture", enabled: true, options: {} },
    ]);
    expect(resolved).toHaveLength(3);
    expect(resolved.every((mw) => typeof mw === "function")).toBe(true);
  });
});
```

**Steps:**

1. Write the test file
2. Run: `bun test __tests__/packages/luca-framework/src/harness/pipeline.test.ts`

**Verify:**

- [ ] All pipeline tests pass
- [ ] Tests verify onion execution order (mw1-before, mw2-before, ..., core, ..., mw2-after, mw1-after)
- [ ] Tests verify short-circuit behavior
- [ ] Tests verify error propagation
- [ ] Tests verify resolveMiddleware filtering
- [ ] Uses `bun:test` imports

### Task 98-04-6: Test runner integration with middleware

Test that `runHarness` correctly runs checks through the middleware pipeline and falls back when middleware is not configured.

**File:** `__tests__/packages/luca-framework/src/harness/runner-middleware.test.ts`

```typescript
/**
 * Tests for harness runner middleware integration.
 *
 * Verifies that:
 * - runHarness without middleware config works identically to before
 * - runHarness with middleware config runs checks through pipeline
 * - Pipeline errors fall back to direct execution
 * - CheckResult includes middlewareResult when pipeline is enabled
 */
import { describe, test, expect, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "path";

import { runHarness } from "../../../../../src/harness/__helpers/runner";
import type { HarnessConfig } from "../../../../../src/harness/__schemas/harness.schemas";

// Use a temp directory for output-capture middleware output
const TEST_PROJECT_DIR = join(import.meta.dir, ".tmp-runner-test");

afterEach(async () => {
  try {
    await rm(TEST_PROJECT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("runHarness without middleware", () => {
  test("runs checks and returns result without middlewareResult", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-test",
          command: "echo 'hello'",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 1,
      failFast: false,
    };

    const result = await runHarness(config, TEST_PROJECT_DIR);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("echo-test");
    // Without middleware pipeline config, no middlewareResult
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });
});

describe("runHarness with middleware", () => {
  test("runs checks through middleware pipeline and attaches middlewareResult", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-test",
          command: "echo 'hello from middleware test'",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 1,
      failFast: false,
      middlewarePipeline: {
        enabled: true,
        middleware: [{ name: "timing", enabled: true, options: {} }],
      },
    };

    const result = await runHarness(config, TEST_PROJECT_DIR);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("echo-test");

    // With middleware pipeline, middlewareResult should be present
    const mwResult = result.checks[0]!.middlewareResult;
    expect(mwResult).toBeDefined();
    if (mwResult) {
      expect(mwResult.pipelineStatus).toBe("completed");
      expect(mwResult.pipelineDuration).toBeGreaterThanOrEqual(0);
    }
  });

  test("disabled pipeline skips middleware", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-test",
          command: "echo 'hello'",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 1,
      failFast: false,
      middlewarePipeline: {
        enabled: false,
        middleware: [{ name: "timing", enabled: true, options: {} }],
      },
    };

    const result = await runHarness(config, TEST_PROJECT_DIR);
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });

  test("empty middleware array skips pipeline", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-test",
          command: "echo 'hello'",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 1,
      failFast: false,
      middlewarePipeline: {
        enabled: true,
        middleware: [],
      },
    };

    const result = await runHarness(config, TEST_PROJECT_DIR);
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });
});
```

**Steps:**

1. Write the test file
2. Run: `bun test __tests__/packages/luca-framework/src/harness/runner-middleware.test.ts`

**Note:** These are integration tests that run real commands (echo). They require `sh` to be available (standard on macOS/Linux). The tests use short-lived `echo` commands to keep execution fast.

**Verify:**

- [ ] All runner integration tests pass
- [ ] Tests verify no-middleware path (backward compatibility)
- [ ] Tests verify middleware path (middlewareResult attached)
- [ ] Tests verify disabled/empty pipeline skip
- [ ] Temp directories cleaned up
- [ ] Uses `bun:test` imports

## Success Criteria

- [ ] 6 test files created covering all middleware components
- [ ] All tests pass: `bun test __tests__/packages/luca-framework/src/harness/`
- [ ] Schema validation tests cover parse, defaults, optional fields, rejection
- [ ] Individual middleware tests verify behavior and error handling
- [ ] Pipeline composition tests verify ordering and short-circuit
- [ ] Runner integration tests verify backward compatibility and middleware enrichment
- [ ] No regressions in existing tests: `bun test __tests__/packages/luca-framework/`
- [ ] All tests use `bun:test` imports
