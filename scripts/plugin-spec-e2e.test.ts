#!/usr/bin/env bun

/**
 * plugin-spec-e2e.test.ts -- End-to-end static spec-conformance suite
 * that simulates what Claude Code would validate when loading a plugin.
 *
 * Covers TEST-05: Plugin load readiness validation.
 *
 * This test acts as the "load test" by combining all spec-conformance
 * checks into a single cohesive validation. It correlates data across
 * multiple plugin components (manifest, skills, agents, hooks, scripts,
 * marketplace, README) to verify the plugin would be accepted by
 * Claude Code's discovery and loading mechanism.
 *
 * Unlike check-drift.test.ts (which validates source-to-output parity),
 * this file validates that the *assembled plugin* is internally consistent
 * and structurally ready for Claude Code consumption.
 */

import { describe, test, expect } from "bun:test";
import path from "path";

import {
  pluginManifestSchema,
  KEBAB_CASE_REGEX,
} from "../src/compilers/plugin.types";
import {
  VALID_CLAUDE_CODE_EVENTS,
  PLUGIN_ROOT,
  extractFrontmatter,
  readText,
  fileExists,
  isDirectory,
  listDir,
  listSubdirs,
  readJson,
} from "./test-helpers";

// ---------------------------------------------------------------------------
// TEST-05: End-to-End Plugin Spec-Conformance
// ---------------------------------------------------------------------------

