/**
 * Tests for the output-capture middleware.
 *
 * Validates that createOutputCaptureMiddleware creates harness-runs directory,
 * writes output files with headers, sets outputPath on context, skips capture
 * when rawOutput is empty, and sets output_capture_size_bytes in metadata.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { createOutputCaptureMiddleware } from "~/harness/middleware/output-capture";
import type {
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";
import { join } from "path";
import { rmSync, existsSync, readdirSync, readFileSync } from "fs";

const TEST_PROJECT_DIR = join(import.meta.dir, ".tmp-output-capture-test");

function makeCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "bun test",
      enabled: true,
      timeout: 60,
      parser: "bun-test",
    },
    projectDir: TEST_PROJECT_DIR,
    metadata: {},
    ...overrides,
  };
}

function makeResult(overrides?: Partial<CheckResult>): CheckResult {
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

afterEach(() => {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
  }
});

describe("createOutputCaptureMiddleware", () => {
  test("creates harness-runs directory and writes output file", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult();

    await middleware(ctx, next);

    const runsDir = join(TEST_PROJECT_DIR, ".planning", "harness-runs");
    expect(existsSync(runsDir)).toBe(true);

    const files = readdirSync(runsDir);
    expect(files.length).toBe(1);
    expect(files[0]!).toMatch(/^test-\d{8}-\d{6}-\d{3}\.txt$/);
  });

  test("output file contains header and raw output", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();
    const rawOutput = "My check output";

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult({ rawOutput });

    await middleware(ctx, next);

    const runsDir = join(TEST_PROJECT_DIR, ".planning", "harness-runs");
    const files = readdirSync(runsDir);
    const content = readFileSync(join(runsDir, files[0]!), "utf-8");

    // Header assertions
    expect(content).toContain("# Harness Check Output");
    expect(content).toContain("# Check: test");
    expect(content).toContain("# Command: bun test");
    expect(content).toContain("# Status: passed");
    expect(content).toContain("# Exit Code: 0");

    // Raw output
    expect(content).toContain(rawOutput);
  });

  test("sets outputPath on context", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult();

    await middleware(ctx, next);

    expect(ctx.outputPath).toBeDefined();
    expect(typeof ctx.outputPath).toBe("string");
    expect(ctx.outputPath!).toContain("harness-runs");
    expect(ctx.outputPath!).toMatch(/\.txt$/);
  });

  test("skips capture when rawOutput is empty", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult({ rawOutput: "" });

    const result = await middleware(ctx, next);

    // Should not create the directory since no output to capture
    const runsDir = join(TEST_PROJECT_DIR, ".planning", "harness-runs");
    expect(existsSync(runsDir)).toBe(false);

    // Result should still be passed through
    expect(result.status).toBe("passed");
    expect(ctx.outputPath).toBeUndefined();
  });

  test("passes through the check result from next", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();
    const expectedResult = makeResult({
      name: "custom-check",
      status: "failed",
      exitCode: 1,
      rawOutput: "some output",
    });

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      expectedResult;

    const result = await middleware(ctx, next);

    expect(result.name).toBe("custom-check");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
  });

  test("sets output_capture_size_bytes in metadata", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();
    const rawOutput = "Test output content";

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult({ rawOutput });

    await middleware(ctx, next);

    expect(ctx.metadata.output_capture_size_bytes).toBeDefined();
    expect(typeof ctx.metadata.output_capture_size_bytes).toBe("number");
    expect((ctx.metadata.output_capture_size_bytes as number) > 0).toBe(true);
  });

  test("sets output_capture_path in metadata", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult();

    await middleware(ctx, next);

    expect(ctx.metadata.output_capture_path).toBeDefined();
    expect(typeof ctx.metadata.output_capture_path).toBe("string");
    expect(ctx.metadata.output_capture_path).toBe(ctx.outputPath);
  });

  test("sanitizes check name in filename", async () => {
    const middleware = createOutputCaptureMiddleware();
    const ctx = makeCtx({
      check: {
        name: "my.special/check",
        command: "echo ok",
        enabled: true,
        timeout: 60,
        parser: "generic",
      },
    });

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult();

    await middleware(ctx, next);

    const runsDir = join(TEST_PROJECT_DIR, ".planning", "harness-runs");
    const files = readdirSync(runsDir);
    // Special chars should be replaced with dashes
    expect(files[0]!).toMatch(/^my-special-check-/);
  });
});
