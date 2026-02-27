/**
 * Unit tests for Pi-format compile functions
 *
 * Tests compileAgentPi, compileSkillPi, compileRulePi,
 * and the format-dispatching compileAgent/compileSkill/compileRule
 * with "PI" format.
 */
import { describe, test, expect } from "bun:test";
import {
  compileAgentPi,
  compileSkillPi,
  compileRulePi,
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
import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

describe("Pi-format compile functions", () => {
  test("compileAgentPi delegates to agent.toPiFormat()", () => {
    const agent = createTestAgent(validAgentConfig);
    const result = compileAgentPi(agent);
    expect(result).toBe(agent.toPiFormat());
  });

  test("compileSkillPi delegates to skill.toPiFormat()", () => {
    const skill = createTestSkill(validSkillConfig);
    const result = compileSkillPi(skill);
    expect(result).toBe(skill.toPiFormat());
  });

  test("compileRulePi delegates to rule.toPiFormat()", () => {
    const rule = createTestRule(validRuleConfig);
    const result = compileRulePi(rule);
    expect(result).toBe(rule.toPiFormat());
  });

  test("compileAgent with PI format matches compileAgentPi", () => {
    const agent = createTestAgent(validAgentConfig);
    expect(compileAgent(agent, "PI")).toBe(compileAgentPi(agent));
  });

  test("compileSkill with PI format matches compileSkillPi", () => {
    const skill = createTestSkill(validSkillConfig);
    expect(compileSkill(skill, "PI")).toBe(compileSkillPi(skill));
  });

  test("compileRule with PI format matches compileRulePi", () => {
    const rule = createTestRule(validRuleConfig);
    expect(compileRule(rule, "PI")).toBe(compileRulePi(rule));
  });

  test("compileAgentPi output contains YAML frontmatter", () => {
    const agent = createTestAgent(validAgentConfig);
    const result = compileAgentPi(agent);
    expect(result.startsWith("---\n")).toBe(true);
    expect(result).toContain("name: test-agent");
    expect(result).toContain("description: A test agent for unit tests");
  });

  test("compileAgentPi includes tools in frontmatter when defined", () => {
    const agent = createTestAgent(validAgentConfig);
    const result = compileAgentPi(agent);
    expect(result).toContain("tools:");
    expect(result).toContain("- read");
    expect(result).toContain("- write");
  });

  test("compileAgentPi includes model when model_routing is defined", () => {
    const configWithRouting: AgentConfig = {
      frontmatter: {
        name: "routed-agent",
        description: "Agent with model routing",
        model_routing: {
          default_model: "haiku",
        },
      },
      sections: [{ title: "role", content: "Test role", order: 1 }],
    };
    const agent = createTestAgent(configWithRouting);
    const result = compileAgentPi(agent);
    expect(result).toContain("model: haiku");
  });

  test("compileAgentPi omits model when model_routing is not defined", () => {
    const configNoRouting: AgentConfig = {
      frontmatter: {
        name: "plain-agent",
        description: "Agent without model routing",
      },
      sections: [{ title: "role", content: "Test role", order: 1 }],
    };
    const agent = createTestAgent(configNoRouting);
    const result = compileAgentPi(agent);
    expect(result).not.toContain("model:");
  });

  test("compileAgentPi contains H1 heading and sections", () => {
    const agent = createTestAgent(validAgentConfig);
    const result = compileAgentPi(agent);
    expect(result).toContain("# test-agent");
    expect(result).toContain("## Main");
    expect(result).toContain("This is the main section of the test agent.");
  });

  test("compileSkillPi output contains YAML frontmatter", () => {
    const skill = createTestSkill(validSkillConfig);
    const result = compileSkillPi(skill);
    expect(result.startsWith("---\n")).toBe(true);
    expect(result).toContain("name: test-skill");
    expect(result).toContain("description: A test skill for unit tests");
  });

  test("compileSkillPi contains H1 heading and sections", () => {
    const skill = createTestSkill(validSkillConfig);
    const result = compileSkillPi(skill);
    expect(result).toContain("# test-skill");
    expect(result).toContain("## Instructions");
    expect(result).toContain("Follow these instructions for the test skill.");
  });

  test("compileRulePi output contains YAML frontmatter", () => {
    const rule = createTestRule(validRuleConfig);
    const result = compileRulePi(rule);
    expect(result.startsWith("---\n")).toBe(true);
    expect(result).toContain("description: A test rule for unit tests");
  });

  test("compileRulePi contains H1 heading and sections", () => {
    const rule = createTestRule(validRuleConfig);
    const result = compileRulePi(rule);
    expect(result).toContain("# A test rule for unit tests");
    expect(result).toContain("## Guidelines");
    expect(result).toContain("Follow these guidelines for the test rule.");
  });
});
