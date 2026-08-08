import { describe, expect, test } from 'bun:test'

import {
    parseAdvanceCommand,
    parseAllAdvanceCommands,
    stripQuotes,
} from './cli-parse.ts'

describe('parseAdvanceCommand — real invocations (must still match)', () => {
    test('bare positional form', () => {
        expect(parseAdvanceCommand('luca state advance plan')).toBe('plan')
    })

    test('after a shell operator in a compound command', () => {
        expect(parseAdvanceCommand('cd x && luca state advance plan')).toBe(
            'plan',
        )
    })

    test('long flag, both spellings', () => {
        expect(parseAdvanceCommand('luca state advance --to-step=plan')).toBe(
            'plan',
        )
        expect(parseAdvanceCommand('luca state advance --to-step plan')).toBe(
            'plan',
        )
    })

    test('path-qualified and runner-prefixed binaries', () => {
        expect(
            parseAdvanceCommand('/usr/local/bin/luca state advance execute'),
        ).toBe('execute')
        expect(parseAdvanceCommand('bun run luca state advance execute')).toBe(
            'execute',
        )
    })

    test('env-assignment prefix and trailing flags', () => {
        expect(
            parseAdvanceCommand('LUCA_DEBUG=1 luca state advance plan'),
        ).toBe('plan')
        expect(parseAdvanceCommand('luca state advance plan --force')).toBe(
            'plan',
        )
    })

    test('quoted step argument is unquoted', () => {
        expect(parseAdvanceCommand('luca state advance "plan"')).toBe('plan')
        expect(parseAdvanceCommand("luca state advance 'plan'")).toBe('plan')
    })

    test('no step argument at all', () => {
        expect(parseAdvanceCommand('luca state advance')).toBeNull()
    })

    test('not an advance invocation', () => {
        expect(parseAdvanceCommand('luca state show')).toBeNull()
        expect(parseAdvanceCommand('git status')).toBeNull()
    })
})

describe('parseAdvanceCommand — command TEXT must not be mistaken for a call', () => {
    test('quoted prose mentioning the command', () => {
        expect(
            parseAdvanceCommand(
                'echo "run luca state advance use the oracle"',
            ),
        ).toBeNull()
    })

    test('commit message mentioning the command', () => {
        expect(
            parseAdvanceCommand(
                'git commit -m "fix: luca state advance plan"',
            ),
        ).toBeNull()
    })

    test('single-quoted prose mentioning the command', () => {
        expect(
            parseAdvanceCommand("echo 'luca state advance plan'"),
        ).toBeNull()
    })

    test('shell comment', () => {
        expect(parseAdvanceCommand('# luca state advance plan')).toBeNull()
        expect(
            parseAdvanceCommand('ls -la   # luca state advance plan'),
        ).toBeNull()
    })

    test('heredoc body', () => {
        const cmd = [
            "cat <<'EOF' > notes.md",
            'luca state advance plan',
            'EOF',
        ].join('\n')
        expect(parseAdvanceCommand(cmd)).toBeNull()
    })

    test('unquoted heredoc body', () => {
        const cmd = ['cat <<EOF', 'luca state advance plan', 'EOF'].join('\n')
        expect(parseAdvanceCommand(cmd)).toBeNull()
    })

    test('variable indirection is not resolvable, so it is let through', () => {
        expect(parseAdvanceCommand('luca state advance $STEP')).toBeNull()
        expect(parseAdvanceCommand('luca state advance "$STEP"')).toBeNull()
        expect(
            parseAdvanceCommand('luca state advance --to-step=$STEP'),
        ).toBeNull()
    })
})

describe('parseAllAdvanceCommands — every advance in a chain', () => {
    test('both advances in an && chain are reported', () => {
        expect(
            parseAllAdvanceCommands(
                'luca state advance plan && luca state advance idle',
            ),
        ).toEqual(['plan', 'idle'])
    })

    test('semicolon-separated chain', () => {
        expect(
            parseAllAdvanceCommands(
                'luca state advance plan; luca state advance execute',
            ),
        ).toEqual(['plan', 'execute'])
    })

    test('newline-separated chain', () => {
        expect(
            parseAllAdvanceCommands(
                'luca state advance plan\nluca state advance execute',
            ),
        ).toEqual(['plan', 'execute'])
    })

    test('mixed positional and flag forms', () => {
        expect(
            parseAllAdvanceCommands(
                'luca state advance plan && luca state advance --to-step execute',
            ),
        ).toEqual(['plan', 'execute'])
    })

    test('empty for non-advance commands', () => {
        expect(parseAllAdvanceCommands('git status')).toEqual([])
        expect(
            parseAllAdvanceCommands('echo "luca state advance plan"'),
        ).toEqual([])
    })

    test('unresolvable steps are omitted, resolvable ones kept', () => {
        expect(
            parseAllAdvanceCommands(
                'luca state advance $STEP && luca state advance idle',
            ),
        ).toEqual(['idle'])
    })
})

describe('parseAdvanceCommand — exit-code-relevant contract for chains', () => {
    // Decision (a) is implemented at the PARSER layer only:
    // `parseAllAdvanceCommands` sees every advance, but the singular
    // `parseAdvanceCommand` — the function the pipeline-guard hook
    // consumes — still yields exactly the FIRST advance. That pins the
    // hook's exit code for chained commands to today's behaviour: the
    // first transition is guarded, the rest are the CLI's job.
    test('the singular parser yields only the first advance of a chain', () => {
        expect(
            parseAdvanceCommand(
                'luca state advance plan && luca state advance idle',
            ),
        ).toBe('plan')
    })

    test('singular parser agrees with the head of the plural parser', () => {
        const cmd = 'luca state advance plan && luca state advance idle'
        expect(parseAdvanceCommand(cmd)).toBe(
            parseAllAdvanceCommands(cmd)[0] ?? null,
        )
    })
})

describe('stripQuotes', () => {
    test('strips a matched pair', () => {
        expect(stripQuotes('"plan"')).toBe('plan')
        expect(stripQuotes("'plan'")).toBe('plan')
    })

    test('leaves unmatched or unquoted input alone', () => {
        expect(stripQuotes('plan')).toBe('plan')
        expect(stripQuotes('"plan')).toBe('"plan')
        expect(stripQuotes('plan"')).toBe('plan"')
    })
})
