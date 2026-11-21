import { describe, expect, test } from 'bun:test'

import { THEME } from './testing/render-native'

import type { LiveAgent } from '../shared/board-state'
import { windowWords } from '../shared/board-state-usage'

const { MODEL_COLORS, modelColor } = await import('./board-look')
const { callWords, liveText } = await import('./live-line')

const baseLive = (overrides: Partial<LiveAgent> = {}): LiveAgent => ({
    ticket: 11,
    role: 'implementer',
    model: 'gemini-4-neon-high',
    tokens: 1200,
    action: null,
    open_call: null,
    activity: [],
    helpers: [],
    ...overrides,
})

describe('Tier 1 — board UI Gemini colors, agy tools, and agy_quota window', () => {
    test('modelColor maps Gemini 4 Neon, Argon, Hydrogen, and 3.8 Flash families to their palette hexes', () => {
        expect(modelColor({ model: 'gemini-4-neon-high', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(modelColor({ model: 'gemini-4-neon-low', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(modelColor({ model: 'gemini-4-argon-high', theme: THEME })).toBe(
            '#e8833a'
        )
        expect(
            modelColor({ model: 'gemini-4-argon-medium', theme: THEME })
        ).toBe('#e8833a')
        expect(
            modelColor({ model: 'gemini-4-hydrogen-high', theme: THEME })
        ).toBe('#2dd4bf')
        expect(
            modelColor({ model: 'gemini-3.8-flash-high', theme: THEME })
        ).toBe('#3b9fe8')
        expect(
            modelColor({ model: 'gemini-3.8-flash-low', theme: THEME })
        ).toBe('#3b9fe8')
    })

    test('modelColor matches Gemini model prefixes case-insensitively', () => {
        expect(modelColor({ model: 'GEMINI-4-NEON-HIGH', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(modelColor({ model: 'Gemini-4-Argon-Low', theme: THEME })).toBe(
            '#e8833a'
        )
        expect(
            modelColor({ model: 'GEMINI-4-HYDROGEN-MEDIUM', theme: THEME })
        ).toBe('#2dd4bf')
        expect(
            modelColor({ model: 'Gemini-3.8-Flash-High', theme: THEME })
        ).toBe('#3b9fe8')
    })

    test('MODEL_COLORS and modelColor preserve Claude and Clef badge colors', () => {
        expect(MODEL_COLORS.get('opus')).toBe('#a371f7')
        expect(MODEL_COLORS.get('sonnet')).toBe('#e8833a')
        expect(MODEL_COLORS.get('haiku')).toBe('#3b9fe8')
        expect(MODEL_COLORS.get('clef')).toBe('#3fb950')
        expect(modelColor({ model: 'Opus', theme: THEME })).toBe('#a371f7')
        expect(modelColor({ model: 'SONNET', theme: THEME })).toBe('#e8833a')
        expect(modelColor({ model: 'haiku', theme: THEME })).toBe('#3b9fe8')
        expect(modelColor({ model: 'clef', theme: THEME })).toBe('#3fb950')
    })

    test('callWords formats all agy read, list, search, and finish tools', () => {
        expect(callWords({ tool: 'view_file', target: 'src/app.ts' })).toBe(
            '≡ reading src/app.ts'
        )
        expect(callWords({ tool: 'list_dir', target: 'packages/board' })).toBe(
            '≡ listing packages/board'
        )
        expect(callWords({ tool: 'grep_search', target: 'modelColor' })).toBe(
            '⌕ searching modelColor'
        )
        expect(
            callWords({ tool: 'find_by_name', target: '*.e2e.test.ts' })
        ).toBe('⌕ searching *.e2e.test.ts')
        expect(callWords({ tool: 'finish', target: '' })).toBe('✓ finishing')
    })

    test('callWords formats all agy write, edit, and run_command tools', () => {
        expect(callWords({ tool: 'write_to_file', target: 'src/new.ts' })).toBe(
            '✎ writing src/new.ts'
        )
        expect(
            callWords({ tool: 'replace_file_content', target: 'src/a.ts' })
        ).toBe('✎ editing src/a.ts')
        expect(
            callWords({
                tool: 'multi_replace_file_content',
                target: 'src/b.ts',
            })
        ).toBe('✎ editing src/b.ts')
        expect(callWords({ tool: 'sed_file', target: 'src/c.ts' })).toBe(
            '✎ editing src/c.ts'
        )
        expect(callWords({ tool: 'notebook_edit', target: 'nb.ipynb' })).toBe(
            '✎ editing nb.ipynb'
        )
        expect(callWords({ tool: 'run_command', target: 'bun test' })).toBe(
            '▸ bun test'
        )
    })

    test('windowWords maps agy_quota to "Antigravity quota" while preserving Claude windows', () => {
        expect(windowWords({ window: 'agy_quota' })).toBe('Antigravity quota')
        expect(windowWords({ window: 'five_hour' })).toBe('five-hour')
        expect(windowWords({ window: 'seven_day' })).toBe('weekly')
        expect(windowWords({ window: 'seven_day_opus' })).toBe('weekly Opus')
        expect(windowWords({ window: 'seven_day_sonnet' })).toBe(
            'weekly Sonnet'
        )
    })
})

describe('Tier 2 — board UI boundaries and fallbacks', () => {
    test('modelColor returns foregroundMuted for empty, unknown, and incomplete-prefix model names', () => {
        const muted = THEME.colors.foregroundMuted
        expect(modelColor({ model: '', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'gpt-5', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'gemini-2-pro', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'gemini-4-neon', theme: THEME })).toBe(muted)
        expect(modelColor({ model: 'gemini-4-argon', theme: THEME })).toBe(
            muted
        )
        expect(modelColor({ model: 'gemini-3.8-flash', theme: THEME })).toBe(
            muted
        )
    })

    test('modelColor matches prefixes strictly at the start of the model string', () => {
        const muted = THEME.colors.foregroundMuted
        expect(modelColor({ model: 'gemini-4-neon-', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(modelColor({ model: 'gemini-4-argon-', theme: THEME })).toBe(
            '#e8833a'
        )
        expect(modelColor({ model: 'gemini-4-hydrogen-', theme: THEME })).toBe(
            '#2dd4bf'
        )
        expect(modelColor({ model: 'gemini-3.8-flash-', theme: THEME })).toBe(
            '#3b9fe8'
        )
        expect(
            modelColor({ model: 'not-gemini-4-neon-high', theme: THEME })
        ).toBe(muted)
        expect(
            modelColor({ model: 'my-gemini-3.8-flash-high', theme: THEME })
        ).toBe(muted)
    })

    test('callWords omits trailing spaces when target is empty', () => {
        expect(callWords({ tool: 'finish', target: '' })).toBe('✓ finishing')
        expect(callWords({ tool: 'run_command', target: '' })).toBe('▸')
        expect(callWords({ tool: 'view_file', target: '' })).toBe('≡ reading')
        expect(callWords({ tool: 'write_to_file', target: '' })).toBe(
            '✎ writing'
        )
    })

    test('callWords falls back to bullet icon for unknown tools and preserves Claude tools', () => {
        expect(
            callWords({ tool: 'browser_open', target: 'https://example.com' })
        ).toBe('• browser_open https://example.com')
        expect(callWords({ tool: 'search_web', target: '' })).toBe(
            '• search_web'
        )
        expect(callWords({ tool: 'Read', target: 'a.ts' })).toBe(
            '≡ reading a.ts'
        )
        expect(callWords({ tool: 'Bash', target: 'bun test' })).toBe(
            '▸ bun test'
        )
    })

    test('liveText renders open_call, completed action, and null states for agy tools', () => {
        const started_at = '2026-11-20T05:00:00.000Z'
        const now = Date.parse(started_at) + 125_000
        const withOpen = baseLive({
            open_call: {
                tool: 'run_command',
                target: 'bun test',
                started_at,
            },
            action: {
                tool: 'view_file',
                target: 'src/app.ts',
                at: started_at,
            },
        })
        expect(liveText({ live: withOpen, now })).toBe(
            'implementer ▸ bun test · running 2m 5s'
        )

        const withAction = baseLive({
            action: {
                tool: 'replace_file_content',
                target: 'src/app.ts',
                at: started_at,
            },
        })
        expect(liveText({ live: withAction, now })).toBe(
            'implementer ✎ editing src/app.ts'
        )
        expect(liveText({ live: baseLive(), now })).toBeNull()
        expect(liveText({ live: null, now })).toBeNull()
    })

    test('windowWords passes through unknown window keys without case folding', () => {
        expect(windowWords({ window: 'overage' })).toBe('overage')
        expect(windowWords({ window: '' })).toBe('')
        expect(windowWords({ window: 'AGY_QUOTA' })).toBe('AGY_QUOTA')
    })
})
