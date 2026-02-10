/**
 * Template Security Tests
 *
 * Tests for EJS sanitization and path traversal prevention.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { processTemplate, copyTemplates } from '../../../../../packages/luca-framework/src/utils/template'
import { setupTempProject, cleanupTempDir, createTempDir } from '../../../../utils/temp-dir'
import { validLucaConfig } from '../../../../utils/fixtures'

describe('Template Security', () => {
  describe('EJS sanitization', () => {
    test('strips code execution tags from template', async () => {
      const result = await processTemplate(
        '<% console.log("hacked") %>safe content',
        {}
      )
      expect(result).toBe('safe content')
      expect(result).not.toContain('console.log')
    })

    test('converts unescaped output to escaped output', async () => {
      const result = await processTemplate(
        '<%- userInput %>',
        { userInput: '<script>alert("xss")</script>' }
      )
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })

    test('preserves safe output tags unchanged', async () => {
      const result = await processTemplate(
        '<%= name %>',
        { name: 'TestBot' }
      )
      expect(result).toBe('TestBot')
    })

    test('handles mixed tag types', async () => {
      const result = await processTemplate(
        '<% var x = 1; %>Value: <%= value %>, Raw: <%- raw %>',
        { value: 'hello', raw: '<b>bold</b>' }
      )
      expect(result).toContain('Value: hello')
      expect(result).toContain('&lt;b&gt;bold&lt;/b&gt;')
      expect(result).not.toContain('var x')
    })

    test('handles templates with no EJS tags', async () => {
      const result = await processTemplate(
        'No template tags here.',
        {}
      )
      expect(result).toBe('No template tags here.')
    })

    test('handles multi-line code blocks', async () => {
      const result = await processTemplate(
        '<% for (var i = 0; i < 3; i++) { %>item<% } %>',
        {}
      )
      expect(result).toBe('item')
      expect(result).not.toContain('for')
    })
  })
})
