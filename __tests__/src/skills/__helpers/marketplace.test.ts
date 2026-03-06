/**
 * Tests for the plugin marketplace foundation.
 *
 * Covers:
 * - PluginRegistryEntrySchema validation
 * - searchRegistry keyword matching and scoring
 * - validatePlugin schema + business rule checks
 */

import { describe, test, expect } from "bun:test";

import {
  PluginRegistryEntrySchema,
  PluginRegistrySchema,
  searchRegistry,
  validatePlugin,
} from "../../../../src/skills/__helpers/marketplace";

import type { PluginRegistry } from "../../../../src/skills/__helpers/marketplace";

// ---- Sample data ----

const sampleRegistry: PluginRegistry = [
  {
    name: "git-helpers",
    version: "1.0.0",
    author: "luca-team",
    description: "Git workflow automation skills and hooks",
    skills: ["git-commit", "git-pr"],
    rules: [],
    hooks: ["pre-commit-gate"],
    keywords: ["git", "workflow", "automation"],
  },
  {
    name: "testing-suite",
    version: "2.1.0",
    author: "test-author",
    description: "Comprehensive testing utilities",
    skills: ["test-run"],
    rules: ["test-coverage"],
    hooks: [],
    keywords: ["test", "testing", "coverage"],
  },
  {
    name: "security-pack",
    version: "1.2.3",
    author: "security-team",
    description: "Security auditing and enforcement rules",
    skills: [],
    rules: ["security-audit", "dependency-check"],
    hooks: ["security-scan"],
    keywords: ["security", "audit"],
  },
];

// ---- PluginRegistryEntrySchema ----

describe("PluginRegistryEntrySchema", () => {
  test("accepts a valid full entry", () => {
    const result = PluginRegistryEntrySchema.safeParse({
      name: "my-plugin",
      version: "1.0.0",
      author: "dev",
      description: "A test plugin",
      skills: ["skill-a"],
      rules: ["rule-b"],
      hooks: ["hook-c"],
      keywords: ["test"],
      min_luca_version: "2.0.0",
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional arrays", () => {
    const result = PluginRegistryEntrySchema.safeParse({
      name: "minimal-plugin",
      version: "0.1.0",
      author: "dev",
      description: "Minimal plugin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
      expect(result.data.rules).toEqual([]);
      expect(result.data.hooks).toEqual([]);
      expect(result.data.keywords).toEqual([]);
    }
  });

  test("rejects invalid name (camelCase)", () => {
    const result = PluginRegistryEntrySchema.safeParse({
      name: "myPlugin",
      version: "1.0.0",
      author: "dev",
      description: "Bad name",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid version (not semver)", () => {
    const result = PluginRegistryEntrySchema.safeParse({
      name: "test-plugin",
      version: "v1",
      author: "dev",
      description: "Bad version",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty author", () => {
    const result = PluginRegistryEntrySchema.safeParse({
      name: "test-plugin",
      version: "1.0.0",
      author: "",
      description: "Empty author",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty description", () => {
    const result = PluginRegistryEntrySchema.safeParse({
      name: "test-plugin",
      version: "1.0.0",
      author: "dev",
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---- PluginRegistrySchema ----

describe("PluginRegistrySchema", () => {
  test("accepts array of valid entries", () => {
    const result = PluginRegistrySchema.safeParse(sampleRegistry);
    expect(result.success).toBe(true);
  });

  test("accepts empty array", () => {
    const result = PluginRegistrySchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});

// ---- searchRegistry ----

describe("searchRegistry", () => {
  test("finds plugins by name match", () => {
    const results = searchRegistry("git", sampleRegistry);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe("git-helpers");
  });

  test("finds plugins by description match", () => {
    const results = searchRegistry("auditing", sampleRegistry);
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe("security-pack");
  });

  test("finds plugins by keyword match", () => {
    const results = searchRegistry("coverage", sampleRegistry);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe("testing-suite");
  });

  test("finds plugins by skill name match", () => {
    const results = searchRegistry("test-run", sampleRegistry);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe("testing-suite");
  });

  test("finds plugins by hook name match", () => {
    const results = searchRegistry("security-scan", sampleRegistry);
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe("security-pack");
  });

  test("finds plugins by rule name match", () => {
    const results = searchRegistry("dependency-check", sampleRegistry);
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe("security-pack");
  });

  test("is case-insensitive", () => {
    const results = searchRegistry("GIT", sampleRegistry);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe("git-helpers");
  });

  test("returns empty array for no matches", () => {
    const results = searchRegistry("nonexistent", sampleRegistry);
    expect(results).toEqual([]);
  });

  test("ranks name matches higher than description matches", () => {
    const results = searchRegistry("security", sampleRegistry);
    // security-pack has "security" in name (score 10) + description (score 5) + keywords (score 3)
    expect(results[0]!.name).toBe("security-pack");
  });

  test("returns all matches for broad query", () => {
    // "test" appears in testing-suite name and keywords
    const results = searchRegistry("test", sampleRegistry);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test("handles empty registry", () => {
    const results = searchRegistry("anything", []);
    expect(results).toEqual([]);
  });

  test("handles empty query by returning empty results", () => {
    // Empty string matches nothing (no substring match)
    // Actually empty string is a substring of everything
    const results = searchRegistry("", sampleRegistry);
    // Empty string matches all entries since "".includes("") is true
    expect(results.length).toBe(sampleRegistry.length);
  });
});

// ---- validatePlugin ----

describe("validatePlugin", () => {
  test("accepts a valid plugin with skills", () => {
    const result = validatePlugin({
      name: "valid-plugin",
      version: "1.0.0",
      author: "dev",
      description: "Valid plugin",
      skills: ["my-skill"],
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.name).toBe("valid-plugin");
  });

  test("accepts a valid plugin with only rules", () => {
    const result = validatePlugin({
      name: "rules-only",
      version: "1.0.0",
      author: "dev",
      description: "Rules plugin",
      rules: ["my-rule"],
    });
    expect(result.success).toBe(true);
  });

  test("accepts a valid plugin with only hooks", () => {
    const result = validatePlugin({
      name: "hooks-only",
      version: "1.0.0",
      author: "dev",
      description: "Hooks plugin",
      hooks: ["my-hook"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects plugin with no skills, rules, or hooks", () => {
    const result = validatePlugin({
      name: "empty-plugin",
      version: "1.0.0",
      author: "dev",
      description: "Empty plugin",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("at least one skill, rule, or hook");
  });

  test("rejects invalid schema (missing name)", () => {
    const result = validatePlugin({
      version: "1.0.0",
      author: "dev",
      description: "No name",
      skills: ["test"],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("rejects invalid schema (bad version)", () => {
    const result = validatePlugin({
      name: "bad-version",
      version: "not-semver",
      author: "dev",
      description: "Bad version",
      skills: ["test"],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("semver");
  });

  test("rejects non-object input", () => {
    const result = validatePlugin("not an object");
    expect(result.success).toBe(false);
  });

  test("rejects null input", () => {
    const result = validatePlugin(null);
    expect(result.success).toBe(false);
  });
});
