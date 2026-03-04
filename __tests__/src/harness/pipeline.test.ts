/**
 * Tests for pipeline composition and middleware resolution.
 *
 * Validates composePipeline (empty array, single middleware, correct onion order,
 * short-circuit, error propagation) and resolveMiddleware (known names, disabled
 * skipping, unknown skipping, empty config, default three middleware).
 */

import { describe, test, expect } from "bun:test";
import {
  composePipeline,
  resolveMiddleware,
} from "~/harness/__helpers/pipeline";
import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
  CheckMiddlewareConfig,
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

/* -------------------------------------------------------------------------- */
/*  composePipeline                                                            */
/* -------------------------------------------------------------------------- */

describe("composePipeline", () => {
  test("empty array passes through to next directly", async () => {
    const pipeline = composePipeline([]);
    const ctx = makeCtx();
    const expectedResult = makeResult({ name: "direct" });

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      expectedResult;

    const result = await pipeline(ctx, next);
    expect(result.name).toBe("direct");
  });

  test("single middleware wraps next", async () => {
    const order: string[] = [];

    const mw: CheckMiddleware = async (ctx, next) => {
      order.push("mw-before");
      const result = await next(ctx);
      order.push("mw-after");
      return result;
    };

    const pipeline = composePipeline([mw]);
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> => {
      order.push("core");
      return makeResult();
    };

    await pipeline(ctx, next);

    expect(order).toEqual(["mw-before", "core", "mw-after"]);
  });

  test("multiple middleware execute in correct onion order", async () => {
    const order: string[] = [];

    const mw1: CheckMiddleware = async (ctx, next) => {
      order.push("mw1-before");
      const result = await next(ctx);
      order.push("mw1-after");
      return result;
    };

    const mw2: CheckMiddleware = async (ctx, next) => {
      order.push("mw2-before");
      const result = await next(ctx);
      order.push("mw2-after");
      return result;
    };

    const mw3: CheckMiddleware = async (ctx, next) => {
      order.push("mw3-before");
      const result = await next(ctx);
      order.push("mw3-after");
      return result;
    };

    const pipeline = composePipeline([mw1, mw2, mw3]);
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> => {
      order.push("core");
      return makeResult();
    };

    await pipeline(ctx, next);

    expect(order).toEqual([
      "mw1-before",
      "mw2-before",
      "mw3-before",
      "core",
      "mw3-after",
      "mw2-after",
      "mw1-after",
    ]);
  });

  test("short-circuit by not calling next", async () => {
    const order: string[] = [];

    const mw1: CheckMiddleware = async (ctx, next) => {
      order.push("mw1-before");
      const result = await next(ctx);
      order.push("mw1-after");
      return result;
    };

    const shortCircuit: CheckMiddleware = async (_ctx, _next) => {
      order.push("short-circuit");
      // Does NOT call next
      return makeResult({ name: "short-circuited" });
    };

    const mw3: CheckMiddleware = async (ctx, next) => {
      order.push("mw3-before");
      const result = await next(ctx);
      order.push("mw3-after");
      return result;
    };

    const pipeline = composePipeline([mw1, shortCircuit, mw3]);
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> => {
      order.push("core");
      return makeResult();
    };

    const result = await pipeline(ctx, next);

    // mw3 and core should never run
    expect(order).toEqual(["mw1-before", "short-circuit", "mw1-after"]);
    expect(result.name).toBe("short-circuited");
  });

  test("error propagation through the pipeline", async () => {
    const errorMiddleware: CheckMiddleware = async (_ctx, _next) => {
      throw new Error("middleware error");
    };

    const pipeline = composePipeline([errorMiddleware]);
    const ctx = makeCtx();

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      makeResult();

    await expect(pipeline(ctx, next)).rejects.toThrow("middleware error");
  });
});

/* -------------------------------------------------------------------------- */
/*  resolveMiddleware                                                           */
/* -------------------------------------------------------------------------- */

describe("resolveMiddleware", () => {
  test("resolves known middleware names", () => {
    const configs: CheckMiddlewareConfig[] = [
      { name: "timing", enabled: true, options: {} },
    ];

    const resolved = resolveMiddleware(configs);

    expect(resolved).toHaveLength(1);
    expect(typeof resolved[0]).toBe("function");
  });

  test("skips disabled middleware", () => {
    const configs: CheckMiddlewareConfig[] = [
      { name: "timing", enabled: false, options: {} },
      { name: "workspace-scope", enabled: true, options: {} },
    ];

    const resolved = resolveMiddleware(configs);

    expect(resolved).toHaveLength(1);
  });

  test("skips unknown middleware names", () => {
    const configs: CheckMiddlewareConfig[] = [
      { name: "nonexistent-middleware", enabled: true, options: {} },
    ];

    const resolved = resolveMiddleware(configs);

    expect(resolved).toHaveLength(0);
  });

  test("empty config returns empty array", () => {
    const resolved = resolveMiddleware([]);

    expect(resolved).toHaveLength(0);
  });

  test("resolves all three default middleware", () => {
    const configs: CheckMiddlewareConfig[] = [
      { name: "timing", enabled: true, options: {} },
      { name: "workspace-scope", enabled: true, options: {} },
      { name: "output-capture", enabled: true, options: {} },
    ];

    const resolved = resolveMiddleware(configs);

    expect(resolved).toHaveLength(3);
    expect(typeof resolved[0]).toBe("function");
    expect(typeof resolved[1]).toBe("function");
    expect(typeof resolved[2]).toBe("function");
  });

  test("mixed enabled/disabled/unknown produces correct count", () => {
    const configs: CheckMiddlewareConfig[] = [
      { name: "timing", enabled: true, options: {} },
      { name: "workspace-scope", enabled: false, options: {} },
      { name: "output-capture", enabled: true, options: {} },
      { name: "unknown-mw", enabled: true, options: {} },
    ];

    const resolved = resolveMiddleware(configs);

    // timing + output-capture = 2 (workspace-scope disabled, unknown skipped)
    expect(resolved).toHaveLength(2);
  });
});
