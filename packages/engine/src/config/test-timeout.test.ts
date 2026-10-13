import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    EngineConfigSchema,
    loadEngineConfig,
    testTimeoutOf,
} from './engine-config'

import { DEFAULT_COMMAND_TIMEOUT_MS } from '../shell/run-command'

/**
 * The test commands' time limit (#542): an optional `test_timeout_ms` in
 * `.luca/config.json`, for repos whose tests take longer than 5 minutes.
 */

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-test-timeout-'))
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

describe('engine config: the test time limit (#542)', () => {
    test('test_timeout_ms is kept as written', async () => {
        await writeConfig({
            config: { checks: { test: 'bun test' }, test_timeout_ms: 900_000 },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.test_timeout_ms).toBe(900_000)
        expect(testTimeoutOf({ config: result.config })).toBe(900_000)
    })

    test('left out, test commands get 5 minutes', async () => {
        await writeConfig({ config: { checks: { test: 'bun test' } } })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.test_timeout_ms).toBeUndefined()
        expect(DEFAULT_COMMAND_TIMEOUT_MS).toBe(300_000)
        expect(testTimeoutOf({ config: result.config })).toBe(300_000)
    })

    test.each([0, -1, 1.5, '600000', null])(
        'test_timeout_ms of %p is an error naming it',
        async (value) => {
            await writeConfig({
                config: {
                    checks: { test: 'bun test' },
                    test_timeout_ms: value,
                },
            })
            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('test_timeout_ms')
            expect(
                EngineConfigSchema.safeParse({ test_timeout_ms: value }).success
            ).toBe(false)
        }
    )
})
