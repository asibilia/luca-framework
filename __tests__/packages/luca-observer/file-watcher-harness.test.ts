import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Use a temp directory inside the project so resolveProjectDir's
// path traversal check (startsWith(cwd)) passes.
const PROJECT_ROOT = process.cwd();

describe("readHarnessResult", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      PROJECT_ROOT,
      `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(tmpDir, ".planning"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns null when harness-result.json does not exist", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");
    const result = await readHarnessResult(tmpDir);
    expect(result).toBeNull();
  });

  test("parses valid harness result JSON", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const validResult = {
      status: "passed",
      checks: [
        {
          name: "test",
          status: "passed",
          exit_code: 0,
          errors: [],
          warnings: [],
          raw_output: "All tests passed",
          duration: 5000,
        },
      ],
      total_errors: 0,
      total_warnings: 0,
      duration: 5000,
      timestamp: "2026-03-03T12:00:00Z",
    };

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    writeFileSync(resultPath, JSON.stringify(validResult));

    const result = await readHarnessResult(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("passed");
    expect(result!.checks).toHaveLength(1);
    expect(result!.total_errors).toBe(0);
  });

  test("returns null for invalid JSON", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    writeFileSync(resultPath, "NOT VALID JSON {{{");

    const result = await readHarnessResult(tmpDir);
    expect(result).toBeNull();
  });

  test("returns null for JSON with wrong shape", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    const wrongShape = { foo: "bar", status: "unknown_value" };

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    writeFileSync(resultPath, JSON.stringify(wrongShape));

    const result = await readHarnessResult(tmpDir);
    expect(result).toBeNull();
  });
});
