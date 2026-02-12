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
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "path";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "dist", "plugin");

/**
 * Complete set of valid Claude Code hook event types.
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/hooks
 */
const VALID_CLAUDE_CODE_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentTool",
  "SessionStart",
  "SessionEnd",
]);

/**
 * Extracts simple YAML frontmatter key-value pairs from markdown content.
 *
 * Handles the `---` delimited frontmatter block at the start of a file.
 * Only parses single-line `key: value` pairs (sufficient for SKILL.md
 * description fields).
 *
 * @param content - Raw markdown file content
 * @returns Parsed key-value pairs, or null if no frontmatter found
 */
function extractFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      fields[key] = value;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Load hooks.json once for all hook-related tests
// ---------------------------------------------------------------------------

const hooksJsonPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
const hooksFile = JSON.parse(readFileSync(hooksJsonPath, "utf8"));
const hooksJson = hooksFile.hooks;

// ---------------------------------------------------------------------------
// TEST-03: Hook Event Type Validation & Path Resolution
// ---------------------------------------------------------------------------

describe("Hook Event Type Validation (TEST-03)", () => {
  test("hooks.json contains only valid Claude Code event types", () => {
    const eventTypes = Object.keys(hooksJson);
    const invalid = eventTypes.filter(
      (event) => !VALID_CLAUDE_CODE_EVENTS.has(event),
    );

    expect(invalid).toEqual([]);
  });

  test("every hook entry has required fields (type, command, timeout)", () => {
    const violations: string[] = [];

    for (const [eventType, entries] of Object.entries(hooksJson)) {
      for (const group of entries as any[]) {
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

  test('every hook entry type is "command"', () => {
    const nonCommandTypes: string[] = [];

    for (const [eventType, entries] of Object.entries(hooksJson)) {
      for (const group of entries as any[]) {
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

  test("all hook commands use ${CLAUDE_PLUGIN_ROOT} path prefix", () => {
    const commands: string[] = [];
    for (const entries of Object.values(hooksJson)) {
      for (const group of entries as any[]) {
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

  test("every referenced script exists in dist/plugin/scripts/", () => {
    const missing: string[] = [];
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");

    for (const entries of Object.values(hooksJson)) {
      for (const group of entries as any[]) {
        for (const hook of group.hooks) {
          const filename = hook.command.split("/").pop();
          const scriptPath = path.join(scriptsDir, filename);
          if (!existsSync(scriptPath)) {
            missing.push(
              `${filename} (referenced in hooks.json but not found)`,
            );
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test("every script in dist/plugin/scripts/ is referenced by hooks.json", () => {
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");
    const allScripts = readdirSync(scriptsDir).filter((f) => f.endsWith(".sh"));

    // Collect all referenced script filenames from hooks.json
    const referencedScripts = new Set<string>();
    for (const entries of Object.values(hooksJson)) {
      for (const group of entries as any[]) {
        for (const hook of group.hooks) {
          const filename = hook.command.split("/").pop();
          referencedScripts.add(filename);
        }
      }
    }

    const orphans = allScripts.filter((s) => !referencedScripts.has(s));

    expect(orphans).toEqual([]);
  });

  test("all hook scripts are executable shell files", () => {
    const scriptsDir = path.join(PLUGIN_ROOT, "scripts");
    const allScripts = readdirSync(scriptsDir).filter((f) => f.endsWith(".sh"));
    const violations: string[] = [];

    for (const script of allScripts) {
      const content = readFileSync(path.join(scriptsDir, script), "utf8");
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
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  test("every SKILL.md has YAML frontmatter", () => {
    const violations: string[] = [];

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!existsSync(skillMdPath)) {
        violations.push(`${dir}/SKILL.md: file does not exist`);
        continue;
      }
      const content = readFileSync(skillMdPath, "utf8");
      if (!content.startsWith("---\n")) {
        violations.push(
          `${dir}/SKILL.md: does not start with YAML frontmatter`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("every SKILL.md frontmatter has a description field", () => {
    const violations: string[] = [];

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;
      const content = readFileSync(skillMdPath, "utf8");
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

  test("no SKILL.md has empty or whitespace-only description", () => {
    const violations: string[] = [];

    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;
      const content = readFileSync(skillMdPath, "utf8");
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
  const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

  test("every agent .md has non-trivial content", () => {
    const violations: string[] = [];

    for (const file of agentFiles) {
      const content = readFileSync(path.join(agentsDir, file), "utf8");
      if (content.length <= 50) {
        violations.push(
          `${file}: content too short (${content.length} chars, expected > 50)`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("every agent .md has a markdown heading", () => {
    const violations: string[] = [];

    for (const file of agentFiles) {
      const content = readFileSync(path.join(agentsDir, file), "utf8");
      if (!content.includes("# ")) {
        violations.push(`${file}: no markdown heading found`);
      }
    }

    expect(violations).toEqual([]);
  });
});
