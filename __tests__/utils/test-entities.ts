/**
 * Shared test entity factories for compiler and base class tests.
 *
 * These factory wrappers are used across multiple test files to avoid duplication.
 */
import { createAgent } from "~/agents/__helpers/create-agent";
import { createSkill } from "~/skills/__helpers/create-skill";
import { createRule } from "~/rules/__helpers/create-rule";
import type { AgentConfig } from "~/agents/__schemas/agent.schemas";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

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
