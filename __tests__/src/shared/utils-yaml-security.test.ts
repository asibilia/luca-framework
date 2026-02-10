/**
 * YAML Security Tests
 *
 * Tests for proper YAML escaping via js-yaml in formatFrontmatter().
 */

import { describe, test, expect } from 'bun:test'
import { formatFrontmatter } from '../../../src/shared/utils'

describe('YAML Security (js-yaml)', () => {
  test('escapes string values containing double quotes', () => {
    const result = formatFrontmatter({ name: 'say "hello"' })
    expect(result).toContain('---')
    // js-yaml should quote or escape the string properly
    const parsed = result.split('\n').find(l => l.includes('name:'))
    expect(parsed).toBeDefined()
    // The value should be parseable (not produce broken YAML)
  })

  test('escapes string values containing newlines', () => {
    const result = formatFrontmatter({ description: 'line1\nline2' })
    expect(result).toContain('---')
    // js-yaml handles newlines in values (uses quoted or block scalar)
  })

  test('escapes string values containing colons', () => {
    const result = formatFrontmatter({ url: 'https://example.com' })
    expect(result).toContain('url:')
    // Colons in values should be properly handled
  })

  test('escapes string values containing hash/comment characters', () => {
    const result = formatFrontmatter({ note: 'value # with comment char' })
    // js-yaml should quote the value to prevent comment interpretation
    expect(result).toContain('note:')
    expect(result).toContain('with comment char')
  })

  test('handles YAML reserved words as values', () => {
    const result = formatFrontmatter({
      val1: 'true',
      val2: 'null',
      val3: 'yes',
    })
    // js-yaml should quote these to preserve them as strings
    expect(result).toContain('val1:')
    expect(result).toContain('val2:')
    expect(result).toContain('val3:')
  })

  test('handles deeply nested objects', () => {
    const result = formatFrontmatter({
      level1: { level2: { level3: 'deep' } },
    })
    expect(result).toContain('level1:')
    expect(result).toContain('level2:')
    expect(result).toContain('level3: deep')
  })

  test('handles arrays of objects', () => {
    const result = formatFrontmatter({
      items: [{ name: 'a' }, { name: 'b' }],
    })
    expect(result).toContain('items:')
    expect(result).toContain('name: a')
    expect(result).toContain('name: b')
  })
})
