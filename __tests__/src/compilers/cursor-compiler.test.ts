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
import { BaseAgentImpl } from "../../../src/agents/base/base-agent";
import { BaseSkillImpl } from "../../../src/skills/base/base-skill";
import { BaseRuleImpl } from "../../../src/rules/base/base-rule";
import type { AgentConfig } from "../../../src/agents/types/agent.types";
import type { SkillConfig } from "../../../src/skills/types/skill.types";
import type { RuleConfig } from "../../../src/rules/types/rule.types";
import {
  validAgentConfig,
  validSkillConfig,
  validRuleConfig,
} from "../../utils/fixtures";

// Concrete subclasses for the abstract base classes
class TestAgent extends BaseAgentImpl {
  constructor(config: AgentConfig) {
    super(config);
  }
}
class TestSkill extends BaseSkillImpl {
  constructor(config: SkillConfig) {
    super(config);
  }
}
class TestRule extends BaseRuleImpl {
  constructor(config: RuleConfig) {
    super(config);
  }
}

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
    const rule = new TestRule(validRuleConfig);
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
    const rule = new TestRule(validRuleConfig);
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
