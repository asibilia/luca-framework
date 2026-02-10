/**
 * Unit tests for ClaudeCompiler
 *
 * Tests compileAgent, compileSkill, compileRule delegation
 * and format validation.
 */
import { describe, test, expect } from 'bun:test';
import { ClaudeCompiler } from '../../../src/compilers/claude.compiler';
import { BaseAgentImpl } from '../../../src/agents/base/base-agent';
import { BaseSkillImpl } from '../../../src/skills/base/base-skill';
import { BaseRuleImpl } from '../../../src/rules/base/base-rule';
import type { AgentConfig } from '../../../src/agents/types/agent.types';
import type { SkillConfig } from '../../../src/skills/types/skill.types';
import type { RuleConfig } from '../../../src/rules/types/rule.types';
import { validAgentConfig, validSkillConfig, validRuleConfig } from '../../utils/fixtures';

// Concrete subclasses for the abstract base classes
class TestAgent extends BaseAgentImpl {
  constructor(config: AgentConfig) { super(config); }
}
class TestSkill extends BaseSkillImpl {
  constructor(config: SkillConfig) { super(config); }
}
class TestRule extends BaseRuleImpl {
  constructor(config: RuleConfig) { super(config); }
}

describe('ClaudeCompiler', () => {
  const compiler = new ClaudeCompiler();

  test('compileAgent delegates to agent.toClaudeFormat()', () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compiler.compileAgent(agent, 'CLAUDE');
    expect(result).toBe(agent.toClaudeFormat());
  });

  test('compileSkill delegates to skill.toClaudeFormat()', () => {
    const skill = new TestSkill(validSkillConfig);
    const result = compiler.compileSkill(skill, 'CLAUDE');
    expect(result).toBe(skill.toClaudeFormat());
  });

  test('compileRule delegates to rule.toClaudeFormat()', () => {
    const rule = new TestRule(validRuleConfig);
    const result = compiler.compileRule(rule, 'CLAUDE');
    expect(result).toBe(rule.toClaudeFormat());
  });

  test('compileSkill throws on unsupported format', () => {
    const skill = new TestSkill(validSkillConfig);
    expect(() => compiler.compileSkill(skill, 'INVALID' as any)).toThrow('Unsupported format');
  });

  test('compileAgent returns string starting with H1 heading', () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compiler.compileAgent(agent, 'CLAUDE');
    expect(result.startsWith('# test-agent')).toBe(true);
  });
});
