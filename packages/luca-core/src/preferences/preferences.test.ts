import { describe, expect, test } from 'bun:test'

import {
    PREFERENCE_SECTIONS,
    extractPreferences,
    mergePreferences,
} from './preferences.ts'

describe('extractPreferences', () => {
    test('returns schema defaults for an empty config', () => {
        const result = extractPreferences({})
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.preferences.schemaVersion).toBe(1)
            expect(result.preferences.branching.defaultBranch).toBe('main')
        }
    })

    test('treats a null preferences key as unset', () => {
        const result = extractPreferences({ preferences: null })
        expect(result.ok).toBe(true)
    })

    test('parses a valid preferences object', () => {
        const result = extractPreferences({
            preferences: { commits: { convention: 'none' } },
        })
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.preferences.commits.convention).toBe('none')
        }
    })

    test('fails for a preferences object with an unsafe free-form string', () => {
        const result = extractPreferences({
            preferences: { branching: { defaultBranch: 'has"quote' } },
        })
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error.length).toBeGreaterThan(0)
        }
    })
})

describe('mergePreferences', () => {
    test('merges a section into a config with no prior preferences', () => {
        const result = mergePreferences({}, { commits: { convention: 'none' } })
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.mergedSections).toEqual(['commits'])
            const prefs = result.nextConfig.preferences as Record<
                string,
                Record<string, unknown>
            >
            expect(prefs.commits?.convention).toBe('none')
        }
    })

    test('preserves other top-level config keys', () => {
        const result = mergePreferences(
            { vault: 'my-vault', preferences: {} },
            { commits: { convention: 'none' } }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.nextConfig.vault).toBe('my-vault')
        }
    })

    test('preserves preference sections that are not part of the merge', () => {
        const result = mergePreferences(
            { preferences: { branching: { defaultBranch: 'develop' } } },
            { commits: { convention: 'none' } }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            const prefs = result.nextConfig.preferences as Record<
                string,
                Record<string, unknown>
            >
            expect(prefs.branching?.defaultBranch).toBe('develop')
            expect(prefs.commits?.convention).toBe('none')
        }
    })

    test('reports unknown keys as ignored', () => {
        const result = mergePreferences(
            {},
            { commits: { convention: 'none' }, bogusSection: {} }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.ignoredKeys).toEqual(['bogusSection'])
        }
    })

    test('fails when the merged result violates the schema', () => {
        const result = mergePreferences(
            {},
            { commits: { subjectMaxLength: 5 } }
        )
        expect(result.ok).toBe(false)
    })
})

describe('PREFERENCE_SECTIONS', () => {
    test('lists the canonical top-level preference sections', () => {
        expect(PREFERENCE_SECTIONS).toEqual([
            'schemaVersion',
            'branching',
            'commits',
            'pr',
            'release',
            'tracker',
        ])
    })
})
