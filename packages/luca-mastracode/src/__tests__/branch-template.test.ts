/**
 * Tests for renderTemplate (branch-template helper).
 *
 * Validates the allow-listed variable substitution used to render branch
 * names from project-preferences `branching.template` strings.
 */
import { describe, it, expect } from 'bun:test'

import { renderTemplate } from '../util/branch-template.js'

describe('renderTemplate', () => {
    it('renders happy path with type, issue, and slug', () => {
        expect(
            renderTemplate('{type}/{issue}-{slug}', {
                type: 'feat',
                issue: '123',
                slug: 'foo',
            }),
        ).toBe('feat/123-foo')
    })

    it('substitutes empty string when issue is undefined', () => {
        expect(
            renderTemplate('{type}/{issue}-{slug}', {
                type: 'feat',
                slug: 'foo',
            }),
        ).toBe('feat/-foo')
    })

    it('throws on unknown placeholder', () => {
        expect(() =>
            renderTemplate('{type}/{ticket}', {
                type: 'feat',
                slug: 'foo',
            }),
        ).toThrow(/\{ticket\}/)
    })

    it('expands repeated variables', () => {
        expect(
            renderTemplate('{type}-{type}', { type: 'feat', slug: 'x' }),
        ).toBe('feat-feat')
    })

    it('returns empty string for empty template', () => {
        expect(renderTemplate('', { type: 'feat', slug: 'x' })).toBe('')
    })

    it('renders type-only template', () => {
        expect(renderTemplate('{type}', { type: 'fix', slug: 'x' })).toBe(
            'fix',
        )
    })
})
