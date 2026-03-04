import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// Use a temp directory inside the project so resolveProjectDir's
// path traversal check (startsWith(cwd)) passes.
const PROJECT_ROOT = process.cwd();

describe("Harness result persistence roundtrip", () => {
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

  test("harness-result.json written in snake_case is readable by observer", async () => {
    const { readHarnessResult } =
      await import("../../../packages/luca-observer/src/lib/file-watcher");

    // Simulate what the harness runner writes (snake_case)
    const harnessOutput = {
      status: "failed",
      checks: [
        {
          name: "test",
          status: "passed",
          exit_code: 0,
          errors: [],
          warnings: [],
          raw_output: "All 42 tests passed",
          duration: 4500,
        },
        {
          name: "typecheck",
          status: "failed",
          exit_code: 1,
          errors: [
            {
              file: "src/index.ts",
              line: 15,
              column: 3,
              message: "Property 'foo' does not exist on type 'Bar'",
              code: "TS2339",
              severity: "error",
            },
          ],
          warnings: [],
          raw_output: "src/index.ts(15,3): error TS2339",
          duration: 8000,
        },
      ],
      total_errors: 1,
      total_warnings: 0,
      duration: 12500,
      timestamp: "2026-03-03T12:00:00Z",
    };

    const resultPath = join(tmpDir, ".planning", "harness-result.json");
    await Bun.write(resultPath, JSON.stringify(harnessOutput, null, 2));

    // Verify file was written
    expect(existsSync(resultPath)).toBe(true);

    // Read via observer utility
    const result = await readHarnessResult(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
    expect(result!.checks).toHaveLength(2);
    expect(result!.checks[0]!.status).toBe("passed");
    expect(result!.checks[1]!.status).toBe("failed");
    expect(result!.checks[1]!.errors).toHaveLength(1);
    expect(result!.checks[1]!.errors[0]!.file).toBe("src/index.ts");
    expect(result!.checks[1]!.errors[0]!.line).toBe(15);
    expect(result!.total_errors).toBe(1);
  });
});
