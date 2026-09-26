import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { DEFAULT_RUN_BUDGET_TOKENS } from './run-budget'

import { loadEngineConfig } from '../config/engine-config'

/**
 * The run budget (#435): the engine's default, a named constant worked out
 * from the v1 dogfood journals, and `run_budget_tokens` in a repo's engine
 * config, which overrides it.
 */

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-run-budget-'))
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

describe('the default run budget', () => {
    test('is a whole, positive number of tokens', () => {
        expect(Number.isInteger(DEFAULT_RUN_BUDGET_TOKENS)).toBe(true)
        expect(DEFAULT_RUN_BUDGET_TOKENS).toBeGreaterThan(0)
    })

    test('is a named constant whose comment says it is 3 times the largest run total in the v1 dogfood journals', async () => {
        const source = await Bun.file(
            join(import.meta.dir, 'run-budget.ts')
        ).text()

        expect(source).toContain('export const DEFAULT_RUN_BUDGET_TOKENS')
        expect(source).toMatch(/dogfood/i)
        expect(source).toMatch(/\b(3|three)\s*(times|×|x)\b/i)
        expect(source).toMatch(/largest|biggest|highest/i)
    })
})

describe('engine config: run_budget_tokens', () => {
    test('a config with run_budget_tokens keeps it', async () => {
        await writeConfig({
            config: {
                checks: { test: 'bun test' },
                run_budget_tokens: 12_000_000,
            },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config).toMatchObject({ run_budget_tokens: 12_000_000 })
    })

    test('a config without run_budget_tokens still loads, with none set', async () => {
        await writeConfig({ config: { checks: { test: 'bun test' } } })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.run_budget_tokens).toBeUndefined()
    })

    test('a run_budget_tokens that is not a positive whole number is refused with a clear error', async () => {
        for (const run_budget_tokens of [0, -5, 1.5, 'lots']) {
            await writeConfig({
                config: { checks: { test: 'bun test' }, run_budget_tokens },
            })
            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            expect(result.ok ? '' : result.error).toContain('run_budget_tokens')
        }
    })
})

describe('the engine README', () => {
    test('explains the run budget and how to change it with run_budget_tokens', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toMatch(/run budget/i)
        expect(text).toContain('run_budget_tokens')
        expect(text).toMatch(/`retry`/)
        expect(text).toMatch(/`stop`/)
    })
})
