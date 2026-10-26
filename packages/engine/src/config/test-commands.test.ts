import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    EngineConfigSchema,
    hasSlowTests,
    loadEngineConfig,
    slowTestCommands,
    testCommands,
} from './engine-config'

/**
 * Several test commands per repo (#428): `checks.test` is one command
 * string, as before, or a list of command strings and `{ run, results }`
 * entries. `testCommands` gives every entry with its `results` kind.
 */

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-test-commands-'))
})

afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
})

const writeConfig = async ({ config }: { config: object }) => {
    await mkdir(join(repoRoot, '.luca'), { recursive: true })
    await writeFile(
        join(repoRoot, '.luca', 'config.json'),
        JSON.stringify(config)
    )
}

/** Loads a config with these checks and returns its test commands, or throws. */
const loadTestCommands = async ({ checks }: { checks: object }) => {
    await writeConfig({ config: { checks } })
    const result = await loadEngineConfig({ repo_root: repoRoot })
    if (!result.ok) throw new Error(result.error)
    return testCommands({ config: result.config })
}

describe('engine config: several test commands', () => {
    test('checks.test may be a list of command strings and { run, results } entries', async () => {
        const commands = await loadTestCommands({
            checks: {
                test: [
                    'bun test',
                    { run: 'bun run test:workers', results: 'pass_fail' },
                    { run: 'bun test packages/api', results: 'bun' },
                ],
                types: 'bun run type-check',
            },
        })

        expect(commands).toMatchObject([
            { run: 'bun test', results: 'bun' },
            { run: 'bun run test:workers', results: 'pass_fail' },
            { run: 'bun test packages/api', results: 'bun' },
        ])
    })

    test('a results kind other than bun or pass_fail is an error naming checks.test', async () => {
        await writeConfig({
            config: {
                checks: { test: [{ run: 'vitest run', results: 'pass_fail' }] },
            },
        })
        expect((await loadEngineConfig({ repo_root: repoRoot })).ok).toBe(true)

        await writeConfig({
            config: {
                checks: { test: [{ run: 'vitest run', results: 'vitest' }] },
            },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('checks.test')
    })

    test('a list entry without a command is an error naming checks.test', async () => {
        await writeConfig({
            config: { checks: { test: ['bun test', { run: 'bun run e2e' }] } },
        })
        expect((await loadEngineConfig({ repo_root: repoRoot })).ok).toBe(true)

        await writeConfig({
            config: { checks: { test: ['bun test', { results: 'bun' }] } },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('checks.test')
    })

    test('a command starting with bun test defaults to bun results', async () => {
        const commands = await loadTestCommands({
            checks: {
                test: [
                    'bun test',
                    'bun test packages',
                    { run: 'bun test --timeout 20000 src' },
                ],
            },
        })

        expect(commands).toMatchObject([
            { run: 'bun test', results: 'bun' },
            { run: 'bun test packages', results: 'bun' },
            { run: 'bun test --timeout 20000 src', results: 'bun' },
        ])
    })

    test('any other command defaults to pass_fail results', async () => {
        const commands = await loadTestCommands({
            checks: {
                test: [
                    'bun run test:workers',
                    'bunx vitest run',
                    { run: 'npm test' },
                ],
            },
        })

        expect(commands).toMatchObject([
            { run: 'bun run test:workers', results: 'pass_fail' },
            { run: 'bunx vitest run', results: 'pass_fail' },
            { run: 'npm test', results: 'pass_fail' },
        ])
    })

    test('an explicit results kind wins over the default', async () => {
        const commands = await loadTestCommands({
            checks: {
                test: [
                    { run: 'bun test e2e', results: 'pass_fail' },
                    { run: 'bun run test', results: 'bun' },
                ],
            },
        })

        expect(commands).toMatchObject([
            { run: 'bun test e2e', results: 'pass_fail' },
            { run: 'bun run test', results: 'bun' },
        ])
    })

    test('a single test string is one bun test command, and reads back as written', async () => {
        await writeConfig({ config: { checks: { test: 'bun test packages' } } })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.checks).toEqual({ test: 'bun test packages' })
        expect(testCommands({ config: result.config })).toMatchObject([
            { run: 'bun test packages', results: 'bun' },
        ])
    })

    test('a config without a test command has no test commands', async () => {
        await writeConfig({ config: { checks: { lint: 'bun run lint' } } })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(testCommands({ config: result.config })).toEqual([])
    })
})

describe('the slow test command (#563)', () => {
    test('checks.slow_test loads as a string and as a list, with the same kinds as checks.test', () => {
        const one = EngineConfigSchema.parse({
            checks: { test: 'bun test src', slow_test: 'bun test .e2e.test' },
        })
        expect(slowTestCommands({ config: one })).toMatchObject([
            { run: 'bun test .e2e.test', results: 'bun' },
        ])
        const many = EngineConfigSchema.parse({
            checks: {
                test: 'bun test',
                slow_test: ['bun test e2e', { run: 'bun run e2e:workers' }],
            },
        })
        expect(slowTestCommands({ config: many })).toMatchObject([
            { run: 'bun test e2e', results: 'bun' },
            { run: 'bun run e2e:workers', results: 'pass_fail' },
        ])
        expect(hasSlowTests({ config: many })).toBe(true)
    })

    test('left out, there are no slow commands', () => {
        const config = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
        })
        expect(slowTestCommands({ config })).toEqual([])
        expect(hasSlowTests({ config })).toBe(false)
    })

    test('a bad checks.slow_test is refused with the usual message', async () => {
        await writeConfig({
            config: { checks: { test: 'bun test', slow_test: '' } },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('slow_test')
    })
})

/** Loads a config with these checks and returns its error, or throws. */
const loadError = async ({ checks }: { checks: object }) => {
    await writeConfig({ config: { checks } })
    const result = await loadEngineConfig({ repo_root: repoRoot })
    if (result.ok) throw new Error('The config loaded')
    return result.error
}

const CORE_JUNIT = [
    'packages/ios/.derived/junit/core.xml',
    'packages/ios/.derived/junit/core-swift-testing.xml',
]

const JUNIT_ENTRY = {
    run: 'bun run ios:test:core',
    results: 'junit',
    junit_path: CORE_JUNIT,
}

describe('junit test commands (#668)', () => {
    test('checks.test and checks.slow_test load a junit entry with its junit_path', async () => {
        await writeConfig({
            config: {
                checks: { test: [JUNIT_ENTRY], slow_test: [JUNIT_ENTRY] },
            },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        for (const commands of [
            testCommands({ config: result.config }),
            slowTestCommands({ config: result.config }),
        ]) {
            expect(commands).toEqual([
                {
                    run: 'bun run ios:test:core',
                    results: 'junit',
                    junit_path: CORE_JUNIT,
                },
            ])
        }
    })

    test('a junit_path of one string loads as a list of that path', async () => {
        const commands = await loadTestCommands({
            checks: {
                test: [
                    {
                        run: 'bun run ios:test:core',
                        results: 'junit',
                        junit_path: 'packages/ios/.derived/junit/core.xml',
                    },
                ],
            },
        })

        expect(commands).toEqual([
            {
                run: 'bun run ios:test:core',
                results: 'junit',
                junit_path: ['packages/ios/.derived/junit/core.xml'],
            },
        ])
    })

    test('a bun or pass_fail command has an empty junit_path', async () => {
        const commands = await loadTestCommands({
            checks: {
                test: [
                    'bun test',
                    'bun run test:workers',
                    { run: 'bun test e2e', results: 'pass_fail' },
                ],
            },
        })

        expect(commands).toEqual([
            { run: 'bun test', results: 'bun', junit_path: [] },
            {
                run: 'bun run test:workers',
                results: 'pass_fail',
                junit_path: [],
            },
            { run: 'bun test e2e', results: 'pass_fail', junit_path: [] },
        ])
    })

    test('a junit entry without junit_path is refused, naming checks.test', async () => {
        const error = await loadError({
            checks: {
                test: [{ run: 'bun run ios:test:core', results: 'junit' }],
            },
        })

        expect(error).toContain('checks.test')
        expect(error).toContain(
            'a "junit" test command needs junit_path: the JUnit files it writes, relative to the repo root'
        )
    })

    test('a junit_path on a bun entry is refused', async () => {
        const error = await loadError({
            checks: {
                test: [
                    {
                        run: 'bun test',
                        results: 'bun',
                        junit_path: ['junit/core.xml'],
                    },
                ],
            },
        })

        expect(error).toContain(
            'junit_path is only for a test command with "results": "junit"'
        )
    })

    test('a junit_path that is absolute, leaves the repo or ends in / is refused', async () => {
        for (const path of ['/tmp/core.xml', '../core.xml', 'junit/']) {
            const error = await loadError({
                checks: {
                    test: [
                        {
                            run: 'bun run ios:test:core',
                            results: 'junit',
                            junit_path: [path],
                        },
                    ],
                },
            })

            expect(error).toContain(
                'must be a file inside the repo, relative to its root'
            )
        }
    })
})

describe('the engine README', () => {
    test('documents the junit results kind and its junit_path', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'docs', 'choices-made.md')
        ).text()

        expect(text).toContain('junit')
        expect(text).toContain('junit_path')
    })

    test('documents test command lists and their results kinds', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'docs', 'choices-made.md')
        ).text()

        expect(text).toContain('checks.test')
        expect(text).toContain('checks.slow_test')
        expect(text).toContain('pass_fail')
        expect(text).toMatch(/`results`|"results"/)
    })
})
