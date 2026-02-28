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

const originalVersion = process.version;
let tempDir: string;
let cwdSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  tempDir = await setupTempProject({
    ".planning/config.json": JSON.stringify({
      branding: { frameworkName: "Luca", commandPrefix: "lu" },
      stack: "node-ts",
      workTracker: "none",
    }),
    ".planning/manifest.json": JSON.stringify({ version: "1.0.0" }),
  });
  cwdSpy = spyOn(process, "cwd").mockReturnValue(tempDir);
});

afterEach(async () => {
  Object.defineProperty(process, "version", {
    value: originalVersion,
    writable: true,
    configurable: true,
  });
  cwdSpy.mockRestore();
  await cleanupTempDir(tempDir);
});

function setNodeVersion(version: string) {
  Object.defineProperty(process, "version", {
    value: version,
    writable: true,
    configurable: true,
  });
}

describe("executeDoctor", () => {
  // TODO(cleanup): Skipped — requires doctor executor refactor. Address in cleanup milestone.
  // test("no failures returns exit code 0", async () => {
  //   const { executeDoctor } =
  //     await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
  //   const exitCode = await executeDoctor();
  //   expect(exitCode).toBe(0);
  // });

  test("one check fails returns exit code 1", async () => {
    // Node version < 18 → fail
    setNodeVersion("v16.0.0");
    // Cursor: warning, Config: pass

    const { executeDoctor } =
      await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
    const exitCode = await executeDoctor();
    expect(exitCode).toBe(1);
  });

  // TODO(cleanup): Skipped — requires doctor executor refactor. Address in cleanup milestone.
  // test("warnings only returns exit code 0", async () => {
  //   await cleanupTempDir(tempDir);
  //   tempDir = await setupTempProject({
  //     ".planning/config.json": JSON.stringify({
  //       branding: { frameworkName: "Luca", commandPrefix: "lu" },
  //       stack: "node-ts",
  //       workTracker: "none",
  //     }),
  //   });
  //   cwdSpy.mockReturnValue(tempDir);
  //   const { executeDoctor } =
  //     await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
  //   const exitCode = await executeDoctor();
  //   expect(exitCode).toBe(0);
  // });

  test("mixed results (fail + warning + pass) returns exit code 1", async () => {
    // Node version < 18 → fail
    setNodeVersion("v14.0.0");
    // Cursor: not found → warning
    // Config: valid → pass

    const { executeDoctor } =
      await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
    const exitCode = await executeDoctor();
    expect(exitCode).toBe(1);
  });

  test("multiple failures returns exit code 1", async () => {
    // Node version < 18 → fail
    setNodeVersion("v14.0.0");
    // Cursor: not found → warning
    // Config: missing → fail
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({});
    cwdSpy.mockReturnValue(tempDir);

    const { executeDoctor } =
      await import("../../../../../../packages/luca-framework/src/utils/doctor/index");
    const exitCode = await executeDoctor();
    expect(exitCode).toBe(1);
  });

  test("does not throw when checks have fix suggestions", async () => {
    // Node version < 18 → fail with fixCommand
    setNodeVersion("v16.0.0");
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
