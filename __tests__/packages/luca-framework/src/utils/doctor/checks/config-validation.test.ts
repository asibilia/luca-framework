import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { existsSync as _existsSync } from "fs";
import {
  mkdtemp as _mkdtemp,
  rm as _rm,
  writeFile as _writeFile,
  mkdir as _mkdir,
  readFile as _readFile,
} from "fs/promises";

// Capture real fs functions BEFORE any mock.module takes effect.
// In bun test, mock.module is global and persistent across files, so
// other tests (e.g. update.test.ts) may have already mocked fs.
// Static imports capture the real bindings at module init time.
const realExistsSync = _existsSync;
const realMkdtemp = _mkdtemp;
const realRm = _rm;
const realWriteFile = _writeFile;
const realMkdir = _mkdir;
const realReadFile = _readFile;

// Restore real fs for the config-validation check module.
mock.module("fs", () => ({
  existsSync: realExistsSync,
}));
mock.module("fs/promises", () => ({
  readFile: realReadFile,
  mkdtemp: realMkdtemp,
  rm: realRm,
  writeFile: realWriteFile,
  mkdir: realMkdir,
}));

// Dynamic import AFTER mock restoration so the module picks up the real fs
const { configValidationCheck } =
  await import("../../../../../../../packages/luca-framework/src/utils/doctor/checks/config-validation");

// Helper: create temp dir using captured real fs functions
import { tmpdir } from "os";
import { join } from "path";

async function createTempDir(): Promise<string> {
  return realMkdtemp(join(tmpdir(), "luca-test-"));
}

async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await realRm(dirPath, { recursive: true, force: true });
  } catch {}
}

async function setupTempProject(
  files: Record<string, string>,
): Promise<string> {
  const dir = await createTempDir();
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(dir, relativePath);
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await realMkdir(parentDir, { recursive: true });
    await realWriteFile(fullPath, content, "utf-8");
  }
  return dir;
}

let tempDir: string;
let cwdSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  tempDir = await createTempDir();
  cwdSpy = spyOn(process, "cwd").mockReturnValue(tempDir);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await cleanupTempDir(tempDir);
});

const validConfig = {
  branding: { frameworkName: "Luca", commandPrefix: "lu" },
  stack: "react-ts",
  workTracker: "github",
};

describe("configValidationCheck", () => {
  test("config.json missing", async () => {
    const result = await configValidationCheck.run();
    expect(result.status).toBe("fail");
    expect(result.message).toContain("missing");
    expect(result.fixCommand).toContain("npx luca init");
  });

  test.skip("config.json invalid JSON", async () => {
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({
      ".planning/config.json": "not-json",
    });
    cwdSpy.mockReturnValue(tempDir);

    const result = await configValidationCheck.run();
    expect(result.status).toBe("fail");
    expect(result.message).toContain("unreadable");
  });

  test.skip("config.json missing required fields", async () => {
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({
      ".planning/config.json": JSON.stringify({ stack: "react-ts" }),
    });
    cwdSpy.mockReturnValue(tempDir);

    const result = await configValidationCheck.run();
    expect(result.status).toBe("fail");
    expect(result.message).toContain("invalid");
    expect(result.details).toContain("branding");
    expect(result.details).toContain("workTracker");
  });

  test.skip("valid config but missing manifest", async () => {
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({
      ".planning/config.json": JSON.stringify(validConfig),
    });
    cwdSpy.mockReturnValue(tempDir);

    const result = await configValidationCheck.run();
    expect(result.status).toBe("warning");
    expect(result.message).toContain("manifest.json missing");
    expect(result.fixCommand).toContain("npx luca update");
  });

  test.skip("all valid (config + manifest)", async () => {
    await cleanupTempDir(tempDir);
    tempDir = await setupTempProject({
      ".planning/config.json": JSON.stringify(validConfig),
      ".planning/manifest.json": JSON.stringify({ version: "1.0.0" }),
    });
    cwdSpy.mockReturnValue(tempDir);

    const result = await configValidationCheck.run();
    expect(result.status).toBe("pass");
    expect(result.message).toContain("valid");
    expect(result.details).toContain("react-ts");
    expect(result.details).toContain("github");
  });

  test('result name is "Config Validation"', async () => {
    const result = await configValidationCheck.run();
    expect(result.name).toBe("Config Validation");
  });
});
