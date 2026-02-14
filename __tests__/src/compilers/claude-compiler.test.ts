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
} from "../../../src/compilers/compile";
import { TestAgent, TestSkill, TestRule } from "../../utils/test-entities";
import {
  validAgentConfig,
  validSkillConfig,
  validRuleConfig,
} from "../../utils/fixtures";

describe("Claude-format compile functions", () => {
  test("compileAgentClaude delegates to agent.toClaudeFormat()", () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compileAgentClaude(agent);
    expect(result).toBe(agent.toClaudeFormat());
  });

  test("compileSkillClaude delegates to skill.toClaudeFormat()", () => {
    const skill = new TestSkill(validSkillConfig);
    const result = compileSkillClaude(skill);
    expect(result).toBe(skill.toClaudeFormat());
  });

  test("compileRuleClaude delegates to rule.toClaudeFormat()", () => {
    const rule = new TestRule(validRuleConfig);
    const result = compileRuleClaude(rule);
    expect(result).toBe(rule.toClaudeFormat());
  });

  test("compileAgent with CLAUDE format matches compileAgentClaude", () => {
    const agent = new TestAgent(validAgentConfig);
    expect(compileAgent(agent, "CLAUDE")).toBe(compileAgentClaude(agent));
  });

  test("compileSkill with CLAUDE format matches compileSkillClaude", () => {
    const skill = new TestSkill(validSkillConfig);
    expect(compileSkill(skill, "CLAUDE")).toBe(compileSkillClaude(skill));
  });

  test("compileRule with CLAUDE format matches compileRuleClaude", () => {
    const rule = new TestRule(validRuleConfig);
    expect(compileRule(rule, "CLAUDE")).toBe(compileRuleClaude(rule));
  });

  test("compileAgent throws on unsupported format", () => {
    const agent = new TestAgent(validAgentConfig);
    expect(() => compileAgent(agent, "INVALID" as any)).toThrow(
      "Unsupported format",
    );
  });

  test("compileAgentClaude returns string starting with H1 heading", () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compileAgentClaude(agent);
    expect(result.startsWith("# test-agent")).toBe(true);
  });
});
