import { describe, test, expect } from "bun:test";
import { profileRegistry } from "../index";
import type { BaseRule } from "../../types/rule.types";

describe("profileRegistry", () => {
  test("contains all 4 profiles", () => {
    const profileNames = Object.keys(profileRegistry);
    expect(profileNames).toContain("typescript");
    expect(profileNames).toContain("python");
    expect(profileNames).toContain("go");
    expect(profileNames).toContain("rust");
    expect(profileNames).toHaveLength(4);
  });

  test("typescript profile has 8 rules", () => {
    const ts = profileRegistry["typescript"]!;
    expect(Object.keys(ts.rules)).toHaveLength(8);
  });

  test("python profile has 0 rules (placeholder)", () => {
    const py = profileRegistry["python"]!;
    expect(Object.keys(py.rules)).toHaveLength(0);
  });

  test("go profile has 0 rules (placeholder)", () => {
    const go = profileRegistry["go"]!;
    expect(Object.keys(go.rules)).toHaveLength(0);
  });

  test("rust profile has 0 rules (placeholder)", () => {
    const rust = profileRegistry["rust"]!;
    expect(Object.keys(rust.rules)).toHaveLength(0);
  });

  test("each profile has a name matching its registry key", () => {
    for (const [key, profile] of Object.entries(profileRegistry)) {
      expect(profile.name).toBe(key);
    }
  });

  test("each profile has a non-empty description", () => {
    for (const [_key, profile] of Object.entries(profileRegistry)) {
      expect(profile.description.length).toBeGreaterThan(0);
    }
  });
});

describe("typescript profile rule factories", () => {
  const expectedRuleNames = [
    "api-snake-case",
    "bun-preference",
    "functional-api-reuse",
    "import-standards",
    "lodash-preference",
    "no-classes",
    "schema-first-parsing",
    "use-bun-instead-of-node-vite-npm-pnpm",
  ];

  test("contains expected rule names", () => {
    const ruleNames = Object.keys(profileRegistry["typescript"]!.rules).sort();
    expect(ruleNames).toEqual(expectedRuleNames.sort());
  });

  test("all rule factories produce valid BaseRule instances", () => {
    for (const [_ruleName, factory] of Object.entries(
      profileRegistry["typescript"]!.rules,
    )) {
      const instance = factory();

      // Verify it implements BaseRule interface
      expect(instance.config).toBeDefined();
      expect(instance.config.frontmatter).toBeDefined();
      expect(instance.config.frontmatter.description).toBeTruthy();
      expect(instance.config.sections).toBeDefined();
      expect(Array.isArray(instance.config.sections)).toBe(true);

      // Verify compilation methods exist and return strings
      expect(typeof instance.toCursorFormat).toBe("function");
      expect(typeof instance.toClaudeFormat).toBe("function");

      const cursorOutput = instance.toCursorFormat();
      const claudeOutput = instance.toClaudeFormat();
      expect(typeof cursorOutput).toBe("string");
      expect(cursorOutput.length).toBeGreaterThan(0);
      expect(typeof claudeOutput).toBe("string");
      expect(claudeOutput.length).toBeGreaterThan(0);
    }
  });
});
