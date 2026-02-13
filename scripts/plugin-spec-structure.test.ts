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
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import path from "path";

import {
  pluginManifestSchema,
  KEBAB_CASE_REGEX,
} from "../src/compilers/plugin.types";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");

// ---------------------------------------------------------------------------
// TEST-01: Plugin Directory Structure
// ---------------------------------------------------------------------------

describe("Plugin Directory Structure (TEST-01)", () => {
  test("required top-level directories exist", () => {
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
      if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
        missing.push(dir);
      }
    }

    expect(missing).toEqual([]);
  });

  test("agents directory contains only .md files", () => {
    const agentsDir = path.join(PLUGIN_ROOT, "agents");
    const entries = readdirSync(agentsDir);
    const nonMd = entries.filter((f) => !f.endsWith(".md"));

    expect(nonMd).toEqual([]);
  });

  test("skills directory contains only subdirectories with SKILL.md", () => {
    const skillsDir = path.join(PLUGIN_ROOT, "skills");
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const problems: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        problems.push(`${entry.name}: not a directory`);
        continue;
      }
      const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillMdPath)) {
        problems.push(`${entry.name}: missing SKILL.md`);
      }
    }

    expect(problems).toEqual([]);
  });

  test("hooks directory contains hooks.json", () => {
    const hooksJsonPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
    expect(existsSync(hooksJsonPath)).toBe(true);

    // Verify it is valid JSON
    const content = readFileSync(hooksJsonPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
  });

  test("scripts directory contains only .sh files", () => {
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");
    const entries = readdirSync(scriptsDir);
    const nonSh = entries.filter((f) => !f.endsWith(".sh"));

    expect(nonSh).toEqual([]);
  });

  test("no unexpected top-level entries", () => {
    const entries = readdirSync(PLUGIN_ROOT);
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

  test("plugin.json is valid JSON", () => {
    const content = readFileSync(pluginJsonPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe("object");
  });

  test("plugin.json passes Zod schema validation", () => {
    const content = readFileSync(pluginJsonPath, "utf8");
    const parsed = JSON.parse(content);
    const result = pluginManifestSchema.safeParse(parsed);

    if (!result.success) {
      // Provide helpful error output on failure
      console.error("Zod validation errors:", result.error.issues);
    }

    expect(result.success).toBe(true);
  });

  test("plugin.json name is kebab-case", () => {
    const content = readFileSync(pluginJsonPath, "utf8");
    const parsed = JSON.parse(content);

    expect(KEBAB_CASE_REGEX.test(parsed.name)).toBe(true);
  });

  test("plugin.json has no component arrays", () => {
    const content = readFileSync(pluginJsonPath, "utf8");
    const parsed = JSON.parse(content);

    // Claude Code auto-discovers from directories; manifest must NOT
    // contain explicit component arrays.
    const forbiddenKeys = ["commands", "agents", "skills", "hooks"];
    const found = forbiddenKeys.filter((key) => key in parsed);

    expect(found).toEqual([]);
  });

  test("plugin.json contains only spec-valid fields", () => {
    const content = readFileSync(pluginJsonPath, "utf8");
    const parsed = JSON.parse(content);

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

    test("marketplace.json is valid JSON", () => {
      const content = readFileSync(marketplaceJsonPath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
    });

    test("marketplace.json has required root fields", () => {
      const content = readFileSync(marketplaceJsonPath, "utf8");
      const parsed = JSON.parse(content);

      expect(typeof parsed.name).toBe("string");
      expect(parsed.name.length).toBeGreaterThan(0);

      expect(typeof parsed.owner).toBe("object");
      expect(parsed.owner).not.toBeNull();
      expect(typeof parsed.owner.name).toBe("string");
      expect(parsed.owner.name.length).toBeGreaterThan(0);
    });

    test("marketplace.json has plugins array", () => {
      const content = readFileSync(marketplaceJsonPath, "utf8");
      const parsed = JSON.parse(content);

      expect(Array.isArray(parsed.plugins)).toBe(true);
      expect(parsed.plugins.length).toBeGreaterThanOrEqual(1);
    });

    test("each plugin entry has required fields", () => {
      const content = readFileSync(marketplaceJsonPath, "utf8");
      const parsed = JSON.parse(content);
      const problems: string[] = [];

      for (let i = 0; i < parsed.plugins.length; i++) {
        const plugin = parsed.plugins[i];
        if (typeof plugin.name !== "string" || plugin.name.length === 0) {
          problems.push(`plugins[${i}]: missing or invalid name`);
        }
        if (typeof plugin.source !== "string" || plugin.source.length === 0) {
          problems.push(`plugins[${i}]: missing or invalid source`);
        }
      }

      expect(problems).toEqual([]);
    });

    test("plugin entry name is kebab-case", () => {
      const content = readFileSync(marketplaceJsonPath, "utf8");
      const parsed = JSON.parse(content);
      const problems: string[] = [];

      for (let i = 0; i < parsed.plugins.length; i++) {
        const plugin = parsed.plugins[i];
        if (!KEBAB_CASE_REGEX.test(plugin.name)) {
          problems.push(
            `plugins[${i}].name "${plugin.name}" is not kebab-case`,
          );
        }
      }

      expect(problems).toEqual([]);
    });

    test("marketplace.json $schema is valid if present", () => {
      const content = readFileSync(marketplaceJsonPath, "utf8");
      const parsed = JSON.parse(content);

      if ("$schema" in parsed) {
        expect(typeof parsed.$schema).toBe("string");
      }
    });
  });
});
