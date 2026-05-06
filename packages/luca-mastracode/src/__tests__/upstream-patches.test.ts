import { describe, test, expect } from 'bun:test'

import { normalizeMultilineSlashCommand } from '../orchestration/upstream-patches.js'

describe('normalizeMultilineSlashCommand', () => {
    test('passes single-line slash commands through unchanged', () => {
        expect(normalizeMultilineSlashCommand('/lu')).toBe('/lu')
        expect(normalizeMultilineSlashCommand('/lu some args')).toBe(
            '/lu some args'
        )
        expect(normalizeMultilineSlashCommand('//custom-cmd arg1 arg2')).toBe(
            '//custom-cmd arg1 arg2'
        )
    })

    test('passes non-slash inputs through unchanged even when multiline', () => {
        const multilineMessage = 'hello\nworld\nfoo'
        expect(normalizeMultilineSlashCommand(multilineMessage)).toBe(
            multilineMessage
        )
        // Leading whitespace then non-slash is still not a slash command.
        expect(normalizeMultilineSlashCommand('  hello\nworld')).toBe(
            '  hello\nworld'
        )
    })

    test('collapses newlines in multi-line slash commands to single spaces', () => {
        const input = '/lu some \ncopied\ntext\nwhich is\nmulti-line'
        // The regex /^(\/\/?)(.*)$/ used by upstream needs the entire
        // command + args to live on one line. Collapsing trailing newlines
        // to spaces is the minimal fix that lets dispatch find `/lu`.
        expect(normalizeMultilineSlashCommand(input)).toBe(
            '/lu some copied text which is multi-line'
        )
    })

    test('handles CRLF line endings', () => {
        const input = '/lu first\r\nsecond\r\nthird'
        expect(normalizeMultilineSlashCommand(input)).toBe(
            '/lu first second third'
        )
    })

    test('handles consecutive blank lines', () => {
        const input = '/lu first\n\n\nsecond'
        expect(normalizeMultilineSlashCommand(input)).toBe('/lu first second')
    })

    test('handles indented continuation lines', () => {
        const input = '/lu first\n    indented\n\tboth'
        // Leading tabs/spaces on continuation lines are absorbed into the
        // single collapsing space — args.join(' ') would discard them anyway.
        expect(normalizeMultilineSlashCommand(input)).toBe(
            '/lu first indented both'
        )
    })

    test('handles double-slash custom commands', () => {
        const input = '//gh-prepare some\nmultiline\nbody'
        expect(normalizeMultilineSlashCommand(input)).toBe(
            '//gh-prepare some multiline body'
        )
    })

    test('preserves leading whitespace before the slash', () => {
        // We don't trim — upstream still calls .trim() itself, and we want
        // a surgical change. Verify leading whitespace round-trips.
        const input = '  /lu first\nsecond'
        expect(normalizeMultilineSlashCommand(input)).toBe('  /lu first second')
    })

})
