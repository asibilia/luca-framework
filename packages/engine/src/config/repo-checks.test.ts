import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import type { EngineConfig } from './engine-config'
import { repoChecks, runRepoChecks } from './repo-checks'

/**
 * A repo's checks (#788), shared by `luca check` and
 * `scripts/run-checks.ts`: which ones run, in what order, and the exit code.
 */

const CONFIG: EngineConfig = {
    checks: {
        test: 'bun test src',
        slow_test: 'bun test .e2e.test',
        types: 'bunx tsc --noEmit',
        lint: 'bun run lint',
    },
    test_case_timeout_ms: 2000,
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const ALL = { only: null, skip_slow: false }

describe('the checks a pick keeps', () => {
    test('all of them, in order, the fast bun test with its speed limit', () => {
        expect(repoChecks({ config: CONFIG, pick: ALL })).toEqual([
            { name: 'test', command: 'bun test src --timeout=2000' },
            { name: 'slow_test', command: 'bun test .e2e.test' },
            { name: 'types', command: 'bunx tsc --noEmit' },
            { name: 'lint', command: 'bun run lint' },
        ])
    })

    test('--only keeps the named ones, in config order', () => {
        const checks = repoChecks({
            config: CONFIG,
            pick: { only: ['lint', 'types'], skip_slow: false },
        })
        expect(checks.map(({ name }) => name)).toEqual(['types', 'lint'])
    })

    test('--skip-slow leaves out the slow tests', () => {
        const checks = repoChecks({
            config: CONFIG,
            pick: { only: null, skip_slow: true },
        })
        expect(checks.map(({ name }) => name)).toEqual([
            'test',
            'types',
            'lint',
        ])
    })

    test('a list of test commands runs each one', () => {
        const checks = repoChecks({
            config: {
                ...CONFIG,
                checks: { test: ['bun test a', 'make test'] },
            },
            pick: ALL,
        })
        expect(checks).toEqual([
            { name: 'test', command: 'bun test a --timeout=2000' },
            { name: 'test', command: 'make test' },
        ])
    })
})

describe('running the checks', () => {
    let repo = ''
    beforeEach(async () => {
        repo = await mkdtemp(join(tmpdir(), 'luca-repo-checks-'))
        await Bun.write(
            join(repo, '.luca/config.json'),
            JSON.stringify({
                checks: { types: 'types-cmd', lint: 'lint-cmd' },
                test_file_patterns: [],
                test_setup_files: [],
                rule_files: [],
            })
        )
    })
    afterEach(async () => {
        await rm(repo, { recursive: true, force: true })
    })

    const quietly = async (run: () => Promise<number>) => {
        const log = spyOn(console, 'log').mockImplementation(() => {})
        const error = spyOn(console, 'error').mockImplementation(() => {})
        try {
            const code = await run()
            return {
                code,
                said: [...log.mock.calls, ...error.mock.calls].join('\n'),
            }
        } finally {
            log.mockRestore()
            error.mockRestore()
        }
    }

    test('every check runs in the repo even after one fails, and the exit is 1', async () => {
        const ran: { command: string; cwd: string }[] = []
        let seen_env: Record<string, string> = {}
        const { code, said } = await quietly(() =>
            runRepoChecks({
                repo_root: repo,
                pick: ALL,
                run: async (args) => {
                    ran.push({ command: args.command, cwd: args.cwd })
                    seen_env = args.env
                    return args.command !== 'types-cmd'
                },
            })
        )
        expect(ran).toEqual([
            { command: 'types-cmd', cwd: repo },
            { command: 'lint-cmd', cwd: repo },
        ])
        // Each check gets an explicit env, git's repo-local variables left out (#791).
        expect(seen_env.PATH).toBe(process.env.PATH ?? '')
        expect(Object.keys(seen_env)).not.toContain('GIT_DIR')
        expect(code).toBe(1)
        expect(said).toContain('1 of 2 check(s) failed')
        expect(said).toContain('types: types-cmd')
    })

    test('all passing exits 0', async () => {
        const { code, said } = await quietly(() =>
            runRepoChecks({ repo_root: repo, pick: ALL, run: async () => true })
        )
        expect(code).toBe(0)
        expect(said).toContain('All 2 checks passed.')
    })

    test('an --only the config has none of fails, and says so', async () => {
        const { code, said } = await quietly(() =>
            runRepoChecks({
                repo_root: repo,
                pick: { only: ['slow_test'], skip_slow: false },
                run: async () => true,
            })
        )
        expect(code).toBe(1)
        expect(said).toContain('lists none of: slow_test')
    })

    test('a repo without .luca/config.json fails, and says where it looked', async () => {
        const empty = join(repo, 'nothing-here')
        const { code, said } = await quietly(() =>
            runRepoChecks({
                repo_root: empty,
                pick: ALL,
                run: async () => true,
            })
        )
        expect(code).toBe(1)
        expect(said).toContain('No engine config found')
    })
})
