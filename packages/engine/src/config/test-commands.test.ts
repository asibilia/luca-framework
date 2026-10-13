import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { loadEngineConfig, testCommands } from './engine-config'

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

        expect(commands).toEqual([
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

        expect(commands).toEqual([
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

        expect(commands).toEqual([
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

        expect(commands).toEqual([
            { run: 'bun test e2e', results: 'pass_fail' },
            { run: 'bun run test', results: 'bun' },
        ])
    })

    test('a single test string is one bun test command, and reads back as written', async () => {
        await writeConfig({ config: { checks: { test: 'bun test packages' } } })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.checks).toEqual({ test: 'bun test packages' })
        expect(testCommands({ config: result.config })).toEqual([
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

describe('the engine README', () => {
    test('documents test command lists and their results kinds', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toContain('checks.test')
        expect(text).toContain('pass_fail')
        expect(text).toMatch(/`results`|"results"/)
    })
})
