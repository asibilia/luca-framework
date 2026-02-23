#!/usr/bin/env bun

/**
 * plugin-spec-hooks-format.test.ts — Validates hook spec conformance,
 * path resolution, event type validity, and compiled SKILL.md / agent .md
 * frontmatter format in the dist/plugin/ output.
 *
 * Covers TEST-03 (hook path resolution & event type validation)
 * and TEST-04 (skill/agent compilation format parity).
 *
 * Unlike check-drift.test.ts (which validates content parity between
 * source registries and output files), this file validates that the
 * *format and structure* of compiled outputs conform to Claude Code
 * plugin specifications.
 */

import { describe, test, expect } from "bun:test";
import path from "path";

import {
  VALID_CLAUDE_CODE_EVENTS,
  PLUGIN_ROOT,
  extractFrontmatter,
  readText,
  fileExists,
  listDir,
  listSubdirs,
  readJson,
} from "../../scripts/test-helpers";

// ---------------------------------------------------------------------------
// Load hooks.json once for all hook-related tests
// ---------------------------------------------------------------------------

const hooksJsonPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");

// ---------------------------------------------------------------------------
// TEST-03: Hook Event Type Validation & Path Resolution
// ---------------------------------------------------------------------------

describe("Hook Event Type Validation (TEST-03)", () => {
  let hooksJson: Record<string, any[]>;

  // Use a shared async load since we can't use top-level await with sync readFileSync anymore
  async function getHooksJson() {
    if (!hooksJson) {
      const hooksFile = await readJson<{ hooks: Record<string, any[]> }>(
        hooksJsonPath,
      );
      hooksJson = hooksFile.hooks;
    }
    return hooksJson;
  }

  test("hooks.json contains only valid Claude Code event types", async () => {
    const hooks = await getHooksJson();
    const eventTypes = Object.keys(hooks);
    const invalid = eventTypes.filter(
      (event) => !VALID_CLAUDE_CODE_EVENTS.has(event),
    );

    expect(invalid).toEqual([]);
  });

  test("every hook entry has required fields (type, command, timeout)", async () => {
    const hooks = await getHooksJson();
    const violations: string[] = [];

    for (const [eventType, entries] of Object.entries(hooks)) {
      for (const group of entries) {
        for (const hook of group.hooks) {
          if (typeof hook.type !== "string") {
            violations.push(`${eventType}: hook missing "type" string field`);
          }
          if (typeof hook.command !== "string") {
            violations.push(
              `${eventType}: hook missing "command" string field`,
            );
          }
          if (typeof hook.timeout !== "number") {
            violations.push(
              `${eventType}: hook missing "timeout" number field`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('every hook entry type is "command"', async () => {
    const hooks = await getHooksJson();
    const nonCommandTypes: string[] = [];

    for (const [eventType, entries] of Object.entries(hooks)) {
      for (const group of entries) {
        for (const hook of group.hooks) {
          if (hook.type !== "command") {
            nonCommandTypes.push(
              `${eventType}: hook has type "${hook.type}" instead of "command"`,
            );
          }
        }
      }
    }

    expect(nonCommandTypes).toEqual([]);
  });

  test("all hook commands use ${CLAUDE_PLUGIN_ROOT} path prefix", async () => {
    const hooks = await getHooksJson();
    const commands: string[] = [];
    for (const entries of Object.values(hooks)) {
      for (const group of entries) {
        for (const hook of group.hooks) {
          commands.push(hook.command);
        }
      }
    }

    const violations = commands.filter(
      (cmd) => !cmd.startsWith("${CLAUDE_PLUGIN_ROOT}/scripts/"),
    );

    expect(violations).toEqual([]);
  });

  test("every referenced script exists in dist/plugin/scripts/", async () => {
    const hooks = await getHooksJson();
    const missing: string[] = [];
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");

    for (const entries of Object.values(hooks)) {
      for (const group of entries) {
        for (const hook of group.hooks) {
          const filename = hook.command.split("/").pop();
          const scriptPath = path.join(scriptsDir, filename);
          if (!(await fileExists(scriptPath))) {
            missing.push(
              `${filename} (referenced in hooks.json but not found)`,
            );
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test("every script in dist/plugin/scripts/ is referenced by hooks.json", async () => {
    const hooks = await getHooksJson();
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");
    const allScripts = (await listDir(scriptsDir)).filter((f) =>
      f.endsWith(".sh"),
    );

    // Collect all referenced script filenames from hooks.json
    const referencedScripts = new Set<string>();
    for (const entries of Object.values(hooks)) {
      for (const group of entries) {
        for (const hook of group.hooks) {
          const filename = hook.command.split("/").pop();
          referencedScripts.add(filename);
        }
      }
    }

    const orphans = allScripts.filter((s) => !referencedScripts.has(s));

    expect(orphans).toEqual([]);
  });

  test("all hook scripts are executable shell files", async () => {
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");
    const allScripts = (await listDir(scriptsDir)).filter((f) =>
      f.endsWith(".sh"),
    );
    const violations: string[] = [];

    for (const script of allScripts) {
      const content = await readText(path.join(scriptsDir, script));
      const firstLine = content.split("\n")[0] ?? "";
      if (
        !firstLine.startsWith("#!/usr/bin/env bash") &&
        !firstLine.startsWith("#!/bin/bash")
      ) {
        violations.push(
          `${script}: first line is "${firstLine}" (expected shebang)`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TEST-04: SKILL.md Frontmatter Validation
// ---------------------------------------------------------------------------

describe("SKILL.md Frontmatter Validation (TEST-04)", () => {
  const skillsDir = path.join(PLUGIN_ROOT, "skills");

  test("every SKILL.md has YAML frontmatter", async () => {
    const skillDirs = await listSubdirs(skillsDir);
    const violations: string[] = [];

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!(await fileExists(skillMdPath))) {
        violations.push(`${dir}/SKILL.md: file does not exist`);
        continue;
      }
      const content = await readText(skillMdPath);
      if (!content.startsWith("---\n")) {
        violations.push(
          `${dir}/SKILL.md: does not start with YAML frontmatter`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("every SKILL.md frontmatter has a description field", async () => {
    const skillDirs = await listSubdirs(skillsDir);
    const violations: string[] = [];

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!(await fileExists(skillMdPath))) continue;
      const content = await readText(skillMdPath);
      const fields = extractFrontmatter(content);

      if (!fields) {
        violations.push(`${dir}/SKILL.md: no frontmatter found`);
        continue;
      }
      if (!fields.description) {
        violations.push(
          `${dir}/SKILL.md: frontmatter missing "description" field`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("no SKILL.md has empty or whitespace-only description", async () => {
    const skillDirs = await listSubdirs(skillsDir);
    const violations: string[] = [];

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!(await fileExists(skillMdPath))) continue;
      const content = await readText(skillMdPath);
      const fields = extractFrontmatter(content);

      if (fields && fields.description !== undefined) {
        if (fields.description.trim().length === 0) {
          violations.push(
            `${dir}/SKILL.md: description is empty or whitespace-only`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TEST-04: Agent .md Content Validation
// ---------------------------------------------------------------------------

describe("Agent .md Content Validation (TEST-04)", () => {
  const agentsDir = path.join(PLUGIN_ROOT, "agents");

  test("every agent .md has non-trivial content", async () => {
    const agentFiles = (await listDir(agentsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    const violations: string[] = [];

    for (const file of agentFiles) {
      const content = await readText(path.join(agentsDir, file));
      if (content.length <= 50) {
        violations.push(
          `${file}: content too short (${content.length} chars, expected > 50)`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("every agent .md has a markdown heading", async () => {
    const agentFiles = (await listDir(agentsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    const violations: string[] = [];

    for (const file of agentFiles) {
      const content = await readText(path.join(agentsDir, file));
      if (!content.includes("# ")) {
        violations.push(`${file}: no markdown heading found`);
      }
    }

    expect(violations).toEqual([]);
  });
});
