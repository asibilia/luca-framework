/**
 * Unit tests for createRule (rule factory)
 *
 * Focus on the unique `name` getter (truncated description with dashes),
 * `globs`, `alwaysApply`, config validation, and format methods.
 * Uses createTestRule wrapper around the createRule factory.
 */
import { describe, test, expect } from "bun:test";
import { createTestRule } from "../../../utils/test-entities";
import type { RuleConfig } from "../../../../src/rules/types/rule.types";
import { validRuleConfig } from "../../../utils/fixtures";

// ---------------------------------------------------------------------------
// Constructor Validation (3 cases)
// ---------------------------------------------------------------------------
describe("createRule - constructor validation", () => {
  test("accepts a valid config", () => {
    const rule = createTestRule(validRuleConfig);
    expect(rule).toBeDefined();
  });

  test("accepts config with optional globs and alwaysApply omitted", () => {
    const config: RuleConfig = {
      frontmatter: { description: "Minimal rule" },
      sections: [],
    };
    const rule = createTestRule(config);
    expect(rule.config.frontmatter.globs).toBeUndefined();
    expect(rule.config.frontmatter.alwaysApply).toBeUndefined();
  });

  test("rejects config missing frontmatter.description", () => {
    const config = {
      frontmatter: {},
      sections: [],
    };
    expect(() => createTestRule(config as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// name getter - unique behavior (3 cases)
// ---------------------------------------------------------------------------
describe("createRule - name getter", () => {
  test("derives name from description (first 30 chars, spaces to dashes)", () => {
    const rule = createTestRule(validRuleConfig);
    // "A test rule for unit tests" -> first 30 chars (all fit), spaces -> dashes
    expect(rule.name).toBe("A-test-rule-for-unit-tests");
  });

  test("truncates long descriptions to 30 characters", () => {
    const config: RuleConfig = {
      frontmatter: {
        description:
          "This description is way longer than thirty characters total",
      },
      sections: [],
    };
    const rule = createTestRule(config);
    // substring(0,30) = "This description is way longer" -> replace spaces with dashes
    expect(rule.name).toBe("This-description-is-way-longer");
    expect(rule.name.length).toBe(30);
  });

  test("handles description with multiple consecutive spaces", () => {
    const config: RuleConfig = {
      frontmatter: { description: "Rule  with  spaces" },
      sections: [],
    };
    const rule = createTestRule(config);
    // \s+ regex replaces consecutive spaces with single dash
    expect(rule.name).toBe("Rule-with-spaces");
  });
});

// ---------------------------------------------------------------------------
// Other getters / fields (2 cases)
// ---------------------------------------------------------------------------
describe("createRule - getters", () => {
  test("description getter returns full frontmatter.description", () => {
    const rule = createTestRule(validRuleConfig);
    expect(rule.description).toBe("A test rule for unit tests");
  });

  test("config getter exposes globs and alwaysApply", () => {
    const rule = createTestRule(validRuleConfig);
    expect(rule.config.frontmatter.globs).toEqual(["**/*.ts"]);
    expect(rule.config.frontmatter.alwaysApply).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toClaudeFormat (1 case -- rules use description as H1, not name)
// ---------------------------------------------------------------------------
describe("createRule - toClaudeFormat", () => {
  test("output starts with H1 using description (not name)", () => {
    const rule = createTestRule(validRuleConfig);
    const output = rule.toClaudeFormat();
    expect(output.startsWith("# A test rule for unit tests")).toBe(true);
    expect(output).toContain("## Guidelines");
    expect(output).toContain("Follow these guidelines for the test rule.");
  });
});

// ---------------------------------------------------------------------------
// toCursorFormat (1 case)
// ---------------------------------------------------------------------------
describe("createRule - toCursorFormat", () => {
  test("output includes frontmatter with description and section tags", () => {
    const rule = createTestRule(validRuleConfig);
    const output = rule.toCursorFormat();
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("description: A test rule for unit tests");
    expect(output).toContain("<guidelines>");
    expect(output).toContain("</guidelines>");
  });
});
