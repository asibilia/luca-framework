import { describe, expect, test } from 'bun:test'

import { THEME } from './testing/render-native'

const { modelColor } = await import('./board-look')

/**
 * Gemini and Claude model badge colors (#780): Gemini tier prefixes match
 * case-insensitively, Claude/Clef exact names stay unchanged, and unknown or
 * partial model names fall back to the theme's muted color.
 */
describe('modelColor (#780)', () => {
    test('matches all four Gemini model prefixes case-insensitively', () => {
        expect(modelColor({ model: 'gemini-4-neon-high', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(modelColor({ model: 'GEMINI-4-NEON-LOW', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(modelColor({ model: 'gemini-4-argon-high', theme: THEME })).toBe(
            '#e8833a'
        )
        expect(
            modelColor({ model: 'Gemini-4-Argon-Medium', theme: THEME })
        ).toBe('#e8833a')
        expect(
            modelColor({ model: 'gemini-4-hydrogen-high', theme: THEME })
        ).toBe('#2dd4bf')
        expect(
            modelColor({ model: 'Gemini-4-Hydrogen-Low', theme: THEME })
        ).toBe('#2dd4bf')
        expect(
            modelColor({ model: 'gemini-3.8-flash-high', theme: THEME })
        ).toBe('#3b9fe8')
        expect(
            modelColor({ model: 'GEMINI-3.8-FLASH-LOW', theme: THEME })
        ).toBe('#3b9fe8')
    })

    test('preserves exact Claude and Clef model colors case-insensitively', () => {
        expect(modelColor({ model: 'opus', theme: THEME })).toBe('#a371f7')
        expect(modelColor({ model: 'OPUS', theme: THEME })).toBe('#a371f7')
        expect(modelColor({ model: 'sonnet', theme: THEME })).toBe('#e8833a')
        expect(modelColor({ model: 'Sonnet', theme: THEME })).toBe('#e8833a')
        expect(modelColor({ model: 'haiku', theme: THEME })).toBe('#3b9fe8')
        expect(modelColor({ model: 'HAIKU', theme: THEME })).toBe('#3b9fe8')
        expect(modelColor({ model: 'clef', theme: THEME })).toBe('#3fb950')
        expect(modelColor({ model: 'Clef', theme: THEME })).toBe('#3fb950')
    })

    test('falls back to foregroundMuted for unknown, partial, and empty names', () => {
        const muted = THEME.colors.foregroundMuted
        expect(modelColor({ model: '', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'unknown', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'gemini-4-neon', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'gemini-2.5-pro', theme: THEME })).toBe(
            muted
        )
        expect(modelColor({ model: 'gpt-9', theme: THEME })).toBe(muted)
    })
})
