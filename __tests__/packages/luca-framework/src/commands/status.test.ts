import { describe, test, expect } from "bun:test";

import { statusCommand } from "../../../../../packages/luca-framework/src/commands/status";

describe("statusCommand", () => {
  test("exports a defineCommand object", () => {
    expect(statusCommand).toBeDefined();
    expect(typeof statusCommand).toBe("object");
  });

  test("has correct meta name", () => {
    const meta = statusCommand.meta as Record<string, unknown>;
    expect(meta?.name).toBe("status");
  });

  test("has correct meta description", () => {
    const meta = statusCommand.meta as Record<string, unknown>;
    expect(meta?.description).toBe(
      "Show Luca project status and configuration",
    );
  });

  test("has json arg defined", () => {
    const args = statusCommand.args as Record<string, Record<string, unknown>>;
    expect(args?.json).toBeDefined();
    expect(args?.json?.type).toBe("boolean");
  });

  test("json arg defaults to false", () => {
    const args = statusCommand.args as Record<string, Record<string, unknown>>;
    expect(args?.json?.default).toBe(false);
  });

  test("has a run function", () => {
    expect(typeof statusCommand.run).toBe("function");
  });
});
