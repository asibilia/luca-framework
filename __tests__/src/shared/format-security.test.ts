/**
 * Format Security Tests
 *
 * Tests for XML tag name sanitization in toCursorFormat().
 */

import { describe, test, expect } from 'bun:test'
import { toCursorFormat } from '../../../src/shared/format'

describe('XML Tag Name Sanitization', () => {
  test('sanitizes section title with spaces', () => {
    const result = toCursorFormat({}, [{ title: 'My Section', content: 'body' }])
    expect(result).toContain('<my-section>')
    expect(result).toContain('</my-section>')
  })

  test('sanitizes section title with special chars', () => {
    const result = toCursorFormat({}, [{ title: 'Section<>Name', content: 'body' }])
    expect(result).not.toContain('<Section<>Name>')
    // Should produce a safe tag name
    expect(result).toMatch(/<section-name>/)
  })

  test('handles section title starting with number', () => {
    const result = toCursorFormat({}, [{ title: '123abc', content: 'body' }])
    expect(result).toContain('<section-123abc>')
    expect(result).toContain('</section-123abc>')
  })

  test('handles section title that sanitizes to empty', () => {
    const result = toCursorFormat({}, [{ title: '!!!', content: 'body' }])
    expect(result).toContain('<section-unknown>')
    expect(result).toContain('</section-unknown>')
  })

  test('collapses consecutive special chars', () => {
    const result = toCursorFormat({}, [{ title: 'a!!!b', content: 'body' }])
    expect(result).toContain('<a-b>')
    expect(result).toContain('</a-b>')
  })

  test('normal titles still work correctly', () => {
    const result = toCursorFormat({}, [
      { title: 'Instructions', content: 'Follow these steps' },
      { title: 'Context', content: 'Some context' },
    ])
    expect(result).toContain('<instructions>')
    expect(result).toContain('</instructions>')
    expect(result).toContain('<context>')
    expect(result).toContain('</context>')
  })
})
