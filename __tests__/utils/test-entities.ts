/**
 * Shared test entity classes for compiler and base class tests.
 *
 * These concrete subclasses of the abstract base classes are used across
 * multiple test files to avoid duplication.
 */
import { BaseAgentImpl } from "../../src/agents/base/base-agent";
import { BaseSkillImpl } from "../../src/skills/base/base-skill";
import { BaseRuleImpl } from "../../src/rules/base/base-rule";
import type { AgentConfig } from "../../src/agents/types/agent.types";
import type { SkillConfig } from "../../src/skills/types/skill.types";
import type { RuleConfig } from "../../src/rules/types/rule.types";

export class TestAgent extends BaseAgentImpl {
  constructor(config: AgentConfig) {
    super(config);
  }
}

export class TestSkill extends BaseSkillImpl {
  constructor(config: SkillConfig) {
    super(config);
  }
}

export class TestRule extends BaseRuleImpl {
  constructor(config: RuleConfig) {
    super(config);
  }
}
