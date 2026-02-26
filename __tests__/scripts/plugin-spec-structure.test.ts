#!/usr/bin/env bun

/**
 * plugin-spec-structure.test.ts — Validates that the dist/plugin/ output
 * conforms to the Claude Code plugin specification.
 *
 * Covers:
 *   TEST-01: Plugin directory structure validation
 *   TEST-02: Plugin manifest (plugin.json + marketplace.json) spec-conformance
 *
 * These tests answer: "If Claude Code loaded this plugin directory, would it
 * find everything it expects in the format it expects?"
 */

import { describe, test, expect } from "bun:test";
import path from "path";

import {
  pluginManifestSchema,
  KEBAB_CASE_REGEX,
} from "~/compilers/__schemas/compilers.schemas";
import {
  PLUGIN_ROOT,
  fileExists,
  isDirectory,
  listDir,
  listSubdirs,
  readJson,
} from "../../scripts/test-helpers";

// ---------------------------------------------------------------------------
// TEST-01: Plugin Directory Structure
// ---------------------------------------------------------------------------

describe("Plugin Directory Structure (TEST-01)", () => {
  test("required top-level directories exist", async () => {
    const requiredDirs = [
      ".claude-plugin",
      "agents",
      "skills",
      "hooks",
      "scripts",
    ];
    const missing: string[] = [];

    for (const dir of requiredDirs) {
      const dirPath = path.join(PLUGIN_ROOT, dir);
      if (!(await isDirectory(dirPath))) {
        missing.push(dir);
      }
    }

    expect(missing).toEqual([]);
  });

  test("agents directory contains only .md files", async () => {
    const agentsDir = path.join(PLUGIN_ROOT, "agents");
    const entries = await listDir(agentsDir);
    const nonMd = entries.filter((f) => !f.endsWith(".md"));

    expect(nonMd).toEqual([]);
  });

  test("skills directory contains only subdirectories with SKILL.md", async () => {
    const skillsDir = path.join(PLUGIN_ROOT, "skills");
    const entries = await listSubdirs(skillsDir);
    const problems: string[] = [];

    // Check non-directories
    const allEntries = await listDir(skillsDir);
    for (const entry of allEntries) {
      if (!(await isDirectory(path.join(skillsDir, entry)))) {
        problems.push(`${entry}: not a directory`);
      }
    }

    // Check each subdirectory has SKILL.md
    for (const dir of entries) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!(await fileExists(skillMdPath))) {
        problems.push(`${dir}: missing SKILL.md`);
      }
    }

    expect(problems).toEqual([]);
  });

  test("hooks directory contains hooks.json", async () => {
    const hooksJsonPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
    expect(await fileExists(hooksJsonPath)).toBe(true);

    // Verify it is valid JSON
    const parsed = await readJson(hooksJsonPath);
    expect(parsed).toBeDefined();
  });

  test("scripts directory contains only .sh files", async () => {
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");
    const entries = await listDir(scriptsDir);
    const nonSh = entries.filter((f) => !f.endsWith(".sh"));

    expect(nonSh).toEqual([]);
  });

  test("no unexpected top-level entries", async () => {
    const entries = await listDir(PLUGIN_ROOT);
    const expectedEntries = new Set([
      ".claude-plugin",
      "README.md",
      "agents",
      "commands",
      "hooks",
      "scripts",
      "skills",
    ]);
    const unexpected = entries.filter((e) => !expectedEntries.has(e));

    expect(unexpected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TEST-02: Plugin Manifest Spec-Conformance
// ---------------------------------------------------------------------------

describe("Plugin Manifest Spec-Conformance (TEST-02)", () => {
  const pluginJsonPath = path.join(
    PLUGIN_ROOT,
    ".claude-plugin",
    "plugin.json",
  );

  test("plugin.json is valid JSON", async () => {
    const parsed = await readJson(pluginJsonPath);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe("object");
  });

  test("plugin.json passes Zod schema validation", async () => {
    const parsed = await readJson(pluginJsonPath);
    const result = pluginManifestSchema.safeParse(parsed);

    if (!result.success) {
      console.error("Zod validation errors:", result.error.issues);
    }

    expect(result.success).toBe(true);
  });

  test("plugin.json name is kebab-case", async () => {
    const parsed = await readJson<{ name: string }>(pluginJsonPath);

    expect(KEBAB_CASE_REGEX.test(parsed.name)).toBe(true);
  });

  test("plugin.json has no component arrays", async () => {
    const parsed = await readJson<Record<string, unknown>>(pluginJsonPath);

    // Claude Code auto-discovers from directories; manifest must NOT
    // contain explicit component arrays.
    const forbiddenKeys = ["commands", "agents", "skills", "hooks"];
    const found = forbiddenKeys.filter((key) => key in parsed);

    expect(found).toEqual([]);
  });

  test("plugin.json contains only spec-valid fields", async () => {
    const parsed = await readJson<Record<string, unknown>>(pluginJsonPath);

    const validFields = new Set([
      "name",
      "version",
      "description",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
    ]);

    const unexpectedFields = Object.keys(parsed).filter(
      (key) => !validFields.has(key),
    );

    expect(unexpectedFields).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // marketplace.json
  // -------------------------------------------------------------------------

  describe("marketplace.json", () => {
    const marketplaceJsonPath = path.join(
      PLUGIN_ROOT,
      ".claude-plugin",
      "marketplace.json",
    );

    test("marketplace.json is valid JSON", async () => {
      const parsed = await readJson(marketplaceJsonPath);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
    });

    test("marketplace.json has required root fields", async () => {
      const parsed = await readJson<{
        name: string;
        owner: { name: string };
      }>(marketplaceJsonPath);

      expect(typeof parsed.name).toBe("string");
      expect(parsed.name.length).toBeGreaterThan(0);

      expect(typeof parsed.owner).toBe("object");
      expect(parsed.owner).not.toBeNull();
      expect(typeof parsed.owner.name).toBe("string");
      expect(parsed.owner.name.length).toBeGreaterThan(0);
    });

    test("marketplace.json has plugins array", async () => {
      const parsed = await readJson<{
        plugins: unknown[];
      }>(marketplaceJsonPath);

      expect(Array.isArray(parsed.plugins)).toBe(true);
      expect(parsed.plugins.length).toBeGreaterThanOrEqual(1);
    });

    test("each plugin entry has required fields", async () => {
      const parsed = await readJson<{
        plugins: Array<{ name?: string; source?: string }>;
      }>(marketplaceJsonPath);
      const problems: string[] = [];

      for (let i = 0; i < parsed.plugins.length; i++) {
        const plugin = parsed.plugins[i]!;
        if (typeof plugin.name !== "string" || plugin.name.length === 0) {
          problems.push(`plugins[${i}]: missing or invalid name`);
        }
        if (typeof plugin.source !== "string" || plugin.source.length === 0) {
          problems.push(`plugins[${i}]: missing or invalid source`);
        }
      }

      expect(problems).toEqual([]);
    });

    test("plugin entry name is kebab-case", async () => {
      const parsed = await readJson<{
        plugins: Array<{ name: string }>;
      }>(marketplaceJsonPath);
      const problems: string[] = [];

      for (let i = 0; i < parsed.plugins.length; i++) {
        const plugin = parsed.plugins[i]!;
        if (!KEBAB_CASE_REGEX.test(plugin.name)) {
          problems.push(
            `plugins[${i}].name "${plugin.name}" is not kebab-case`,
          );
        }
      }

      expect(problems).toEqual([]);
    });

    test("marketplace.json $schema is valid if present", async () => {
      const parsed =
        await readJson<Record<string, unknown>>(marketplaceJsonPath);

      if ("$schema" in parsed) {
        expect(typeof parsed.$schema).toBe("string");
      }
    });
  });
});
