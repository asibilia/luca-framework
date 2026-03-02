import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const pkgDir = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "packages",
  "luca-framework",
);
const pkgJson = JSON.parse(
  readFileSync(resolve(pkgDir, "package.json"), "utf-8"),
);
const pkgVersion: string = pkgJson.version;

/**
 * Tests for T1-T2: Version sync and validate-package script.
 *
 * These tests verify that:
 * - LUCA_VERSION is not the stale "0.0.1" sentinel
 * - LUCA_VERSION matches package.json version (in source/dev mode)
 * - The validate-package script checks pass structurally
 */

describe("version sync (T1)", () => {
  test("LUCA_VERSION is not the stale 0.0.1 sentinel", async () => {
    const { LUCA_VERSION } =
      await import("../../../packages/luca-framework/src/utils/manifest");
    expect(LUCA_VERSION).not.toBe("0.0.1");
  });

  test("LUCA_VERSION matches package.json version", async () => {
    const { LUCA_VERSION } =
      await import("../../../packages/luca-framework/src/utils/manifest");
    expect(LUCA_VERSION).toBe(pkgVersion);
  });

  test("LUCA_VERSION is exported from package index", async () => {
    const mod = await import("../../../packages/luca-framework/src/index");
    expect(mod.LUCA_VERSION).toBeDefined();
    expect(mod.LUCA_VERSION).toBe(pkgVersion);
  });
});

describe("validate-package structure (T2)", () => {
  test("bin/luca.js exists and has bun shebang", () => {
    const binPath = resolve(pkgDir, "bin", "luca.js");
    expect(existsSync(binPath)).toBe(true);

    const content = readFileSync(binPath, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bun")).toBe(true);
  });

  test("templates directory has expected subdirectories", () => {
    const templatesDir = resolve(pkgDir, "templates");
    expect(existsSync(templatesDir)).toBe(true);

    const expectedSubdirs = ["base", "framework", "harness", "hooks", "stacks"];
    for (const subdir of expectedSubdirs) {
      expect(existsSync(resolve(templatesDir, subdir))).toBe(true);
    }
  });

  test("validate-package script exists", () => {
    const scriptPath = resolve(pkgDir, "scripts", "validate-package.ts");
    expect(existsSync(scriptPath)).toBe(true);
  });

  test("package.json has prepublishOnly script", () => {
    expect(pkgJson.scripts.prepublishOnly).toBeDefined();
    expect(pkgJson.scripts.prepublishOnly).toContain("bun run build");
    expect(pkgJson.scripts.prepublishOnly).toContain("bun test");
  });

  test("package.json has validate script", () => {
    expect(pkgJson.scripts.validate).toBeDefined();
    expect(pkgJson.scripts.validate).toContain("validate-package");
  });
});

describe("build config version injection (T1)", () => {
  test("build.config.ts contains __LUCA_VERSION__ replacement", () => {
    const buildConfigPath = resolve(pkgDir, "build.config.ts");
    const content = readFileSync(buildConfigPath, "utf-8");
    expect(content).toContain("__LUCA_VERSION__");
    expect(content).toContain("pkg.version");
  });

  test("manifest.ts declares __LUCA_VERSION__ sentinel", () => {
    const manifestPath = resolve(pkgDir, "src", "utils", "manifest.ts");
    const content = readFileSync(manifestPath, "utf-8");
    expect(content).toContain("declare const __LUCA_VERSION__");
    expect(content).not.toContain('const LUCA_VERSION = "0.0.1"');
  });
});
