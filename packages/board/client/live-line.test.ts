import { describe, expect, test } from 'bun:test'

import { callWords, liveText } from './live-line'

import type { LiveAgent } from '../shared/board-state'

const makeLive = ({
    role,
    action,
    open_call,
}: {
    role: string
    action: LiveAgent['action']
    open_call: LiveAgent['open_call']
}): LiveAgent => ({
    ticket: 780,
    role,
    model: 'gemini-4-neon-high',
    tokens: 1200,
    action,
    open_call,
    activity: [],
    helpers: [],
})

/**
 * Tool icons and verbs on live agent cards (#780): all 11 agy tools format
 * with exact icons and verbs while existing Claude tools and unknown-tool
 * fallbacks remain unchanged.
 */
describe('live-line (#780)', () => {
    test('formats all 11 agy tools with exact icons and verbs', () => {
        expect(callWords({ tool: 'view_file', target: 'board-look.ts' })).toBe(
            '≡ reading board-look.ts'
        )
        expect(callWords({ tool: 'read_file', target: 'board-look.ts' })).toBe(
            '≡ reading board-look.ts'
        )
        expect(callWords({ tool: 'list_dir', target: 'packages/board' })).toBe(
            '≡ listing packages/board'
        )
        expect(callWords({ tool: 'grep_search', target: 'MODEL_COLORS' })).toBe(
            '⌕ searching MODEL_COLORS'
        )
        expect(callWords({ tool: 'find_by_name', target: '*.test.ts' })).toBe(
            '⌕ searching *.test.ts'
        )
        expect(callWords({ tool: 'write_to_file', target: 'new.ts' })).toBe(
            '✎ writing new.ts'
        )
        expect(callWords({ tool: 'write_file', target: 'new.ts' })).toBe(
            '✎ writing new.ts'
        )
        expect(
            callWords({ tool: 'replace_file_content', target: 'live-line.ts' })
        ).toBe('✎ editing live-line.ts')
        expect(callWords({ tool: 'edit_file', target: 'live-line.ts' })).toBe(
            '✎ editing live-line.ts'
        )
        expect(
            callWords({
                tool: 'multi_replace_file_content',
                target: 'live-line.ts',
            })
        ).toBe('✎ editing live-line.ts')
        expect(callWords({ tool: 'sed_file', target: 'live-line.ts' })).toBe(
            '✎ editing live-line.ts'
        )
        expect(
            callWords({ tool: 'notebook_edit', target: 'analysis.ipynb' })
        ).toBe('✎ editing analysis.ipynb')
        expect(callWords({ tool: 'run_command', target: 'bun test' })).toBe(
            '▸ bun test'
        )
        expect(callWords({ tool: 'run_command', target: '' })).toBe('▸')
        expect(callWords({ tool: 'finish', target: '' })).toBe('✓ finishing')
        expect(callWords({ tool: 'finish', target: 'done' })).toBe(
            '✓ finishing done'
        )
    })

    test('preserves all existing Claude tools and unknown tool fallback', () => {
        expect(callWords({ tool: 'Edit', target: 'a.ts' })).toBe(
            '✎ editing a.ts'
        )
        expect(callWords({ tool: 'MultiEdit', target: 'a.ts' })).toBe(
            '✎ editing a.ts'
        )
        expect(callWords({ tool: 'NotebookEdit', target: 'a.ipynb' })).toBe(
            '✎ editing a.ipynb'
        )
        expect(callWords({ tool: 'Write', target: 'a.ts' })).toBe(
            '✎ writing a.ts'
        )
        expect(callWords({ tool: 'Read', target: 'a.ts' })).toBe(
            '≡ reading a.ts'
        )
        expect(callWords({ tool: 'Grep', target: 'foo' })).toBe(
            '⌕ searching foo'
        )
        expect(callWords({ tool: 'Glob', target: '*.ts' })).toBe(
            '⌕ searching *.ts'
        )
        expect(callWords({ tool: 'Bash', target: 'bun run lint' })).toBe(
            '▸ bun run lint'
        )
        expect(callWords({ tool: 'Agent', target: 'searcher' })).toBe(
            '⇢ helper searcher'
        )
        expect(callWords({ tool: 'Task', target: 'searcher' })).toBe(
            '⇢ helper searcher'
        )
        expect(callWords({ tool: 'custom_tool', target: 'arg' })).toBe(
            '• custom_tool arg'
        )
        expect(callWords({ tool: 'custom_tool', target: '' })).toBe(
            '• custom_tool'
        )
        expect(callWords({ tool: 'toString', target: 'x' })).toBe(
            '• toString x'
        )
        expect(callWords({ tool: 'constructor', target: '' })).toBe(
            '• constructor'
        )
        expect(callWords({ tool: 'valueOf', target: 'arg' })).toBe(
            '• valueOf arg'
        )
        expect(callWords({ tool: '__proto__', target: 'x' })).toBe(
            '• __proto__ x'
        )
    })

    test('liveText formats run_command open calls and finish actions', () => {
        const startedAt = '2026-11-20T16:00:00.000Z'
        const now = Date.parse('2026-11-20T16:03:12.000Z')
        const running = makeLive({
            role: 'implementer',
            action: null,
            open_call: {
                tool: 'run_command',
                target: 'bun test',
                started_at: startedAt,
            },
        })
        const finishing = makeLive({
            role: 'implementer',
            action: {
                tool: 'finish',
                target: '',
                at: startedAt,
            },
            open_call: null,
        })

        expect(liveText({ live: running, now })).toBe(
            'implementer ▸ bun test · running 3m 12s'
        )
        expect(liveText({ live: finishing, now })).toBe(
            'implementer ✓ finishing'
        )
    })
})
