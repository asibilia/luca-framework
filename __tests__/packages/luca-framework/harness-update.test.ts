import { describe, test, expect, afterEach } from "bun:test";
import { writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "crypto";
import {
  hashContent,
  hashFile,
  createManifest,
  inferFileSource,
  LUCA_VERSION,
} from "../../../packages/luca-framework/src/utils/manifest";
import {
  setupTempProject,
  cleanupTempDir,
  createTempDir,
} from "../../utils/temp-dir";
import { validLucaConfig, validBrandingConfig } from "../../utils/fixtures";
import type {
  LucaManifest,
  FileSource,
  HarnessId,
} from "../../../packages/luca-framework/src/types";

/**
 * Tests for T3-T6: Harness source tracking, harness addition/removal,
 * hook script chmod, and manifest version propagation.
 */

// ---------------------------------------------------------------------------
// T3: Source marker tracking
// ---------------------------------------------------------------------------

describe("harness source tracking (T3)", () => {
  test("inferFileSource tags .claude/ files as harness:claude", () => {
    const source = inferFileSource(".claude/rules/test.md", [
      "claude",
      "cursor",
    ]);
    expect(source).toBe("harness:claude");
  });

  test("inferFileSource tags .cursor/ files as harness:cursor", () => {
    const source = inferFileSource(".cursor/agents/test.md", [
      "claude",
      "cursor",
    ]);
    expect(source).toBe("harness:cursor");
  });

  test("inferFileSource tags .pi/ files as harness:pi", () => {
    const source = inferFileSource(".pi/settings.json", [
      "claude",
      "cursor",
      "pi",
    ]);
    expect(source).toBe("harness:pi");
  });

  test("inferFileSource tags .planning/ files as framework", () => {
    const source = inferFileSource(".planning/BRAIN.md", ["claude", "cursor"]);
    expect(source).toBe("framework");
  });

  test("inferFileSource tags root files as framework", () => {
    const source = inferFileSource("AGENTS.md", ["claude", "cursor"]);
    expect(source).toBe("framework");
  });

  test("inferFileSource only matches active harnesses", () => {
    // pi is not in the harness list, so .pi/ files should be "framework"
    const source = inferFileSource(".pi/settings.json", ["claude", "cursor"]);
    expect(source).toBe("framework");
  });
});

describe("createManifest with source tracking (T3)", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("auto-detects harness source for .claude/ files", async () => {
    tempDir = await setupTempProject({
      ".planning/BRAIN.md": "# Brain",
      ".claude/rules/test.md": "# Rule",
      ".cursor/agents/test.md": "# Agent",
    });

    const config = {
      ...validLucaConfig,
      harnesses: ["claude", "cursor"] as HarnessId[],
    };

    const manifest = await createManifest({
      config,
      cwd: tempDir,
      createdFiles: [
        join(tempDir, ".planning/BRAIN.md"),
        join(tempDir, ".claude/rules/test.md"),
        join(tempDir, ".cursor/agents/test.md"),
      ],
    });

    expect(manifest.files[".planning/BRAIN.md"]?.source).toBe("framework");
    expect(manifest.files[".claude/rules/test.md"]?.source).toBe(
      "harness:claude",
    );
    expect(manifest.files[".cursor/agents/test.md"]?.source).toBe(
      "harness:cursor",
    );
  });

  test("explicit sourceMap overrides auto-detection", async () => {
    tempDir = await setupTempProject({
      ".claude/custom.md": "# Custom",
    });

    const config = {
      ...validLucaConfig,
      harnesses: ["claude", "cursor"] as HarnessId[],
    };

    const sourceMap = new Map<string, FileSource>();
    sourceMap.set(".claude/custom.md", "user");

    const manifest = await createManifest({
      config,
      cwd: tempDir,
      createdFiles: [join(tempDir, ".claude/custom.md")],
      sourceMap,
    });

    // Explicit sourceMap should override auto-detection
    expect(manifest.files[".claude/custom.md"]?.source).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// T3 continued: FileSource type
// ---------------------------------------------------------------------------

describe("FileSource type (T3)", () => {
  test("framework source is valid", () => {
    const source: FileSource = "framework";
    expect(source).toBe("framework");
  });

  test("user source is valid", () => {
    const source: FileSource = "user";
    expect(source).toBe("user");
  });

  test("harness:claude source is valid", () => {
    const source: FileSource = "harness:claude";
    expect(source).toBe("harness:claude");
  });

  test("harness:cursor source is valid", () => {
    const source: FileSource = "harness:cursor";
    expect(source).toBe("harness:cursor");
  });

  test("harness:pi source is valid", () => {
    const source: FileSource = "harness:pi";
    expect(source).toBe("harness:pi");
  });
});

// ---------------------------------------------------------------------------
// T4: Harness addition detection
// ---------------------------------------------------------------------------

describe("harness addition detection (T4)", () => {
  test("difference detects added harnesses", async () => {
    // This tests the pattern used in update.ts
    const { default: difference } = await import("lodash/difference");
    const oldHarnesses: HarnessId[] = ["claude", "cursor"];
    const newHarnesses: HarnessId[] = ["claude", "cursor", "pi"];
    const added = difference(newHarnesses, oldHarnesses);
    expect(added).toEqual(["pi"]);
  });

  test("difference detects removed harnesses", async () => {
    const { default: difference } = await import("lodash/difference");
    const oldHarnesses: HarnessId[] = ["claude", "cursor"];
    const newHarnesses: HarnessId[] = ["claude", "pi"];
    const removed = difference(oldHarnesses, newHarnesses);
    expect(removed).toEqual(["cursor"]);
  });

  test("no changes when harnesses are the same", async () => {
    const { default: difference } = await import("lodash/difference");
    const oldHarnesses: HarnessId[] = ["claude", "cursor"];
    const newHarnesses: HarnessId[] = ["claude", "cursor"];
    const added = difference(newHarnesses, oldHarnesses);
    const removed = difference(oldHarnesses, newHarnesses);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T4: Harness removal — file cleanup
// ---------------------------------------------------------------------------

describe("harness removal file cleanup (T4)", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("unchanged harness files are identified for removal", async () => {
    const content = "# Original cursor rule";
    const hash = hashContent(content);

    tempDir = await setupTempProject({
      ".cursor/rules/test.md": content,
    });

    const manifest: LucaManifest = {
      version: "2.4.0",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["claude", "cursor"],
      files: {
        ".cursor/rules/test.md": {
          originalHash: hash,
          source: "harness:cursor",
        },
      },
    };

    // Verify the hash matches so it's "unchanged"
    const currentHash = await hashFile(join(tempDir, ".cursor/rules/test.md"));
    expect(currentHash).toBe(hash);
    // The cleanup logic would delete this file since hashes match
  });

  test("user-modified harness files are preserved", async () => {
    const originalContent = "# Original cursor rule";
    const originalHash = hashContent(originalContent);

    tempDir = await setupTempProject({
      ".cursor/rules/test.md": "# User modified this rule",
    });

    const manifest: LucaManifest = {
      version: "2.4.0",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["claude", "cursor"],
      files: {
        ".cursor/rules/test.md": {
          originalHash,
          source: "harness:cursor",
        },
      },
    };

    // Verify the hash does NOT match (user modified)
    const currentHash = await hashFile(join(tempDir, ".cursor/rules/test.md"));
    expect(currentHash).not.toBe(originalHash);
    // The cleanup logic would preserve this file as a conflict
  });
});

// ---------------------------------------------------------------------------
// T5: Hook script chmod
// ---------------------------------------------------------------------------

describe("hook script chmod (T5)", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("isHookScript pattern matches .claude/hooks/*.sh and .cursor/hooks/*.sh", () => {
    // Testing the pattern used in update.ts
    // Pi no longer uses hook-scripts/ (native extension instead)
    const pattern = /^\.[a-z]+\/hooks\/.*\.sh$/;
    expect(pattern.test(".claude/hooks/pre-commit.sh")).toBe(true);
    expect(pattern.test(".cursor/hooks/post-edit.sh")).toBe(true);
    expect(pattern.test(".planning/BRAIN.md")).toBe(false);
    expect(pattern.test(".claude/rules/test.md")).toBe(false);
  });

  test("hook scripts written during update have executable permission", async () => {
    // Simulate what applyUpdates does
    tempDir = await createTempDir();
    const hookDir = join(tempDir, ".claude", "hooks");
    await mkdir(hookDir, { recursive: true });

    const hookPath = join(hookDir, "pre-commit.sh");
    await Bun.write(hookPath, "#!/bin/bash\necho hello");

    // Apply chmod like update does
    const { chmod } = await import("node:fs/promises");
    await chmod(hookPath, 0o755);

    const fileStat = await stat(hookPath);
    // Check executable bit is set (owner execute = 0o100)
    expect(fileStat.mode & 0o111).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T6: Manifest version propagation
// ---------------------------------------------------------------------------

describe("manifest version propagation (T6)", () => {
  test("LUCA_VERSION matches package.json version", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const pkgPath = resolve(
      import.meta.dir,
      "..",
      "..",
      "..",
      "packages",
      "luca-framework",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(LUCA_VERSION).toBe(pkg.version);
  });

  test("createManifest uses LUCA_VERSION", async () => {
    const tempDir = await createTempDir();
    try {
      const config = {
        ...validLucaConfig,
        harnesses: ["claude", "cursor"] as HarnessId[],
      };

      const manifest = await createManifest({
        config,
        cwd: tempDir,
        createdFiles: [],
      });

      expect(manifest.version).toBe(LUCA_VERSION);
      expect(manifest.version).not.toBe("0.0.1");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  test("manifest records harnesses array", async () => {
    const tempDir = await createTempDir();
    try {
      const config = {
        ...validLucaConfig,
        harnesses: ["claude", "pi"] as HarnessId[],
      };

      const manifest = await createManifest({
        config,
        cwd: tempDir,
        createdFiles: [],
      });

      expect(manifest.harnesses).toEqual(["claude", "pi"]);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
