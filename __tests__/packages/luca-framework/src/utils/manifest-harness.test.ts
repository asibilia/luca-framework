import { describe, test, expect, afterEach } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  createManifest,
  readManifest,
  writeManifest,
} from "../../../../../packages/luca-framework/src/utils/manifest";
import {
  setupTempProject,
  cleanupTempDir,
  createTempDir,
} from "../../../../utils/temp-dir";
import {
  validLucaConfig,
  validBrandingConfig,
  validLucaManifest,
} from "../../../../utils/fixtures";
import type {
  LucaManifest,
  LucaConfig,
} from "../../../../../packages/luca-framework/src/types";

// ---------------------------------------------------------------------------
// createManifest — harnesses field
// ---------------------------------------------------------------------------

describe("createManifest — harnesses field", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("includes harnesses from config", async () => {
    tempDir = await createTempDir();

    const config: LucaConfig = {
      ...validLucaConfig,
      harnesses: ["claude", "cursor", "pi"],
    };

    const manifest = await createManifest({
      config,
      cwd: tempDir,
      createdFiles: [],
    });

    expect(manifest.harnesses).toEqual(["claude", "cursor", "pi"]);
  });

  test("defaults harnesses to claude and cursor when not specified", async () => {
    tempDir = await createTempDir();

    const config: LucaConfig = {
      ...validLucaConfig,
    };
    delete (config as unknown as Record<string, unknown>).harnesses;

    const manifest = await createManifest({
      config,
      cwd: tempDir,
      createdFiles: [],
    });

    expect(manifest.harnesses).toEqual(["claude", "cursor"]);
  });

  test("includes single harness when only one specified", async () => {
    tempDir = await createTempDir();

    const config: LucaConfig = {
      ...validLucaConfig,
      harnesses: ["pi"],
    };

    const manifest = await createManifest({
      config,
      cwd: tempDir,
      createdFiles: [],
    });

    expect(manifest.harnesses).toEqual(["pi"]);
  });
});

// ---------------------------------------------------------------------------
// readManifest — backward compatibility (no harnesses field)
// ---------------------------------------------------------------------------

describe("readManifest — harnesses backward compatibility", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("reads manifest without harnesses field (old format)", async () => {
    const oldManifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      files: {},
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(oldManifest),
    });

    const result = await readManifest(tempDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("0.0.1");
    // harnesses field should be undefined (not present in old manifest)
    expect(result!.harnesses).toBeUndefined();
  });

  test("reads manifest with harnesses field (new format)", async () => {
    const newManifest = {
      version: "0.0.1",
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      branding: validBrandingConfig,
      stack: "node-ts",
      workTracker: "none",
      harnesses: ["claude", "pi"],
      files: {},
    };

    tempDir = await setupTempProject({
      ".planning/manifest.json": JSON.stringify(newManifest),
    });

    const result = await readManifest(tempDir);
    expect(result).not.toBeNull();
    expect(result!.harnesses).toEqual(["claude", "pi"]);
  });
});

// ---------------------------------------------------------------------------
// writeManifest + readManifest — harnesses roundtrip
// ---------------------------------------------------------------------------

describe("manifest harnesses roundtrip", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("harnesses field survives write+read cycle", async () => {
    tempDir = await setupTempProject({
      ".planning/.gitkeep": "",
    });

    const manifest: LucaManifest = {
      ...validLucaManifest,
      harnesses: ["claude", "cursor", "pi"],
      files: {},
    };

    await writeManifest(manifest, tempDir);
    const result = await readManifest(tempDir);

    expect(result).not.toBeNull();
    expect(result!.harnesses).toEqual(["claude", "cursor", "pi"]);
  });

  test("manifest without harnesses survives write+read cycle", async () => {
    tempDir = await setupTempProject({
      ".planning/.gitkeep": "",
    });

    // Manifest without harnesses field
    const manifest: LucaManifest = {
      ...validLucaManifest,
      files: {},
    };
    delete (manifest as unknown as Record<string, unknown>).harnesses;

    await writeManifest(manifest, tempDir);
    const result = await readManifest(tempDir);

    expect(result).not.toBeNull();
    expect(result!.harnesses).toBeUndefined();
  });

  test("written JSON includes harnesses as array", async () => {
    tempDir = await setupTempProject({
      ".planning/.gitkeep": "",
    });

    const manifest: LucaManifest = {
      ...validLucaManifest,
      harnesses: ["pi"],
      files: {},
    };

    await writeManifest(manifest, tempDir);

    const raw = await readFile(
      join(tempDir, ".planning", "manifest.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.harnesses).toEqual(["pi"]);
  });
});
