/**
 * Tests for the timing middleware.
 *
 * Validates that createTimingMiddleware records high-resolution timestamps,
 * sets startedAt on context before calling next, attaches timing metadata,
 * and passes through the check result from next.
 */

import { describe, test, expect } from "bun:test";
import { createTimingMiddleware } from "~/harness/middleware/timing";
import type {
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";

function makeCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "bun test",
      enabled: true,
      timeout: 60,
      parser: "bun-test",
    },
    projectDir: "/tmp/project",
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
    rawOutput: "ok",
    duration: 100,
    ...overrides,
  };
}

describe("createTimingMiddleware", () => {
  test("sets startedAt before calling next", async () => {
    const middleware = createTimingMiddleware();
    const ctx = makeCtx();
    let capturedCtx: MiddlewareContext | undefined;

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      capturedCtx = innerCtx;
      return makeResult();
    };

    await middleware(ctx, next);

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.startedAt).toBeDefined();
    expect(typeof capturedCtx!.startedAt).toBe("string");
    // Should be an ISO date string
    expect(capturedCtx!.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("records timing_start_hr in metadata before calling next", async () => {
    const middleware = createTimingMiddleware();
    const ctx = makeCtx();
    let capturedMetadata: Record<string, unknown> | undefined;

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      capturedMetadata = innerCtx.metadata;
      return makeResult();
    };

    await middleware(ctx, next);

    expect(capturedMetadata).toBeDefined();
    expect(capturedMetadata!.timing_start_hr).toBeDefined();
    expect(typeof capturedMetadata!.timing_start_hr).toBe("number");
  });

  test("passes through the check result from next", async () => {
    const middleware = createTimingMiddleware();
    const ctx = makeCtx();
    const expectedResult = makeResult({
      name: "custom-check",
      status: "failed",
      exitCode: 1,
    });

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      expectedResult;

    const result = await middleware(ctx, next);

    expect(result.name).toBe("custom-check");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
  });

  test("timing_duration_ms is set on ctx after execution", async () => {
    const middleware = createTimingMiddleware();
    const ctx = makeCtx();

    const next = async (_innerCtx: MiddlewareContext): Promise<CheckResult> => {
      // Small delay to ensure measurable duration
      await new Promise((resolve) => setTimeout(resolve, 5));
      return makeResult();
    };

    await middleware(ctx, next);

    // ctx is mutated directly by timing middleware, so timing data
    // is visible on the original ctx reference
    expect(ctx.metadata.timing_start_hr).toBeDefined();
    expect(typeof ctx.metadata.timing_start_hr).toBe("number");
    expect((ctx.metadata.timing_start_hr as number) > 0).toBe(true);
    expect(ctx.metadata.timing_duration_ms).toBeDefined();
    expect(typeof ctx.metadata.timing_duration_ms).toBe("number");
    expect((ctx.metadata.timing_duration_ms as number) >= 0).toBe(true);
    expect(ctx.endedAt).toBeDefined();
  });

  test("preserves existing metadata from context", async () => {
    const middleware = createTimingMiddleware();
    const ctx = makeCtx({ metadata: { existing_key: "existing_value" } });

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      expect(innerCtx.metadata.existing_key).toBe("existing_value");
      expect(innerCtx.metadata.timing_start_hr).toBeDefined();
      return makeResult();
    };

    await middleware(ctx, next);
  });
});
