/**
 * Unit tests for BaseAgentImpl
 *
 * Tests constructor validation, getters, toCursorFormat, and toClaudeFormat.
 * Uses a concrete TestAgent subclass since BaseAgentImpl is abstract.
 */
import { describe, test, expect } from 'bun:test';
import { BaseAgentImpl } from '../../../../src/agents/base/base-agent';
import type { AgentConfig } from '../../../../src/agents/types/agent.types';
import { validAgentConfig } from '../../../utils/fixtures';

// Concrete subclass for testing the abstract base class
class TestAgent extends BaseAgentImpl {
  constructor(config: AgentConfig) {
    super(config);
  }
}

// ---------------------------------------------------------------------------
// Constructor Validation (8 cases)
// ---------------------------------------------------------------------------
describe('BaseAgentImpl - constructor validation', () => {
  test('accepts a valid config', () => {
    const agent = new TestAgent(validAgentConfig);
    expect(agent).toBeDefined();
  });

  test('accepts config with optional tools omitted', () => {
    const config: AgentConfig = {
      frontmatter: { name: 'no-tools', description: 'Agent without tools' },
      sections: [{ title: 'Sec', content: 'body', order: 1 }],
    };
    const agent = new TestAgent(config);
    expect(agent.name).toBe('no-tools');
  });

  test('accepts config with optional color omitted', () => {
    const config: AgentConfig = {
      frontmatter: { name: 'no-color', description: 'Agent without color' },
      sections: [{ title: 'Sec', content: 'body', order: 1 }],
    };
    const agent = new TestAgent(config);
    expect(agent.config.frontmatter.color).toBeUndefined();
  });

  test('accepts config with empty sections array', () => {
    const config: AgentConfig = {
      frontmatter: { name: 'empty-sections', description: 'Agent with no sections' },
      sections: [],
    };
    const agent = new TestAgent(config);
    expect(agent.config.sections).toHaveLength(0);
  });

  test('rejects config missing frontmatter.name', () => {
    const config = {
      frontmatter: { description: 'Missing name' },
      sections: [],
    };
    expect(() => new TestAgent(config as any)).toThrow();
  });

  test('rejects config missing frontmatter.description', () => {
    const config = {
      frontmatter: { name: 'missing-desc' },
      sections: [],
    };
    expect(() => new TestAgent(config as any)).toThrow();
  });

  test('rejects config missing frontmatter entirely', () => {
    const config = { sections: [] };
    expect(() => new TestAgent(config as any)).toThrow();
  });

  test('rejects config missing sections entirely', () => {
    const config = {
      frontmatter: { name: 'no-sections', description: 'Missing sections' },
    };
    expect(() => new TestAgent(config as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Getters (3 cases)
// ---------------------------------------------------------------------------
describe('BaseAgentImpl - getters', () => {
  test('config getter returns the full validated config', () => {
    const agent = new TestAgent(validAgentConfig);
    expect(agent.config).toEqual(validAgentConfig);
  });

  test('name getter returns frontmatter.name', () => {
    const agent = new TestAgent(validAgentConfig);
    expect(agent.name).toBe('test-agent');
  });

  test('description getter returns frontmatter.description', () => {
    const agent = new TestAgent(validAgentConfig);
    expect(agent.description).toBe('A test agent for unit tests');
  });
});

// ---------------------------------------------------------------------------
// toCursorFormat (5 cases)
// ---------------------------------------------------------------------------
describe('BaseAgentImpl - toCursorFormat', () => {
  test('output starts with YAML frontmatter delimiters', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toCursorFormat();
    expect(output.startsWith('---\n')).toBe(true);
    expect(output).toContain('\n---\n');
  });

  test('frontmatter includes name and description', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toCursorFormat();
    expect(output).toContain('name: test-agent');
    expect(output).toContain('description: A test agent for unit tests');
  });

  test('sections with titles are wrapped in XML-like tags', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toCursorFormat();
    expect(output).toContain('<main>');
    expect(output).toContain('</main>');
    expect(output).toContain('This is the main section of the test agent.');
  });

  test('sections are sorted by order', () => {
    const config: AgentConfig = {
      frontmatter: { name: 'ordered', description: 'Agent with ordered sections' },
      sections: [
        { title: 'Second', content: 'second content', order: 2 },
        { title: 'First', content: 'first content', order: 1 },
      ],
    };
    const agent = new TestAgent(config);
    const output = agent.toCursorFormat();
    const firstIdx = output.indexOf('first content');
    const secondIdx = output.indexOf('second content');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  test('frontmatter includes array fields (tools)', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toCursorFormat();
    expect(output).toContain('tools:');
    expect(output).toContain('  - read');
    expect(output).toContain('  - write');
  });
});

// ---------------------------------------------------------------------------
// toClaudeFormat (4 cases)
// ---------------------------------------------------------------------------
describe('BaseAgentImpl - toClaudeFormat', () => {
  test('output starts with H1 heading using the agent name', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toClaudeFormat();
    expect(output.startsWith('# test-agent')).toBe(true);
  });

  test('description follows the H1 heading', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toClaudeFormat();
    const lines = output.split('\n');
    // Line 0: "# test-agent", Line 1: empty, Line 2: description
    expect(lines[2]).toBe('A test agent for unit tests');
  });

  test('sections with titles become H2 headings', () => {
    const agent = new TestAgent(validAgentConfig);
    const output = agent.toClaudeFormat();
    expect(output).toContain('## Main');
    expect(output).toContain('This is the main section of the test agent.');
  });

  test('sections are sorted by order', () => {
    const config: AgentConfig = {
      frontmatter: { name: 'ordered', description: 'Ordered agent' },
      sections: [
        { title: 'Beta', content: 'beta content', order: 2 },
        { title: 'Alpha', content: 'alpha content', order: 1 },
      ],
    };
    const agent = new TestAgent(config);
    const output = agent.toClaudeFormat();
    const alphaIdx = output.indexOf('alpha content');
    const betaIdx = output.indexOf('beta content');
    expect(alphaIdx).toBeLessThan(betaIdx);
  });
});
