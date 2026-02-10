/**
 * Unit tests for shared utility functions
 *
 * Tests formatFrontmatter (7).
 */
import { describe, test, expect } from 'bun:test';
import { formatFrontmatter } from '../../../src/shared/utils';

// ---------------------------------------------------------------------------
// formatFrontmatter (7 cases)
// ---------------------------------------------------------------------------
describe('formatFrontmatter', () => {
  test('wraps output in YAML frontmatter delimiters', () => {
    const result = formatFrontmatter({ key: 'value' });
    expect(result.startsWith('---\n')).toBe(true);
    expect(result.endsWith('\n---')).toBe(true);
  });

  test('formats string values with double quotes', () => {
    const result = formatFrontmatter({ name: 'my-agent' });
    expect(result).toContain('name: "my-agent"');
  });

  test('formats boolean values without quotes', () => {
    const result = formatFrontmatter({ alwaysApply: true });
    expect(result).toContain('alwaysApply: true');
  });

  test('formats array values as YAML list items', () => {
    const result = formatFrontmatter({ tools: ['read', 'write'] });
    expect(result).toContain('tools:');
    expect(result).toContain('  - read');
    expect(result).toContain('  - write');
  });

  test('formats nested object values as indented key-value pairs', () => {
    const result = formatFrontmatter({ meta: { version: '1.0', author: 'test' } });
    expect(result).toContain('meta:');
    expect(result).toContain('  version: 1.0');
    expect(result).toContain('  author: test');
  });

  test('handles empty object', () => {
    const result = formatFrontmatter({});
    expect(result).toBe('---\n---');
  });

  test('handles mixed types in a single frontmatter block', () => {
    const result = formatFrontmatter({
      name: 'test',
      active: false,
      tags: ['a', 'b'],
    });
    expect(result).toContain('name: "test"');
    expect(result).toContain('active: false');
    expect(result).toContain('tags:');
    expect(result).toContain('  - a');
    expect(result).toContain('  - b');
  });
});

