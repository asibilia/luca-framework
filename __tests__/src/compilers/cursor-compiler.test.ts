/**
 * Unit tests for Cursor-format compile functions
 *
 * Tests compileAgentCursor, compileSkillCursor, compileRuleCursor,
 * and the format-dispatching compileAgent/compileSkill/compileRule
 * with "CURSOR" format.
 */
import { describe, test, expect } from "bun:test";
import {
  compileAgentCursor,
  compileSkillCursor,
  compileRuleCursor,
  compileAgent,
  compileSkill,
  compileRule,
} from "../../../src/compilers/compile";
import {
  TestAgent,
  TestSkill,
  createTestRule,
} from "../../utils/test-entities";
import {
  validAgentConfig,
  validSkillConfig,
  validRuleConfig,
} from "../../utils/fixtures";

describe("Cursor-format compile functions", () => {
  test("compileAgentCursor delegates to agent.toCursorFormat()", () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compileAgentCursor(agent);
    expect(result).toBe(agent.toCursorFormat());
  });

  test("compileSkillCursor delegates to skill.toCursorFormat()", () => {
    const skill = new TestSkill(validSkillConfig);
    const result = compileSkillCursor(skill);
    expect(result).toBe(skill.toCursorFormat());
  });

  test("compileRuleCursor delegates to rule.toCursorFormat()", () => {
    const rule = createTestRule(validRuleConfig);
    const result = compileRuleCursor(rule);
    expect(result).toBe(rule.toCursorFormat());
  });

  test("compileAgent with CURSOR format matches compileAgentCursor", () => {
    const agent = new TestAgent(validAgentConfig);
    expect(compileAgent(agent, "CURSOR")).toBe(compileAgentCursor(agent));
  });

  test("compileSkill with CURSOR format matches compileSkillCursor", () => {
    const skill = new TestSkill(validSkillConfig);
    expect(compileSkill(skill, "CURSOR")).toBe(compileSkillCursor(skill));
  });

  test("compileRule with CURSOR format matches compileRuleCursor", () => {
    const rule = createTestRule(validRuleConfig);
    expect(compileRule(rule, "CURSOR")).toBe(compileRuleCursor(rule));
  });

  test("compileAgent throws on unsupported format", () => {
    const agent = new TestAgent(validAgentConfig);
    expect(() => compileAgent(agent, "UNKNOWN" as any)).toThrow(
      "Unsupported format",
    );
  });

  test("compileAgentCursor returns string containing YAML frontmatter", () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compileAgentCursor(agent);
    expect(result).toContain("---");
    expect(result).toContain("name: test-agent");
  });
});
