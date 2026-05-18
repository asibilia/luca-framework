/**
 * Tests for hasPlaceholderText — scans text content for unfilled
 * placeholder markers left behind by drafters.
 *
 * Patterns matched (case-insensitive where stated):
 *   <TODO>, <TBD>, <placeholder>, <FIXME>, XXX (3+ consecutive Xs)
 */
import { describe, test, expect } from 'bun:test'

import { hasPlaceholderText } from '../tools/repo-cleanup.js'

describe('hasPlaceholderText', () => {
    test('detects <TODO> and returns line number', () => {
        const content = 'first line\nsecond <TODO> line\nthird line'
        const result = hasPlaceholderText(content)
        expect(result.found).toBe(true)
        const todoMatch = result.matches.find((m) => m.pattern === '<TODO>')
        expect(todoMatch).toBeDefined()
        expect(todoMatch!.line).toBe(2)
    })

    test('detects <TBD>, <placeholder>, <FIXME>, and XXX+ markers', () => {
        const content = [
            'line one with <TBD>',
            'line two with <placeholder> token',
            'line three with <FIXME> note',
            'line four with XXXX redaction',
        ].join('\n')
        const result = hasPlaceholderText(content)
        expect(result.found).toBe(true)
        const patterns = result.matches.map((m) => m.pattern)
        expect(patterns).toContain('<TBD>')
        expect(patterns).toContain('<placeholder>')
        expect(patterns).toContain('<FIXME>')
        expect(patterns).toContain('XXX (3+)')
    })

    test('returns found: false and empty matches for clean text', () => {
        const content = 'this is a perfectly clean document\nno placeholders here'
        const result = hasPlaceholderText(content)
        expect(result.found).toBe(false)
        expect(result.matches).toEqual([])
    })

    test('case-insensitive matching on <TODO> (lowercase <todo> matches)', () => {
        const content = 'leftover <todo> from a draft'
        const result = hasPlaceholderText(content)
        expect(result.found).toBe(true)
        const todoMatch = result.matches.find((m) => m.pattern === '<TODO>')
        expect(todoMatch).toBeDefined()
        expect(todoMatch!.line).toBe(1)
    })

    test('multi-line content with multiple matches returns correct line numbers', () => {
        const content = [
            'line 1 clean',
            'line 2 has <TODO> here',
            'line 3 clean',
            'line 4 has <FIXME> here',
            'line 5 clean',
            'line 6 has <TBD> here',
        ].join('\n')
        const result = hasPlaceholderText(content)
        expect(result.found).toBe(true)
        expect(result.matches).toHaveLength(3)
        const byPattern = Object.fromEntries(
            result.matches.map((m) => [m.pattern, m.line]),
        )
        expect(byPattern['<TODO>']).toBe(2)
        expect(byPattern['<FIXME>']).toBe(4)
        expect(byPattern['<TBD>']).toBe(6)
    })
})