describe("End-to-End Plugin Spec-Conformance (TEST-05)", () => {
  // -------------------------------------------------------------------------
  // Plugin Discovery
  // -------------------------------------------------------------------------

  describe("Plugin Discovery", () => {
    test("plugin root is a valid directory", async () => {
      expect(await isDirectory(PLUGIN_ROOT)).toBe(true);
    });

    test(".claude-plugin/plugin.json is discoverable and valid", async () => {
      const pluginJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "plugin.json",
      );
      expect(await fileExists(pluginJsonPath)).toBe(true);

      const parsed = await readJson(pluginJsonPath);
      const result = pluginManifestSchema.safeParse(parsed);

      if (!result.success) {
        console.error(
          "plugin.json Zod validation errors:",
          result.error.issues,
        );
      }

      expect(result.success).toBe(true);
    });

    test("plugin name from manifest matches directory convention", async () => {
      const pluginJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "plugin.json",
      );
      const parsed = await readJson<{ name: string }>(pluginJsonPath);

      expect(typeof parsed.name).toBe("string");
      expect(parsed.name.length).toBeGreaterThan(0);
      expect(KEBAB_CASE_REGEX.test(parsed.name)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Component Auto-Discovery
  // -------------------------------------------------------------------------

  describe("Component Auto-Discovery", () => {
    test("all discovered skills are loadable", async () => {
      const skillsDir = path.join(PLUGIN_ROOT, "skills");
      const skillDirs = await listSubdirs(skillsDir);

      const failures: string[] = [];

      for (const dir of skillDirs) {
        const skillMdPath = path.join(skillsDir, dir, "SKILL.md");

        // SKILL.md must exist
        if (!(await fileExists(skillMdPath))) {
          failures.push(`${dir}/: missing SKILL.md`);
          continue;
        }

        const content = await readText(skillMdPath);

        // Must start with frontmatter
        if (!content.startsWith("---\n")) {
          failures.push(`${dir}/SKILL.md: does not start with frontmatter`);
          continue;
        }

        // Frontmatter must have non-empty description
        const fm = extractFrontmatter(content);
        if (!fm || !fm.description || fm.description.trim().length === 0) {
          failures.push(
            `${dir}/SKILL.md: missing or empty description in frontmatter`,
          );
        }

        // Subdirectory name must be kebab-case
        if (!KEBAB_CASE_REGEX.test(dir)) {
          failures.push(`${dir}/: directory name is not kebab-case`);
        }
      }

      if (failures.length > 0) {
        console.error(
          "Skill loadability failures:\n" +
            failures.map((f) => `  - ${f}`).join("\n"),
        );
      }

      expect(failures).toEqual([]);
    });

    test("all discovered agents are loadable", async () => {
      const agentsDir = path.join(PLUGIN_ROOT, "agents");
      const agentFiles = (await listDir(agentsDir)).filter((f) =>
        f.endsWith(".md"),
      );

      const failures: string[] = [];

      for (const file of agentFiles) {
        const filePath = path.join(agentsDir, file);
        const content = await readText(filePath);

        // Non-trivial content (> 50 bytes)
        if (content.length <= 50) {
          failures.push(
            `${file}: content too short (${content.length} bytes, expected > 50)`,
          );
        }

        // Must contain a markdown heading
        if (!content.includes("# ")) {
          failures.push(`${file}: no markdown heading found`);
        }

        // Filename (minus .md) must be kebab-case
        const baseName = file.replace(/\.md$/, "");
        if (!KEBAB_CASE_REGEX.test(baseName)) {
          failures.push(`${file}: filename is not kebab-case`);
        }
      }

      if (failures.length > 0) {
        console.error(
          "Agent loadability failures:\n" +
            failures.map((f) => `  - ${f}`).join("\n"),
        );
      }

      expect(failures).toEqual([]);
    });

    test("hooks configuration is loadable", async () => {
      const hooksJsonPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
      expect(await fileExists(hooksJsonPath)).toBe(true);

      const hooksFile = await readJson<{
        hooks?: Record<string, any[]>;
      }>(hooksJsonPath);
      const failures: string[] = [];

      // Must have "hooks" property
      if (!hooksFile.hooks || typeof hooksFile.hooks !== "object") {
        failures.push('hooks.json missing top-level "hooks" property');
        expect(failures).toEqual([]);
        return;
      }

      const hooksJson = hooksFile.hooks;

      // All keys must be valid Claude Code event types
      for (const event of Object.keys(hooksJson)) {
        if (!VALID_CLAUDE_CODE_EVENTS.has(event)) {
          failures.push(`Invalid hook event type: "${event}"`);
        }
      }

      // Every hook entry must have type, command, timeout
      for (const [eventType, entries] of Object.entries(hooksJson)) {
        for (const group of entries) {
          if (!group.hooks || !Array.isArray(group.hooks)) {
            failures.push(`${eventType}: hook group missing "hooks" array`);
            continue;
          }
          for (const hook of group.hooks) {
            if (typeof hook.type !== "string") {
              failures.push(`${eventType}: hook missing "type" string field`);
            }
            if (typeof hook.command !== "string") {
              failures.push(
                `${eventType}: hook missing "command" string field`,
              );
            }
            if (typeof hook.timeout !== "number") {
              failures.push(
                `${eventType}: hook missing "timeout" number field`,
              );
            }

            // Command must use ${CLAUDE_PLUGIN_ROOT}/scripts/ prefix
            if (
              typeof hook.command === "string" &&
              !hook.command.startsWith("${CLAUDE_PLUGIN_ROOT}/scripts/")
            ) {
              failures.push(
                `${eventType}: command "${hook.command}" does not use \${CLAUDE_PLUGIN_ROOT}/scripts/ prefix`,
              );
            }

            // Referenced script must exist in dist/plugin/scripts/
            if (typeof hook.command === "string") {
              const scriptFilename = hook.command.split("/").pop();
              const scriptPath = path.join(
                PLUGIN_ROOT,
                "scripts",
                scriptFilename,
              );
              if (!(await fileExists(scriptPath))) {
                failures.push(
                  `${eventType}: referenced script "${scriptFilename}" not found in dist/plugin/scripts/`,
                );
              }
            }
          }
        }
      }

      if (failures.length > 0) {
        console.error(
          "Hooks loadability failures:\n" +
            failures.map((f) => `  - ${f}`).join("\n"),
        );
      }

      expect(failures).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-Component Consistency
  // -------------------------------------------------------------------------

  describe("Cross-Component Consistency", () => {
    test("marketplace plugin name matches plugin.json name", async () => {
      const pluginJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "plugin.json",
      );
      const marketplaceJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "marketplace.json",
      );

      const pluginJson = await readJson<{ name: string }>(pluginJsonPath);
      const marketplaceJson = await readJson<{
        plugins: Array<{ name: string }>;
      }>(marketplaceJsonPath);

      expect(marketplaceJson.plugins[0]!.name).toBe(pluginJson.name);
    });

    test("marketplace plugin version matches plugin.json version", async () => {
      const pluginJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "plugin.json",
      );
      const marketplaceJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "marketplace.json",
      );

      const pluginJson = await readJson<{ version: string }>(pluginJsonPath);
      const marketplaceJson = await readJson<{
        plugins: Array<{ version: string }>;
      }>(marketplaceJsonPath);

      expect(marketplaceJson.plugins[0]!.version).toBe(pluginJson.version);
    });

    test("plugin has a reasonable component count", async () => {
      const skillsDir = path.join(PLUGIN_ROOT, "skills");
      const agentsDir = path.join(PLUGIN_ROOT, "agents");
      const scriptsDir = path.join(PLUGIN_ROOT, "scripts");

      const skillCount = (await listSubdirs(skillsDir)).length;
      const agentCount = (await listDir(agentsDir)).filter((f) =>
        f.endsWith(".md"),
      ).length;
      const scriptCount = (await listDir(scriptsDir)).filter((f) =>
        f.endsWith(".sh"),
      ).length;

      expect(skillCount).toBeGreaterThan(0);
      expect(agentCount).toBeGreaterThan(0);
      expect(scriptCount).toBeGreaterThan(0);
    });

    test("README.md exists and references plugin capabilities", async () => {
      const readmePath = path.join(PLUGIN_ROOT, "README.md");
      expect(await fileExists(readmePath)).toBe(true);

      const content = await readText(readmePath);

      // Non-trivial content
      expect(content.length).toBeGreaterThan(100);

      // Contains the plugin name (capital L in README)
      expect(content).toContain("Luca");

      // References skill and agent capabilities
      expect(content).toContain("Skills");
      expect(content).toContain("Agents");
    });
  });

  // -------------------------------------------------------------------------
  // Plugin Load Readiness
  // -------------------------------------------------------------------------

  describe("Plugin Load Readiness", () => {
    test("plugin is ready for Claude Code loading", async () => {
      const issues: string[] = [];

      // 1. Manifest check
      const pluginJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "plugin.json",
      );
      if (!(await fileExists(pluginJsonPath))) {
        issues.push("FATAL: .claude-plugin/plugin.json not found");
      } else {
        const manifest =
          await readJson<Record<string, unknown>>(pluginJsonPath);
        const result = pluginManifestSchema.safeParse(manifest);
        if (!result.success) {
          issues.push(`plugin.json schema invalid: ${result.error.message}`);
        }
        // Claude Code auto-discovers components; manifest must NOT contain
        // explicit component arrays.
        for (const key of ["agents", "skills", "hooks"]) {
          if (key in manifest) {
            issues.push(`plugin.json has forbidden component array: ${key}`);
          }
        }
      }

      // 2. Required directories
      for (const dir of [
        ".claude-plugin",
        "agents",
        "skills",
        "hooks",
        "scripts",
      ]) {
        const dirPath = path.join(PLUGIN_ROOT, dir);
        if (!(await isDirectory(dirPath))) {
          issues.push(`Missing required directory: ${dir}/`);
        }
      }

      // 3. Skills have frontmatter with description
      const skillsDir = path.join(PLUGIN_ROOT, "skills");
      if (await isDirectory(skillsDir)) {
        for (const dir of await listSubdirs(skillsDir)) {
          const skillMd = path.join(skillsDir, dir, "SKILL.md");
          if (!(await fileExists(skillMd))) {
            issues.push(`Skill ${dir}/ missing SKILL.md`);
          } else {
            const content = await readText(skillMd);
            const fm = extractFrontmatter(content);
            if (!fm || !fm.description) {
              issues.push(
                `Skill ${dir}/SKILL.md missing description frontmatter`,
              );
            }
          }
        }
      }

      // 4. Hooks use valid events and ${CLAUDE_PLUGIN_ROOT}
      const hooksJsonPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
      if (await fileExists(hooksJsonPath)) {
        const hooksFile = await readJson<{
          hooks?: Record<string, unknown>;
        }>(hooksJsonPath);
        const hooksJson = hooksFile.hooks;
        if (hooksJson && typeof hooksJson === "object") {
          for (const event of Object.keys(hooksJson)) {
            if (!VALID_CLAUDE_CODE_EVENTS.has(event)) {
              issues.push(`Invalid hook event type: ${event}`);
            }
          }
        } else {
          issues.push('hooks.json missing "hooks" property');
        }
      }

      // 5. Agents are valid markdown with headings
      const agentsDir = path.join(PLUGIN_ROOT, "agents");
      if (await isDirectory(agentsDir)) {
        for (const file of (await listDir(agentsDir)).filter((f) =>
          f.endsWith(".md"),
        )) {
          const content = await readText(path.join(agentsDir, file));
          if (content.length <= 50) {
            issues.push(
              `Agent ${file}: content too short (${content.length} bytes)`,
            );
          }
          if (!content.includes("# ")) {
            issues.push(`Agent ${file}: no markdown heading found`);
          }
        }
      }

      // 6. Marketplace consistency
      const marketplaceJsonPath = path.join(
        PLUGIN_ROOT,
        ".claude-plugin",
        "marketplace.json",
      );
      if (
        (await fileExists(pluginJsonPath)) &&
        (await fileExists(marketplaceJsonPath))
      ) {
        const pluginJson = await readJson<{
          name: string;
          version: string;
        }>(pluginJsonPath);
        const marketplaceJson = await readJson<{
          plugins?: Array<{ name: string; version: string }>;
        }>(marketplaceJsonPath);
        if (
          marketplaceJson.plugins &&
          marketplaceJson.plugins.length > 0 &&
          marketplaceJson.plugins[0]!.name !== pluginJson.name
        ) {
          issues.push(
            `Marketplace plugin name "${marketplaceJson.plugins[0]!.name}" does not match plugin.json name "${pluginJson.name}"`,
          );
        }
        if (
          marketplaceJson.plugins &&
          marketplaceJson.plugins.length > 0 &&
          marketplaceJson.plugins[0]!.version !== pluginJson.version
        ) {
          issues.push(
            `Marketplace plugin version "${marketplaceJson.plugins[0]!.version}" does not match plugin.json version "${pluginJson.version}"`,
          );
        }
      }

      if (issues.length > 0) {
        console.error(
          "Plugin load readiness check FAILED:\n" +
            issues.map((i) => `  - ${i}`).join("\n"),
        );
      }

      expect(issues).toEqual([]);
    });

    test("plugin component summary", async () => {
      const skillsDir = path.join(PLUGIN_ROOT, "skills");
      const agentsDir = path.join(PLUGIN_ROOT, "agents");
      const scriptsDir = path.join(PLUGIN_ROOT, "scripts");

      const skillCount = (await listSubdirs(skillsDir)).length;
      const agentCount = (await listDir(agentsDir)).filter((f) =>
        f.endsWith(".md"),
      ).length;
      const scriptCount = (await listDir(scriptsDir)).filter((f) =>
        f.endsWith(".sh"),
      ).length;

      console.log(
        [
          "",
          "Plugin Component Summary",
          "========================",
          `  Skills:  ${skillCount}`,
          `  Agents:  ${agentCount}`,
          `  Scripts: ${scriptCount}`,
          "",
        ].join("\n"),
      );

      expect(skillCount).toBeGreaterThan(0);
      expect(agentCount).toBeGreaterThan(0);
      expect(scriptCount).toBeGreaterThan(0);
    });
  });
});
