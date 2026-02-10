/**
 * Unit tests for CursorCompiler
 *
 * Tests compileAgent, compileSkill, compileRule delegation
 * and format validation.
 */
import { describe, test, expect } from 'bun:test';
import { CursorCompiler } from '../../../src/compilers/cursor.compiler';
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

describe('CursorCompiler', () => {
  const compiler = new CursorCompiler();

  test('compileAgent delegates to agent.toCursorFormat()', () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compiler.compileAgent(agent, 'CURSOR');
    expect(result).toBe(agent.toCursorFormat());
  });

  test('compileSkill delegates to skill.toCursorFormat()', () => {
    const skill = new TestSkill(validSkillConfig);
    const result = compiler.compileSkill(skill, 'CURSOR');
    expect(result).toBe(skill.toCursorFormat());
  });

  test('compileRule delegates to rule.toCursorFormat()', () => {
    const rule = new TestRule(validRuleConfig);
    const result = compiler.compileRule(rule, 'CURSOR');
    expect(result).toBe(rule.toCursorFormat());
  });

  test('compileAgent throws on unsupported format', () => {
    const agent = new TestAgent(validAgentConfig);
    expect(() => compiler.compileAgent(agent, 'UNKNOWN' as any)).toThrow('Unsupported format');
  });

  test('compileAgent returns string containing YAML frontmatter', () => {
    const agent = new TestAgent(validAgentConfig);
    const result = compiler.compileAgent(agent, 'CURSOR');
    expect(result).toContain('---');
    expect(result).toContain('name: "test-agent"');
  });
});
