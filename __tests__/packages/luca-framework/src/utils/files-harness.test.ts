import { describe, test, expect, afterEach } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { installClackMock } from "../../../../utils/mock-clack";
import { createTempDir, cleanupTempDir } from "../../../../utils/temp-dir";
import { validLucaConfig } from "../../../../utils/fixtures";
import type { LucaConfig } from "../../../../../packages/luca-framework/src/types";

// Install clack mock before importing files.ts (it imports @clack/prompts at top level)
installClackMock({});

// ---------------------------------------------------------------------------
// generateFiles — conditional harness directory creation
// ---------------------------------------------------------------------------

describe("generateFiles — harness-conditional directories", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("creates .claude dir when claude harness selected", async () => {
    tempDir = await createTempDir();
    const { generateFiles } =
      await import("../../../../../packages/luca-framework/src/utils/files");

    const config: LucaConfig = {
      ...validLucaConfig,
      stack: "custom",
      harnesses: ["claude"],
    };

    await generateFiles({ config, cwd: tempDir });

    // .claude should exist with hooks installed
    expect(existsSync(join(tempDir, ".claude"))).toBe(true);
    // Cursor harness-specific dirs should NOT exist (agents/rules/skills are conditional)
    expect(existsSync(join(tempDir, ".cursor", "agents"))).toBe(false);
    expect(existsSync(join(tempDir, ".cursor", "rules"))).toBe(false);
    expect(existsSync(join(tempDir, ".pi"))).toBe(false);
  });

  test("creates .cursor dirs when cursor harness selected", async () => {
    tempDir = await createTempDir();
    const { generateFiles } =
      await import("../../../../../packages/luca-framework/src/utils/files");

    const config: LucaConfig = {
      ...validLucaConfig,
      stack: "custom",
      harnesses: ["cursor"],
    };

    await generateFiles({ config, cwd: tempDir });

    // .cursor subdirectories should exist (harness-specific)
    expect(existsSync(join(tempDir, ".cursor", "luca"))).toBe(true);
    expect(existsSync(join(tempDir, ".cursor", "agents"))).toBe(true);
    expect(existsSync(join(tempDir, ".cursor", "rules"))).toBe(true);
    expect(existsSync(join(tempDir, ".cursor", "skills"))).toBe(true);
    // Claude hooks dir should NOT exist (not selected)
    expect(existsSync(join(tempDir, ".claude", "hooks"))).toBe(false);
    expect(existsSync(join(tempDir, ".pi"))).toBe(false);
  });

  test("creates .pi dir when pi harness selected", async () => {
    tempDir = await createTempDir();
    const { generateFiles } =
      await import("../../../../../packages/luca-framework/src/utils/files");

    const config: LucaConfig = {
      ...validLucaConfig,
      stack: "custom",
      harnesses: ["pi"],
    };

    await generateFiles({ config, cwd: tempDir });

    // .pi should exist
    expect(existsSync(join(tempDir, ".pi"))).toBe(true);
    // Harness-specific dirs should NOT exist for unselected harnesses
    expect(existsSync(join(tempDir, ".claude", "hooks"))).toBe(false);
    expect(existsSync(join(tempDir, ".cursor", "agents"))).toBe(false);
  });

  test("creates all dirs when all harnesses selected", async () => {
    tempDir = await createTempDir();
    const { generateFiles } =
      await import("../../../../../packages/luca-framework/src/utils/files");

    const config: LucaConfig = {
      ...validLucaConfig,
      stack: "custom",
      harnesses: ["claude", "cursor", "pi"],
    };

    await generateFiles({ config, cwd: tempDir });

    expect(existsSync(join(tempDir, ".claude"))).toBe(true);
    expect(existsSync(join(tempDir, ".cursor"))).toBe(true);
    expect(existsSync(join(tempDir, ".pi"))).toBe(true);
  });

  test("defaults to claude and cursor when harnesses field missing", async () => {
    tempDir = await createTempDir();
    const { generateFiles } =
      await import("../../../../../packages/luca-framework/src/utils/files");

    // Config without harnesses field (backward compat)
    const config: LucaConfig = {
      ...validLucaConfig,
      stack: "custom",
    };
    delete (config as unknown as Record<string, unknown>).harnesses;

    await generateFiles({ config, cwd: tempDir });

    // Should default to claude + cursor
    expect(existsSync(join(tempDir, ".claude"))).toBe(true);
    expect(existsSync(join(tempDir, ".cursor"))).toBe(true);
    expect(existsSync(join(tempDir, ".pi"))).toBe(false);
  });

  test("always creates .planning directory regardless of harness selection", async () => {
    tempDir = await createTempDir();
    const { generateFiles } =
      await import("../../../../../packages/luca-framework/src/utils/files");

    const config: LucaConfig = {
      ...validLucaConfig,
      stack: "custom",
      harnesses: ["pi"],
    };

    await generateFiles({ config, cwd: tempDir });

    expect(existsSync(join(tempDir, ".planning"))).toBe(true);
  });
});
