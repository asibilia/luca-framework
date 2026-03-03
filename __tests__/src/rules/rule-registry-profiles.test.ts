import { describe, test, expect } from "bun:test";
import { ruleRegistry } from "../../../src/rules/index";

/**
 * These tests verify the assembled rule registry (general + profile rules).
 *
 * With default config (opinionated_guidelines: true, tech_stack_profiles: ["typescript"]):
 * - 13 general rules (12 general + 1 lu-workflow)
 * - 7 typescript profile rules (use-bun merged into bun-preference)
 * - Total: 20 rules
 */

// Known general rule names (always present regardless of profile config)
const GENERAL_RULE_NAMES = [
  "atlassian-mcp",
  "complexity-gating",
  "cursor-rules",
  "domain-architecture",
  "file-naming",
  "harness-verification",
  "hook-skill-boundary",
  "lu-workflow",
  "mandatory-documentation",
  "module-boundary",
  "posthog-integration",
  "self-improve",
  "state-machine-bridge",
];

// Known typescript profile rule names
const TYPESCRIPT_RULE_NAMES = [
  "api-snake-case",
  "bun-preference",
  "functional-api-reuse",
  "import-standards",
  "lodash-preference",
  "no-classes",
  "schema-first-parsing",
];

describe("ruleRegistry with default config", () => {
  test("produces correct total rule count (20)", () => {
    expect(Object.keys(ruleRegistry)).toHaveLength(20);
  });

  test("general rules are always present", () => {
    for (const name of GENERAL_RULE_NAMES) {
      expect(ruleRegistry[name]).toBeDefined();
      expect(typeof ruleRegistry[name]).toBe("function");
    }
  });

  test("typescript profile rules are present with default config", () => {
    for (const name of TYPESCRIPT_RULE_NAMES) {
      expect(ruleRegistry[name]).toBeDefined();
      expect(typeof ruleRegistry[name]).toBe("function");
    }
  });

  test("no name collisions between general and profile rules", () => {
    const generalSet = new Set(GENERAL_RULE_NAMES);
    const profileSet = new Set(TYPESCRIPT_RULE_NAMES);

    for (const name of profileSet) {
      expect(generalSet.has(name)).toBe(false);
    }
  });

  test("all rule factories produce instances with required properties", () => {
    for (const [name, factory] of Object.entries(ruleRegistry)) {
      const instance = factory();
      expect(instance.config).toBeDefined();
      expect(instance.config.frontmatter).toBeDefined();
      expect(instance.config.frontmatter.description).toBeTruthy();
      expect(instance.config.sections).toBeDefined();
      expect(Array.isArray(instance.config.sections)).toBe(true);
      expect(instance.config.sections.length).toBeGreaterThan(0);
    }
  });

  test("all rule factories produce instances with compilation methods", () => {
    for (const [name, factory] of Object.entries(ruleRegistry)) {
      const instance = factory();
      expect(typeof instance.toCursorFormat).toBe("function");
      expect(typeof instance.toClaudeFormat).toBe("function");

      // Verify methods return non-empty strings
      const cursor = instance.toCursorFormat();
      const claude = instance.toClaudeFormat();
      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(0);
      expect(typeof claude).toBe("string");
      expect(claude.length).toBeGreaterThan(0);
    }
  });
});
