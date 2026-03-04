/**
 * Tests for runner integration with middleware.
 *
 * Validates that runHarness works correctly with and without middleware
 * configuration, that disabled pipelines skip middleware, and that empty
 * middleware arrays skip the pipeline.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { runHarness } from "~/harness/__helpers/runner";
import type { HarnessConfig } from "~/harness/__schemas/harness.schemas";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_PROJECT_DIR = join(import.meta.dir, ".tmp-runner-test");
const PROJECT_DIR = join(import.meta.dir, "../../..");

afterEach(() => {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
  }
});

describe("runHarness middleware integration", () => {
  test("runHarness without middleware config returns result without middlewareResult", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-test",
          command: 'echo "hello"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
      // No middlewarePipeline
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });

  test("runHarness with middleware returns middlewareResult with completed status", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-mw-test",
          command: 'echo "hello middleware"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
      middlewarePipeline: {
        enabled: true,
        middleware: [{ name: "timing", enabled: true, options: {} }],
      },
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.middlewareResult).toBeDefined();
    expect(result.checks[0]!.middlewareResult!.pipelineStatus).toBe(
      "completed",
    );
    expect(
      result.checks[0]!.middlewareResult!.pipelineDuration,
    ).toBeGreaterThanOrEqual(0);
  });

  test("disabled pipeline skips middleware", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-disabled-pipeline",
          command: 'echo "no middleware"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
      middlewarePipeline: {
        enabled: false,
        middleware: [{ name: "timing", enabled: true, options: {} }],
      },
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
    // Middleware is disabled, so no middlewareResult
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });

  test("empty middleware array skips pipeline", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-empty-mw",
          command: 'echo "empty middleware"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
      middlewarePipeline: {
        enabled: true,
        middleware: [],
      },
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
    // Empty middleware array means direct execution, no middlewareResult
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });

  test("middleware with multiple checks attaches middlewareResult to each", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "check-a",
          command: 'echo "a"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
        {
          name: "check-b",
          command: 'echo "b"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
      middlewarePipeline: {
        enabled: true,
        middleware: [{ name: "timing", enabled: true, options: {} }],
      },
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0]!.middlewareResult).toBeDefined();
    expect(result.checks[0]!.middlewareResult!.pipelineStatus).toBe(
      "completed",
    );
    expect(result.checks[1]!.middlewareResult).toBeDefined();
    expect(result.checks[1]!.middlewareResult!.pipelineStatus).toBe(
      "completed",
    );
  });

  test("all-disabled middleware resolves to direct execution", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-all-disabled",
          command: 'echo "all disabled"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
      middlewarePipeline: {
        enabled: true,
        middleware: [
          { name: "timing", enabled: false, options: {} },
          { name: "workspace-scope", enabled: false, options: {} },
        ],
      },
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
    // All middleware disabled -> resolveMiddleware returns [] -> direct execution
    expect(result.checks[0]!.middlewareResult).toBeUndefined();
  });
});
