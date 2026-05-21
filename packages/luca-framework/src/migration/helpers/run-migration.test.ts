import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runMigration } from './run-migration.ts'

async function initGitRepo(dir: string): Promise<void> {
    await Bun.$`git init --quiet`.cwd(dir).quiet()
    await Bun.$`git config user.email test@example.com`.cwd(dir).quiet()
    await Bun.$`git config user.name test`.cwd(dir).quiet()
    // First commit so HEAD exists for subsequent operations.
    await Bun.$`git commit --quiet --allow-empty -m init`.cwd(dir).quiet()
}

async function commitFile(
    dir: string,
    relPath: string,
    content: string
): Promise<void> {
    const full = join(dir, relPath)
    const parent = full.slice(0, full.lastIndexOf('/'))
    await mkdir(parent, { recursive: true })
    await writeFile(full, content)
    await Bun.$`git add ${relPath}`.cwd(dir).quiet()
    await Bun.$`git commit --quiet -m "add ${relPath}"`.cwd(dir).quiet()
}

describe('runMigration', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-migrate-test-'))
        await initGitRepo(cwd)
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns an empty plan when .planning/ does not exist', async () => {
        const result = await runMigration({ cwd, dryRun: true })
        expect(result.plan.moves).toEqual([])
        expect(result.plan.deletes).toEqual([])
    })

    test.each([
        ['luca-state.json', 'state.json'],
        ['state.json', 'state.json'],
        ['.luca-lock.json', 'lock.json'],
        ['ROADMAP.md', 'roadmap.md'],
        ['config.json', 'config.json'],
        ['session-ledger.jsonl', 'ledger.jsonl'],
    ])('plans .planning/%s → .luca/%s', async (src, dest) => {
        await mkdir(join(cwd, '.planning'), { recursive: true })
        await writeFile(join(cwd, '.planning', src), '')

        const result = await runMigration({ cwd, dryRun: true })

        expect(result.plan.moves).toContainEqual({
            from: `.planning/${src}`,
            to: `.luca/${dest}`,
        })
    })

    test('executes the plan when dryRun is false', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{"x":1}')

        await runMigration({ cwd, dryRun: false })

        expect(existsSync(join(cwd, '.planning/luca-state.json'))).toBe(false)
        expect(existsSync(join(cwd, '.luca/state.json'))).toBe(true)
        const content = await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        expect(JSON.parse(content)).toEqual({ x: 1 })
    })

    test('leaves files in place when dryRun is true', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{}')

        await runMigration({ cwd, dryRun: true })

        expect(existsSync(join(cwd, '.planning/luca-state.json'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/state.json'))).toBe(false)
    })

    test('preserves git history via git mv', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{}')

        await runMigration({ cwd, dryRun: false })
        // runMigration uses git mv, which stages the rename. Commit it so
        // git log can see it.
        await Bun.$`git commit --quiet -m migrate`.cwd(cwd).quiet()

        // git log --follow on the new path should still see the original
        // commit that added .planning/luca-state.json. With plain `mv` this
        // would show only the rename commit; with `git mv` it follows back.
        const log =
            await Bun.$`git log --follow --pretty=format:%s -- .luca/state.json`
                .cwd(cwd)
                .text()
        expect(log).toContain('add .planning/luca-state.json')
    })

    test('refuses to run when .planning/ has uncommitted changes', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{}')
        // Introduce a dirty change in .planning/
        await writeFile(
            join(cwd, '.planning/luca-state.json'),
            '{"dirty":true}'
        )

        await expect(runMigration({ cwd, dryRun: false })).rejects.toThrow(
            /uncommitted/i
        )
        // File should remain untouched
        expect(existsSync(join(cwd, '.planning/luca-state.json'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/state.json'))).toBe(false)
    })

    test('--force overrides the dirty refusal', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{}')
        await writeFile(
            join(cwd, '.planning/luca-state.json'),
            '{"dirty":true}'
        )

        // With --force, the dirty changes get committed-or-stashed implicitly;
        // for our migration we expect it to proceed (the user owns the risk).
        await runMigration({ cwd, dryRun: false, force: true })

        expect(existsSync(join(cwd, '.luca/state.json'))).toBe(true)
    })

    test('dirty check does NOT apply when dryRun is true', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{}')
        await writeFile(
            join(cwd, '.planning/luca-state.json'),
            '{"dirty":true}'
        )

        // Dry-run is read-only; safe even when .planning/ is dirty.
        await expect(runMigration({ cwd, dryRun: true })).resolves.toBeDefined()
    })

    test.each(['.context-metrics.json', 'harness-result.json'])(
        'plans deletion of ephemeral file .planning/%s',
        async (filename) => {
            await mkdir(join(cwd, '.planning'), { recursive: true })
            await writeFile(join(cwd, '.planning', filename), '{}')

            const result = await runMigration({ cwd, dryRun: true })

            expect(result.plan.deletes).toContain(`.planning/${filename}`)
        }
    )

    test('removes ephemeral files when dryRun is false', async () => {
        await commitFile(cwd, '.planning/.context-metrics.json', '{}')
        await commitFile(cwd, '.planning/harness-result.json', '{}')

        await runMigration({ cwd, dryRun: false })

        expect(existsSync(join(cwd, '.planning/.context-metrics.json'))).toBe(
            false
        )
        expect(existsSync(join(cwd, '.planning/harness-result.json'))).toBe(
            false
        )
    })

    test('does NOT delete unmapped files', async () => {
        await commitFile(cwd, '.planning/PROJECT.md', '# project')

        await runMigration({ cwd, dryRun: false })

        expect(existsSync(join(cwd, '.planning/PROJECT.md'))).toBe(true)
    })

    test('skips already-migrated files (idempotent)', async () => {
        await commitFile(cwd, '.planning/luca-state.json', '{"original":true}')
        // First run does the move.
        await runMigration({ cwd, dryRun: false })

        // Simulate someone re-running after migration: create new file in .planning/
        // that has the same name. Idempotent runs should NOT overwrite the
        // already-migrated .luca/state.json.
        await commitFile(
            cwd,
            '.planning/luca-state.json',
            '{"would_overwrite":true}'
        )

        const second = await runMigration({ cwd, dryRun: false })

        // The plan should NOT include the move on the second run.
        expect(second.plan.moves).not.toContainEqual({
            from: '.planning/luca-state.json',
            to: '.luca/state.json',
        })
        // And the .luca/state.json content should remain the original.
        const content = await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        expect(JSON.parse(content)).toEqual({ original: true })
    })
})
