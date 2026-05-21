import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ShadowScanFinding } from '@alecsibilia/luca-core'

import { lucaRepoCleanupApplyTool } from './luca-repo-cleanup-apply.ts'

function finding(over: Partial<ShadowScanFinding>): ShadowScanFinding {
    return {
        category: 'orphaned-temp-script',
        severity: 'medium',
        file_path: 'debug-temp.ts',
        description: 'temp script',
        recommendation: 'delete it',
        recommended_action: 'delete',
        auto_fixable: true,
        ...over,
    }
}

describe('luca_repo_cleanup_apply', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-cleanup-apply-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('refuses to act when confirm is false', async () => {
        await writeFile(join(cwd, 'debug-temp.ts'), 'x')

        const r = await lucaRepoCleanupApplyTool.handler(
            { finding: finding({}), confirm: false },
            { cwd },
        )

        expect(r.isError).toBe(true)
        // File untouched.
        expect(existsSync(join(cwd, 'debug-temp.ts'))).toBe(true)
    })

    test('delete action removes the file when confirmed', async () => {
        await writeFile(join(cwd, 'debug-temp.ts'), 'x')

        const r = await lucaRepoCleanupApplyTool.handler(
            { finding: finding({}), confirm: true },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        expect(existsSync(join(cwd, 'debug-temp.ts'))).toBe(false)
    })

    test('move action relocates the file and creates parent dirs', async () => {
        await writeFile(join(cwd, 'SUMMARY-3.md'), 'summary')

        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({
                    file_path: 'SUMMARY-3.md',
                    recommended_action: 'move',
                    target_path: 'docs/archive/summary-3.md',
                }),
                confirm: true,
            },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        expect(existsSync(join(cwd, 'SUMMARY-3.md'))).toBe(false)
        expect(
            existsSync(join(cwd, 'docs/archive/summary-3.md')),
        ).toBe(true)
    })

    test('move action errors when target_path is missing', async () => {
        await writeFile(join(cwd, 'SUMMARY-3.md'), 'summary')

        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({
                    file_path: 'SUMMARY-3.md',
                    recommended_action: 'move',
                }),
                confirm: true,
            },
            { cwd },
        )

        expect(r.isError).toBe(true)
    })

    test('gitignore action appends the path to .gitignore', async () => {
        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({
                    file_path: '.cache/',
                    recommended_action: 'gitignore',
                }),
                confirm: true,
            },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8')
        expect(gitignore).toContain('.cache/')
    })

    test('gitignore action is idempotent', async () => {
        await writeFile(join(cwd, '.gitignore'), '.cache/\n')

        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({
                    file_path: '.cache/',
                    recommended_action: 'gitignore',
                }),
                confirm: true,
            },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        const gitignore = await readFile(join(cwd, '.gitignore'), 'utf-8')
        expect(gitignore.match(/\.cache\//g)).toHaveLength(1)
    })

    test('refuses path traversal outside the project root', async () => {
        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({ file_path: '../escape.ts' }),
                confirm: true,
            },
            { cwd },
        )
        expect(r.isError).toBe(true)
    })

    test('refuses to delete inside .git/', async () => {
        await mkdir(join(cwd, '.git'), { recursive: true })
        await writeFile(join(cwd, '.git/config'), 'x')

        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({ file_path: '.git/config' }),
                confirm: true,
            },
            { cwd },
        )
        expect(r.isError).toBe(true)
        expect(existsSync(join(cwd, '.git/config'))).toBe(true)
    })

    test('refuses a move whose target escapes the project root', async () => {
        await writeFile(join(cwd, 'temp.ts'), 'x')

        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({
                    file_path: 'temp.ts',
                    recommended_action: 'move',
                    target_path: '../escape.ts',
                }),
                confirm: true,
            },
            { cwd },
        )
        expect(r.isError).toBe(true)
    })

    test('skips gracefully when the target file does not exist', async () => {
        const r = await lucaRepoCleanupApplyTool.handler(
            {
                finding: finding({ file_path: 'never-existed.ts' }),
                confirm: true,
            },
            { cwd },
        )
        // Not an error — just nothing to do.
        expect(r.isError).toBeFalsy()
        expect((r.content[0] as { text: string }).text).toContain('skipped')
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaRepoCleanupApplyTool.allowedPhases).toBeUndefined()
    })
})
