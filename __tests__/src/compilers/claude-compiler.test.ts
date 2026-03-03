/**
 * Unit tests for Claude-format compile functions
 *
 * Tests compileAgentClaude, compileSkillClaude, compileRuleClaude,
 * and the format-dispatching compileAgent/compileSkill/compileRule
 * with "CLAUDE" format.
 */
import { describe, test, expect } from "bun:test";
import {
  compileAgentClaude,
  compileSkillClaude,
  compileRuleClaude,
  compileAgent,
  compileSkill,
  compileRule,
} from "../../../src/compilers/__helpers/compile";
import {
  createTestAgent,
  createTestSkill,
  createTestRule,
} from "../../utils/test-entities";
import {
  validAgentConfig,
  validSkillConfig,
  validRuleConfig,
} from "../../utils/fixtures";

describe("Claude-format compile functions", () => {
  test("compileAgentClaude delegates to agent.toClaudeFormat()", () => {
    const agent = createTestAgent(validAgentConfig);
    const result = compileAgentClaude(agent);
    expect(result).toBe(agent.toClaudeFormat());
  });

  test("compileSkillClaude delegates to skill.toClaudeFormat()", () => {
    const skill = createTestSkill(validSkillConfig);
    const result = compileSkillClaude(skill);
    expect(result).toBe(skill.toClaudeFormat());
  });

  test("compileRuleClaude adds frontmatter for scoped rules", () => {
    const rule = createTestRule(validRuleConfig);
    const result = compileRuleClaude(rule);
    // Scoped rules (alwaysApply: false or globs) get YAML frontmatter prepended
    expect(result).toContain(rule.toClaudeFormat());
    expect(result).toContain("---");
    expect(result).toContain("description:");
  });

  test("compileAgent with CLAUDE format matches compileAgentClaude", () => {
    const agent = createTestAgent(validAgentConfig);
    expect(compileAgent(agent, "CLAUDE")).toBe(compileAgentClaude(agent));
  });

  test("compileSkill with CLAUDE format matches compileSkillClaude", () => {
    const skill = createTestSkill(validSkillConfig);
    expect(compileSkill(skill, "CLAUDE")).toBe(compileSkillClaude(skill));
  });

  test("compileRule with CLAUDE format matches compileRuleClaude", () => {
    const rule = createTestRule(validRuleConfig);
    expect(compileRule(rule, "CLAUDE")).toBe(compileRuleClaude(rule));
  });

  test("compileAgent throws on unsupported format", () => {
    const agent = createTestAgent(validAgentConfig);
    expect(() => compileAgent(agent, "INVALID" as any)).toThrow(
      "Unsupported format",
    );
  });

  test("compileAgentClaude returns string starting with H1 heading", () => {
    const agent = createTestAgent(validAgentConfig);
    const result = compileAgentClaude(agent);
    expect(result.startsWith("# test-agent")).toBe(true);
  });
});
