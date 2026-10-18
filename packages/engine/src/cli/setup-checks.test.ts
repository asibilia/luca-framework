import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { loadEngineConfig } from '../config/engine-config'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    checkNamed,
    CONFIG_PATH,
    expectToDo,
    fakeGitHub,
    makeRepo,
    printed,
    readConfigText,
    repo,
    setup,
    TMNB_PACKAGE,
    useSetupRepo,
} from '../testing/setup-repo'

/**
 * `luca setup` end to end (seam 4), through `testing/setup-repo.ts`: what a
 * run needs, checked, and the vault it gives a repo or keeps.
 */

useSetupRepo()

describe('luca-setup checks what a run needs', () => {
    const NEW_STYLE = JSON.stringify(
        {
            checks: { test: 'bun test' },
            muninn: { vault: 'tmnb' },
        },
        null,
        4
    )

    test('in a ready repo every check is done', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
        })
        const memory = createFakeMuninn({ vaults: { tmnb: [] } })

        const end = await setup({ github: fakeGitHub().github, memory })

        for (const name of [
            'gh_login',
            'github_remote',
            'issue_links',
            'base_branch',
            'vault',
        ]) {
            expect(checkNamed(end, name).status).toBe('done')
        }
        // The vault was checked through the MuninnDB client.
        expect(memory.calls().some(({ vault }) => vault === 'tmnb')).toBe(true)
    }, 60_000)

    test('gh not logged in is a to-do with a fix', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
        })

        const end = await setup({
            github: fakeGitHub({ login: null }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expectToDo(end, 'gh_login')
    }, 60_000)

    test('a repo with no GitHub remote is a to-do with a fix', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
        })

        const end = await setup({
            github: fakeGitHub({ repo_name: null }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expectToDo(end, 'github_remote')
    }, 60_000)

    test('missing sub-issues is a to-do with a fix', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
        })

        const end = await setup({
            github: fakeGitHub({ sub_issues: false }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expectToDo(end, 'issue_links')
    }, 60_000)

    test('missing issue dependencies is a to-do with a fix', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
        })

        const end = await setup({
            github: fakeGitHub({ dependencies: false }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expectToDo(end, 'issue_links')
    }, 60_000)

    test('a base branch missing on origin is a to-do with a fix', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
            push: false,
        })

        const end = await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expectToDo(end, 'base_branch')
    }, 60_000)

    test('a vault MuninnDB cannot reach is a to-do with a fix', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: NEW_STYLE },
        })

        const end = await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ fail: [{ vault: 'tmnb' }] }),
        })

        expectToDo(end, 'vault')
    }, 60_000)
})

/** The lines of the "Done:" list in setup's end message. */
const doneLines = (end: { message: string }): string[] => {
    const start = end.message.indexOf('Done:\n')
    const stop = end.message.indexOf('To do:', start)
    if (start === -1 || stop === -1) throw new Error('No Done list')
    return end.message
        .slice(start, stop)
        .split('\n')
        .filter((line) => line.startsWith('- '))
}

const readConfigJson = async (): Promise<Record<string, unknown>> =>
    z.record(z.string(), z.unknown()).parse(JSON.parse(await readConfigText()))

describe('luca setup gives a new repo a vault', () => {
    test('a repo with no config gets muninn.vault set to its GitHub repo name', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })

        await setup({
            github: fakeGitHub({ repo_name: 'asibilia/movie-night' }).github,
            memory: createFakeMuninn(),
        })

        const written = await readConfigJson()
        expect(written.muninn).toEqual({ vault: 'movie-night' })
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        expect(loaded.config.muninn).toEqual({ vault: 'movie-night' })
    }, 60_000)

    test('the done list names the vault it wrote and says it can be changed', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })

        const end = await setup({
            github: fakeGitHub({ repo_name: 'asibilia/movie-night' }).github,
            memory: createFakeMuninn(),
        })

        const named = doneLines(end).filter((line) =>
            line.includes('movie-night')
        )
        expect(named.some((line) => /change/i.test(line))).toBe(true)
        expect(printed(end)).toContain('movie-night')
    }, 60_000)

    test('the new vault, with no memories yet, passes the vault check', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const memory = createFakeMuninn()

        const end = await setup({
            github: fakeGitHub({ repo_name: 'asibilia/movie-night' }).github,
            memory,
        })

        expect(checkNamed(end, 'vault').status).toBe('done')
        expect(
            memory.calls().some(({ vault }) => vault === 'movie-night')
        ).toBe(true)
    }, 60_000)

    test('a second run keeps the vault the first run wrote', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub({ repo_name: 'asibilia/movie-night' })
        const memory = createFakeMuninn()

        await setup({ github: github.github, memory })
        const config_after_first = await readConfigText()
        await setup({ github: github.github, memory })

        expect(await readConfigText()).toBe(config_after_first)
        expect((await readConfigJson()).muninn).toEqual({
            vault: 'movie-night',
        })
    }, 60_000)
})

