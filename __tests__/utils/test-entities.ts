/**
 * Shared test entity factories for compiler and base class tests.
 *
 * These factory wrappers are used across multiple test files to avoid duplication.
 */
import { createAgent } from "../../src/agents/base/base-agent";
import { createSkill } from "../../src/skills/base/base-skill";
import { createRule } from "../../src/rules/base/base-rule";
import type { AgentConfig } from "../../src/agents/types/agent.schemas";
import type { SkillConfig } from "../../src/skills/types/skill.schemas";
import type { RuleConfig } from "../../src/rules/types/rule.schemas";

/**
 * Factory wrapper for creating test agents.
 * Returns a BaseAgent instance via createAgent.
 */
export function createTestAgent(config: AgentConfig) {
  return createAgent(config);
}

/**
 * Factory wrapper for creating test skills.
 * Returns a BaseSkill instance via createSkill.
 */
export function createTestSkill(config: SkillConfig) {
  return createSkill(config);
}

/**
 * Factory wrapper matching the old TestRule class interface.
 * Returns a BaseRule instance via createRule.
 */
export function createTestRule(config: RuleConfig) {
  return createRule(config);
}
