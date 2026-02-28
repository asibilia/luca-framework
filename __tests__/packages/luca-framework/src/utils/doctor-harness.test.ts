import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdir } from "fs/promises";
import {
  setupTempProject,
  cleanupTempDir,
  createTempDir,
} from "../../../../utils/temp-dir";
import { validBrandingConfig } from "../../../../utils/fixtures";

// ---------------------------------------------------------------------------
// harnessInstallationCheck
// ---------------------------------------------------------------------------

describe("harnessInstallationCheck", () => {
  let tempDir: string | null = null;
  let originalCwd: string;

  // The check uses process.cwd(), so we need to chdir for tests
  const setCwd = (dir: string) => {
    originalCwd = process.cwd();
    process.chdir(dir);
  };

  afterEach(async () => {
    if (originalCwd) {
      process.chdir(originalCwd);
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("returns warning when no manifest exists", async () => {
    tempDir = await createTempDir();
    setCwd(tempDir);

    const { harnessInstallationCheck } =
      await import("../../../../../packages/luca-framework/src/utils/doctor/checks/harness-installation");

    const result = await harnessInstallationCheck.run();
    expect(result.status).toBe("warning");
    expect(result.message).toContain("No manifest found");
  });

  test("returns pass when all harness dirs and subdirs exist", async () => {
    const manifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["claude", "cursor"],
      files: {},
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(manifest),
    });

    // Create expected directories for claude
    await mkdir(join(tempDir, ".claude", "hooks"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "agents"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "rules"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "skills"), { recursive: true });

    // Create expected directories for cursor
    await mkdir(join(tempDir, ".cursor", "hooks"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "agents"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "rules"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "skills"), { recursive: true });

    setCwd(tempDir);

    const { harnessInstallationCheck } =
      await import("../../../../../packages/luca-framework/src/utils/doctor/checks/harness-installation");

    const result = await harnessInstallationCheck.run();
    expect(result.status).toBe("pass");
    expect(result.message).toContain("2 harness(es) installed");
  });

  test("returns pass for pi harness with only hooks dir", async () => {
    const manifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["pi"],
      files: {},
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(manifest),
    });

    // Pi only requires hooks directory
    await mkdir(join(tempDir, ".pi", "hooks"), { recursive: true });

    setCwd(tempDir);

    const { harnessInstallationCheck } =
      await import("../../../../../packages/luca-framework/src/utils/doctor/checks/harness-installation");

    const result = await harnessInstallationCheck.run();
    expect(result.status).toBe("pass");
    expect(result.message).toContain("1 harness(es) installed");
  });

  test("returns fail when harness directory is missing", async () => {
    const manifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["claude", "cursor"],
      files: {},
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(manifest),
    });

    // Only create claude dirs, NOT cursor
    await mkdir(join(tempDir, ".claude", "hooks"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "agents"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "rules"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "skills"), { recursive: true });

    setCwd(tempDir);

    const { harnessInstallationCheck } =
      await import("../../../../../packages/luca-framework/src/utils/doctor/checks/harness-installation");

    const result = await harnessInstallationCheck.run();
    expect(result.status).toBe("fail");
    expect(result.message).toContain("issue(s) found");
  });

  test("returns fail when subdirectories are missing", async () => {
    const manifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["claude"],
      files: {},
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(manifest),
    });

    // Create .claude dir but only one subdir (missing agents, rules, skills)
    await mkdir(join(tempDir, ".claude", "hooks"), { recursive: true });

    setCwd(tempDir);

    const { harnessInstallationCheck } =
      await import("../../../../../packages/luca-framework/src/utils/doctor/checks/harness-installation");

    const result = await harnessInstallationCheck.run();
    expect(result.status).toBe("fail");
    expect(result.details).toContain("missing subdirs");
  });

  test("defaults to claude and cursor when manifest has no harnesses field", async () => {
    const manifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      files: {},
      // No harnesses field — backward compat
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(manifest),
    });

    // Create dirs for both defaults
    await mkdir(join(tempDir, ".claude", "hooks"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "agents"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "rules"), { recursive: true });
    await mkdir(join(tempDir, ".claude", "skills"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "hooks"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "agents"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "rules"), { recursive: true });
    await mkdir(join(tempDir, ".cursor", "skills"), { recursive: true });

    setCwd(tempDir);

    const { harnessInstallationCheck } =
      await import("../../../../../packages/luca-framework/src/utils/doctor/checks/harness-installation");

    const result = await harnessInstallationCheck.run();
    expect(result.status).toBe("pass");
    expect(result.message).toContain("2 harness(es) installed");
  });
});