/**
 * The other side of keeping a vault: in the same repo, with its config
 * removed, setup gives it the GitHub repo name (`tmnb`) as its vault.
 */
const expectNoConfigGetsGitHubName = async () => {
    await rm(join(repo, CONFIG_PATH))

    await setup({
        github: fakeGitHub({ repo_name: 'asibilia/tmnb' }).github,
        memory: createFakeMuninn(),
    })

    expect((await readConfigJson()).muninn).toEqual({ vault: 'tmnb' })
}

describe('luca setup keeps an existing vault', () => {
    test('a new-style config keeps its own vault, while a repo with no config gets the GitHub repo name', async () => {
        const mine = `${JSON.stringify(
            { checks: { test: 'bun test' }, muninn: { vault: 'my-notes' } },
            null,
            2
        )}\n`
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: mine },
        })
        const memory = createFakeMuninn({ vaults: { 'my-notes': [] } })

        const end = await setup({
            github: fakeGitHub({ repo_name: 'asibilia/tmnb' }).github,
            memory,
        })

        expect(await readConfigText()).toBe(mine)
        expect(checkNamed(end, 'vault').status).toBe('done')
        expect(memory.calls().some(({ vault }) => vault === 'my-notes')).toBe(
            true
        )
        expect(memory.calls().some(({ vault }) => vault === 'tmnb')).toBe(false)
        await expectNoConfigGetsGitHubName()
    }, 60_000)

    test('a v13 config keeps its muninn.vault, while a repo with no config gets the GitHub repo name', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CONFIG_PATH]: JSON.stringify(
                    {
                        lucaVersion: '13.1.0-alpha.0',
                        oversight: 'full-auto',
                        muninn: { vault: 'old-notes' },
                    },
                    null,
                    2
                ),
            },
        })

        const end = await setup({
            github: fakeGitHub({ repo_name: 'asibilia/tmnb' }).github,
            memory: createFakeMuninn({ vaults: { 'old-notes': [] } }),
        })

        expect((await readConfigJson()).muninn).toEqual({ vault: 'old-notes' })
        expect(checkNamed(end, 'vault').status).toBe('done')
        await expectNoConfigGetsGitHubName()
    }, 60_000)

    test('a v13 config keeps its top-level vault, while a repo with no config gets the GitHub repo name', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CONFIG_PATH]: JSON.stringify(
                    {
                        lucaVersion: '12.4.0',
                        oversight: 'full-auto',
                        vault: 'older-notes',
                    },
                    null,
                    2
                ),
            },
        })

        const end = await setup({
            github: fakeGitHub({ repo_name: 'asibilia/tmnb' }).github,
            memory: createFakeMuninn({ vaults: { 'older-notes': [] } }),
        })

        expect((await readConfigJson()).muninn).toEqual({
            vault: 'older-notes',
        })
        expect(checkNamed(end, 'vault').status).toBe('done')
        await expectNoConfigGetsGitHubName()
    }, 60_000)

    test('a new-style config with no vault is left as it is and the vault is a to-do, while a repo with no config gets the GitHub repo name', async () => {
        const mine = `${JSON.stringify({ checks: { test: 'bun test' } }, null, 2)}\n`
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: mine },
        })

        const end = await setup({
            github: fakeGitHub({ repo_name: 'asibilia/tmnb' }).github,
            memory: createFakeMuninn(),
        })

        expect(await readConfigText()).toBe(mine)
        expectToDo(end, 'vault')
        await expectNoConfigGetsGitHubName()
    }, 60_000)
})
