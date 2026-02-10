/**
 * Compiler for converting TypeScript definitions to Claude format
 */
import { BaseCompiler } from './base.compiler';
import type { BaseAgent } from '../agents/types/agent.types';
import type { BaseSkill } from '../skills/types/skill.types';
import type { BaseRule } from '../rules/types/rule.types';
import type { SupportedFormat } from './base.compiler';

export class ClaudeCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    this.validateFormat(format);
    return agent.toClaudeFormat();
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return skill.toClaudeFormat();
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    return rule.toClaudeFormat();
  }
}