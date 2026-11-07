import { describe, expect, test } from 'bun:test'

import { testCommandsToRun, type TestCommand } from './test-commands'

/**
 * Tests by path (#722): at a ticket's own gates, a test command with
 * `paths` runs only when the ticket changed a file under them, unless a
 * changed test file is under no command's `paths`.
 */

const commands: TestCommand[] = [
    {
        run: 'bun test src/a',
        results: 'bun',
        junit_path: [],
        paths: ['src/a/**'],
    },
    {
        run: 'bun test src/b',
        results: 'bun',
        junit_path: [],
        paths: ['src/b/**'],
    },
    {
        run: 'bun run lint:tests',
        results: 'pass_fail',
        junit_path: [],
        paths: null,
    },
]

const runs = (list: TestCommand[]) => list.map(({ run }) => run)

describe('testCommandsToRun', () => {
    test('a command with paths no changed file matches is skipped; one without paths runs', () => {
        const { run, skipped } = testCommandsToRun({
            commands,
            changed_files: ['src/b/x.ts', 'src/b/x.test.ts'],
            test_file_patterns: ['**/*.test.ts'],
        })

        expect(runs(run)).toEqual(['bun test src/b', 'bun run lint:tests'])
        expect(runs(skipped)).toEqual(['bun test src/a'])
    })

    test("a changed test file no command's paths match makes every command run", () => {
        const { run, skipped } = testCommandsToRun({
            commands,
            changed_files: ['src/b/x.ts', 'src/c/c.test.ts'],
            test_file_patterns: ['**/*.test.ts'],
        })

        expect(runs(run)).toEqual([
            'bun test src/a',
            'bun test src/b',
            'bun run lint:tests',
        ])
        expect(skipped).toEqual([])
    })

    test('a deleted file still counts as changed', () => {
        const { run } = testCommandsToRun({
            commands,
            changed_files: ['src/a/gone.ts'],
            test_file_patterns: ['**/*.test.ts'],
        })

        expect(runs(run)).toContain('bun test src/a')
    })
})
