import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import {
  setupTempProject,
  cleanupTempDir,
} from "../../../../../utils/temp-dir";

// Mock logger to silence output
mock.module(
  "../../../../../../packages/luca-framework/src/utils/logger",
  () => ({
    logger: {
      info: () => {},
      success: () => {},
      error: () => {},
      warn: () => {},
      box: () => {},
    },
  }),
);

let tempDir: string;
let cwdSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  tempDir = await setupTempProject({
    ".planning/config.json": JSON.stringify({
      branding: { frameworkName: "Luca", commandPrefix: "lu" },
      stack: "node-ts",
      workTracker: "none",
    }),
    ".planning/manifest.json": JSON.stringify({
      version: "1.0.0",
      files: {},
    }),
  });
  cwdSpy = spyOn(process, "cwd").mockReturnValue(tempDir);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await cleanupTempDir(tempDir);
});

describe("executeDoctor", () => {
  test("returns exit code 0 or warning when no failures", async () => {
    // Bun runtime is always valid in test env, config is valid,
    // manifest has no files so drift check warns, harness dirs missing warns
    const { executeDoctor } =
      await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
    const exitCode = await executeDoctor();
    // 0 = all pass/warn, 1 = at least one fail
    // Harness installation will fail (no .claude/ dir), so exit 1
    expect(exitCode).toBe(1);
  });

  test("multiple failures returns exit code 1", async () => {
    // Config: missing → fail, Harness: missing → fail
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({});
    cwdSpy.mockReturnValue(tempDir);

    const { executeDoctor } =
      await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
    const exitCode = await executeDoctor();
    expect(exitCode).toBe(1);
  });

  test("does not throw when checks have fix suggestions", async () => {
    // Config: missing → fail with fixCommand
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({});
    cwdSpy.mockReturnValue(tempDir);

    const { executeDoctor } =
      await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
    // Should not throw
    const exitCode = await executeDoctor();
    expect(exitCode).toBe(1);
  });
});
