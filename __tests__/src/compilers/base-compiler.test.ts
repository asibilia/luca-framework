/**
 * Unit tests for BaseCompiler
 *
 * Tests the protected validateFormat method via a concrete TestCompiler subclass.
 */
import { describe, test, expect } from 'bun:test';
import { BaseCompiler, type SupportedFormat } from '../../../src/compilers/base.compiler';
import type { BaseAgent } from '../../../src/agents/types/agent.types';
import type { BaseSkill } from '../../../src/skills/types/skill.types';
import type { BaseRule } from '../../../src/rules/types/rule.types';

// Concrete subclass that exposes validateFormat for testing
class TestCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    this.validateFormat(format);
    return 'agent-compiled';
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return 'skill-compiled';
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    return 'rule-compiled';
  }

  // Expose protected method for direct testing
  public testValidateFormat(format: SupportedFormat): void {
    this.validateFormat(format);
  }
}

describe('BaseCompiler - validateFormat', () => {
  const compiler = new TestCompiler();

  test('accepts CURSOR format without throwing', () => {
    expect(() => compiler.testValidateFormat('CURSOR')).not.toThrow();
  });

  test('accepts CLAUDE format without throwing', () => {
    expect(() => compiler.testValidateFormat('CLAUDE')).not.toThrow();
  });

  test('rejects unsupported format with descriptive error', () => {
    expect(() => compiler.testValidateFormat('UNKNOWN' as SupportedFormat)).toThrow(
      'Unsupported format: UNKNOWN',
    );
  });
});
