import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { configChanges, FROZEN_FIELDS, RELOADED_FIELDS } from './config-reload'
import { EngineConfigSchema, loadEngineConfig } from './engine-config'

import { roleInstructions } from '../agents/role-instructions'

/**
 * `test_helper_patterns` in `.luca/config.json` (#619): globs for non-test
 * files the test-writer may also write. Frozen on resume, refused when bad,
 * named in the test-writer's prompt, and set by this repo.
 */

const ROOT = join(import.meta.dir, '../../../..')

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-engine-test-helpers-'))
})

afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
})

const loadWith = async (test_helper_patterns: unknown) => {
    await mkdir(join(repoRoot, '.luca'), { recursive: true })
    await writeFile(
        join(repoRoot, '.luca', 'config.json'),
        JSON.stringify({ checks: { test: 'bun test' }, test_helper_patterns })
    )
    return loadEngineConfig({ repo_root: repoRoot })
}

describe('the test_helper_patterns setting (#619)', () => {
    test('a list of globs is kept, and one that is not a list of patterns is an error naming the field', async () => {
        const good = await loadWith(['src/**/testing/**', 'test/fixtures/**'])
        expect(good.ok && good.config.test_helper_patterns).toEqual([
            'src/**/testing/**',
            'test/fixtures/**',
        ])
        for (const bad of ['src/testing/**', [42], [''], { src: true }]) {
            const result = await loadWith(bad)
            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error).toContain('test_helper_patterns')
            }
        }
    })

    test('test_helper_patterns is frozen: a resume keeps the patterns the run started with', () => {
        expect(FROZEN_FIELDS).toContain('test_helper_patterns')
        expect(RELOADED_FIELDS).not.toContain('test_helper_patterns')
        const current = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            test_helper_patterns: ['src/**/testing/**'],
        })
        const next = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            test_helper_patterns: ['src/**/testing/**', 'fixtures/**'],
        })
        expect(configChanges({ current, next })).toEqual([])
    })

    test("the test-writer's prompt names the helper patterns among the files it may write, and the implementer's does not", () => {
        const config = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            test_file_patterns: ['src/**/*.test.ts'],
            test_helper_patterns: ['src/**/testing/**'],
        })
        const writer = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config,
        })
        expect(writer).toMatch(
            /Create or edit ONLY[^\n]*src\/\*\*\/testing\/\*\*/
        )
        const implementer = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config,
        })
        expect(implementer).not.toContain('src/**/testing/**')
    })

    test("this repo's config sets test_helper_patterns to packages/**/testing/**, and the test-writer's prompt names it", async () => {
        const loaded = await loadEngineConfig({ repo_root: ROOT })
        expect(loaded.ok).toBe(true)
        if (!loaded.ok) return
        expect(loaded.config.test_helper_patterns).toEqual([
            'packages/**/testing/**',
        ])
        expect(
            roleInstructions({
                role: 'test-writer',
                may_edit_tests: true,
                config: loaded.config,
            })
        ).toContain('packages/**/testing/**')
    })
})
