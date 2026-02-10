/**
 * Utility functions for validating configurations with Zod schemas
 */
import { agentConfigSchema } from '../agents/types/agent.schemas';
import { skillConfigSchema } from '../skills/types/skill.schemas';
import { ruleConfigSchema } from '../rules/types/rule.schemas';
import type { AgentConfig } from '../agents/types/agent.types';
import type { SkillConfig } from '../skills/types/skill.types';
import type { RuleConfig } from '../rules/types/rule.types';

export function validateAgentConfig(config: AgentConfig): AgentConfig {
  return agentConfigSchema.parse(config);
}

export function validateSkillConfig(config: SkillConfig): SkillConfig {
  return skillConfigSchema.parse(config);
}

export function validateRuleConfig(config: RuleConfig): RuleConfig {
  return ruleConfigSchema.parse(config);
}

// Helper function to validate with error handling
export function safeValidateAgentConfig(config: AgentConfig): { success: boolean; data?: AgentConfig; error?: string } {
  try {
    const data = agentConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Validation failed' };
  }
}

export function safeValidateSkillConfig(config: SkillConfig): { success: boolean; data?: SkillConfig; error?: string } {
  try {
    const data = skillConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Validation failed' };
  }
}

export function safeValidateRuleConfig(config: RuleConfig): { success: boolean; data?: RuleConfig; error?: string } {
  try {
    const data = ruleConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Validation failed' };
  }
}