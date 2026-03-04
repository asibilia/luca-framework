/**
 * Tests for harness middleware Zod schemas.
 *
 * Validates MiddlewareContextSchema, CheckMiddlewareConfigSchema,
 * MiddlewarePipelineConfigSchema, and MiddlewareResultSchema against
 * valid data, defaults, optional fields, and rejection cases.
 */

import { describe, test, expect } from "bun:test";
import {
  MiddlewareContextSchema,
  CheckMiddlewareConfigSchema,
  MiddlewarePipelineConfigSchema,
  MiddlewareResultSchema,
} from "~/harness/__schemas/harness.schemas";

/* -------------------------------------------------------------------------- */
/*  MiddlewareContextSchema                                                    */
/* -------------------------------------------------------------------------- */

describe("MiddlewareContextSchema", () => {
  const validCheck = {
    name: "test",
    command: "bun test",
    enabled: true,
    timeout: 60,
    parser: "bun-test",
  };

  test("accepts valid data with all fields", () => {
    const input = {
      check: validCheck,
      projectDir: "/tmp/project",
      metadata: { key: "value" },
      startedAt: "2026-03-01T00:00:00.000Z",
      endedAt: "2026-03-01T00:00:01.000Z",
      scopedFiles: ["src/index.ts", "src/util.ts"],
      outputPath: "/tmp/output.txt",
    };

    const result = MiddlewareContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.check.name).toBe("test");
      expect(result.data.projectDir).toBe("/tmp/project");
      expect(result.data.metadata).toEqual({ key: "value" });
      expect(result.data.startedAt).toBe("2026-03-01T00:00:00.000Z");
      expect(result.data.endedAt).toBe("2026-03-01T00:00:01.000Z");
      expect(result.data.scopedFiles).toEqual(["src/index.ts", "src/util.ts"]);
      expect(result.data.outputPath).toBe("/tmp/output.txt");
    }
  });

  test("defaults metadata to empty object", () => {
    const input = {
      check: validCheck,
      projectDir: "/tmp/project",
    };

    const result = MiddlewareContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });

  test("optional fields are undefined when not provided", () => {
    const input = {
      check: validCheck,
      projectDir: "/tmp/project",
    };

    const result = MiddlewareContextSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startedAt).toBeUndefined();
      expect(result.data.endedAt).toBeUndefined();
      expect(result.data.scopedFiles).toBeUndefined();
      expect(result.data.outputPath).toBeUndefined();
    }
  });

  test("rejects missing check field", () => {
    const input = {
      projectDir: "/tmp/project",
    };

    const result = MiddlewareContextSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects missing projectDir field", () => {
    const input = {
      check: validCheck,
    };

    const result = MiddlewareContextSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects invalid check object", () => {
    const input = {
      check: { name: "test" }, // missing required fields
      projectDir: "/tmp/project",
    };

    const result = MiddlewareContextSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  CheckMiddlewareConfigSchema                                                */
/* -------------------------------------------------------------------------- */

describe("CheckMiddlewareConfigSchema", () => {
  test("accepts valid config", () => {
    const input = {
      name: "timing",
      enabled: true,
      options: { detail: "high" },
    };

    const result = CheckMiddlewareConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("timing");
      expect(result.data.enabled).toBe(true);
      expect(result.data.options).toEqual({ detail: "high" });
    }
  });

  test("defaults enabled to true", () => {
    const input = { name: "timing" };

    const result = CheckMiddlewareConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  test("defaults options to empty object", () => {
    const input = { name: "timing" };

    const result = CheckMiddlewareConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toEqual({});
    }
  });

  test("rejects missing name", () => {
    const input = { enabled: true };

    const result = CheckMiddlewareConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  MiddlewarePipelineConfigSchema                                             */
/* -------------------------------------------------------------------------- */

describe("MiddlewarePipelineConfigSchema", () => {
  test("accepts valid pipeline config", () => {
    const input = {
      enabled: true,
      middleware: [
        { name: "timing", enabled: true, options: {} },
        { name: "workspace-scope", enabled: true, options: {} },
      ],
    };

    const result = MiddlewarePipelineConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.middleware).toHaveLength(2);
    }
  });

  test("defaults enabled to true", () => {
    const input = {};

    const result = MiddlewarePipelineConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  test("defaults middleware to empty array", () => {
    const input = {};

    const result = MiddlewarePipelineConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.middleware).toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  MiddlewareResultSchema                                                     */
/* -------------------------------------------------------------------------- */

describe("MiddlewareResultSchema", () => {
  test("accepts valid result", () => {
    const input = {
      pipelineDuration: 42.5,
      middlewareTiming: { timing: 30.1 },
      metadata: { key: "value" },
      pipelineStatus: "completed" as const,
    };

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineDuration).toBe(42.5);
      expect(result.data.middlewareTiming).toEqual({ timing: 30.1 });
      expect(result.data.metadata).toEqual({ key: "value" });
      expect(result.data.pipelineStatus).toBe("completed");
    }
  });

  test("defaults pipelineDuration to 0", () => {
    const input = {};

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineDuration).toBe(0);
    }
  });

  test("defaults middlewareTiming to empty object", () => {
    const input = {};

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.middlewareTiming).toEqual({});
    }
  });

  test("defaults metadata to empty object", () => {
    const input = {};

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });

  test("defaults pipelineStatus to completed", () => {
    const input = {};

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineStatus).toBe("completed");
    }
  });

  test("accepts error status with pipelineError", () => {
    const input = {
      pipelineStatus: "error" as const,
      pipelineError: "Something went wrong",
    };

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineStatus).toBe("error");
      expect(result.data.pipelineError).toBe("Something went wrong");
    }
  });

  test("rejects negative pipelineDuration", () => {
    const input = {
      pipelineDuration: -1,
    };

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects negative middleware timing value", () => {
    const input = {
      middlewareTiming: { timing: -5 },
    };

    const result = MiddlewareResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
