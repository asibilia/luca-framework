import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { migratePlanningHandler } from './migrate-planning-handler.ts'

async function initGitRepo(dir: string): Promise<void> {
    await Bun.$`git init --quiet`.cwd(dir).quiet()
    await Bun.$`git config user.email test@example.com`.cwd(dir).quiet()
    await Bun.$`git config user.name test`.cwd(dir).quiet()
    await Bun.$`git commit --quiet --allow-empty -m init`.cwd(dir).quiet()
}

async function commitFile(
    dir: string,
    relPath: string,
    content: string,
): Promise<void> {
    const full = join(dir, relPath)
    const parent = full.slice(0, full.lastIndexOf('/'))
    await mkdir(parent, { recursive: true })
    await writeFile(full, content)
    await Bun.$`git add ${relPath}`.cwd(dir).quiet()
    await Bun.$`git commit --quiet -m "add ${relPath}"`.cwd(dir).quiet()
}

describe('migratePlanningHandler', () => {
    let cwd: string
    let logs: string[]

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-migrate-handler-'))
        await initGitRepo(cwd)
        logs = []
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    const log = (msg: string) => {
        logs.push(msg)
    }

    test('logs "Nothing to migrate" when .planning/ is absent', async () => {
        await migratePlanningHandler({ cwd, dryRun: true, log })
        expect(logs.join('\n')).toContain('Nothing to migrate')
    })

    test('logs each planned move under a dry-run header', async () => {
        await mkdir(join(cwd, '.planning'), { recursive: true })
        await writeFile(join(cwd, '.planning/luca-state.json'), '{}')

        await migratePlanningHandler({ cwd, dryRun: true, log })

        const all = logs.join('\n')
        expect(all).toContain('dry-run')
        expect(all).toContain('.planning/luca-state.json')
        expect(all).toContain('.luca/state.json')
    })

    test('logs each planned delete', async () => {
        await mkdir(join(cwd, '.planning'), { recursive: true })
        await writeFile(join(cwd, '.planning/harness-result.json'), '{}')

        await migratePlanningHandler({ cwd, dryRun: true, log })

        const all = logs.join('\n')
        expect(all).toContain('.planning/harness-result.json')
    })

    test('header reflects whether this is an execute run or dry-run', async () => {
        // Commit the file so execute-mode's dirty-check passes.
        await commitFile(cwd, '.planning/luca-state.json', '{}')

        await migratePlanningHandler({ cwd, dryRun: false, log })

        const all = logs.join('\n')
        expect(all).not.toContain('dry-run')
        expect(all).toContain('Migrating')
    })
})
