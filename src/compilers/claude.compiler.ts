/**
 * Compiler for converting TypeScript definitions to Claude format
 */
import { BaseCompiler } from './base.compiler';
import { BaseAgent } from '../agents/types/agent.types';
import { BaseSkill } from '../skills/types/skill.types';
import { BaseRule } from '../rules/types/rule.types';
import { SupportedFormat } from '../shared/constants';

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