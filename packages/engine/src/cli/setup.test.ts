import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { loadEngineConfig, testCommands } from '../config/engine-config'
import { createFakeMuninn } from '../testing/fake-muninn'
import { git } from '../testing/practice-repo'
import {
    checkNamed,
    commitCount,
    CONFIG_PATH,
    fakeGitHub,
    logs,
    makeRepo,
    NEW_CONFIG_KEYS,
    OLD_LUCA_CONFIG,
    origin,
    printed,
    readConfigText,
    repo,
    setup,
    TMNB_PACKAGE,
    useSetupRepo,
} from '../testing/setup-repo'

/**
 * `luca setup` end to end (seam 4), through `testing/setup-repo.ts`. Its
 * checks and the vault are in `setup-checks.test.ts`.
 */

useSetupRepo()

describe('luca-setup creates the labels a run needs', () => {
    test('missing labels are created and existing ones are left as they are', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const refactor = {
            name: 'refactor',
            color: 'abcdef',
            description: 'Shape, not behavior',
        }
        const bug = { name: 'bug', color: 'ff0000', description: 'Broken' }
        const github = fakeGitHub({ labels: [refactor, bug] })

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(github.created().toSorted()).toEqual([
            'needs-info',
            'ready-for-agent',
            'ready-for-human',
        ])
        const labels = github.labels()
        expect(labels.find(({ name }) => name === 'refactor')).toEqual(refactor)
        expect(labels.find(({ name }) => name === 'bug')).toEqual(bug)
        expect(labels.map(({ name }) => name).toSorted()).toEqual([
            'bug',
            'needs-info',
            'ready-for-agent',
            'ready-for-human',
            'refactor',
        ])
    }, 60_000)

    test('a repo with no labels gets all four', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub()

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(github.created().toSorted()).toEqual([
            'needs-info',
            'ready-for-agent',
            'ready-for-human',
            'refactor',
        ])
        // A spec's tickets for a person are left out of a run (#499).
        expect(
            github.labels().find(({ name }) => name === 'ready-for-human')
                ?.description
        ).toBe('Needs a person, not an agent')
    }, 60_000)

    test('a repo that has every label gets none created', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub({
            labels: [
                'ready-for-agent',
                'ready-for-human',
                'refactor',
                'needs-info',
            ].map((name) => ({ name, color: '123456', description: 'Mine' })),
        })

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(github.created()).toEqual([])
    }, 60_000)
})

describe('luca setup creates the release labels in a repo with changesets', () => {
    const CHANGESET_CONFIG = join('.changeset', 'config.json')
    const RELEASE_LABELS = [
        'release:major',
        'release:minor',
        'release:none',
        'release:patch',
    ]
    const releaseLabels = (names: string[]): string[] =>
        names.filter((name) => name.startsWith('release:')).toSorted()

    test('a repo with .changeset/config.json gets the four release labels and the run labels', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CHANGESET_CONFIG]: JSON.stringify(
                    { baseBranch: 'main', ignore: [] },
                    null,
                    4
                ),
            },
        })
        const github = fakeGitHub()

        const end = await setup({
            github: github.github,
            memory: createFakeMuninn(),
        })

        expect(github.created().toSorted()).toEqual(
            [
                'needs-info',
                'ready-for-agent',
                'ready-for-human',
                'refactor',
                ...RELEASE_LABELS,
            ].toSorted()
        )
        for (const label of RELEASE_LABELS) {
            expect(printed(end)).toContain(label)
        }
    }, 60_000)

    test('release labels a changesets repo already has are left as they are', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CHANGESET_CONFIG]: '{}\n',
            },
        })
        const mine = {
            name: 'release:minor',
            color: 'abcdef',
            description: 'Mine',
        }
        const github = fakeGitHub({ labels: [mine] })

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(releaseLabels(github.created())).toEqual([
            'release:major',
            'release:none',
            'release:patch',
        ])
        expect(
            github.labels().find(({ name }) => name === 'release:minor')
        ).toEqual(mine)
    }, 60_000)

    test('a repo without .changeset/config.json gets no release labels until it has one', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub()

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(releaseLabels(github.labels().map(({ name }) => name))).toEqual(
            []
        )
        expect(github.created().toSorted()).toEqual([
            'needs-info',
            'ready-for-agent',
            'ready-for-human',
            'refactor',
        ])

        await Bun.write(join(repo, CHANGESET_CONFIG), '{}\n')
        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(releaseLabels(github.created())).toEqual(RELEASE_LABELS)
    }, 60_000)

    test('a second run in a changesets repo creates nothing more', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CHANGESET_CONFIG]: '{}\n',
            },
        })
        const github = fakeGitHub()
        const memory = createFakeMuninn()

        await setup({ github: github.github, memory })
        const created_after_first = github.created()
        await setup({ github: github.github, memory })

        expect(releaseLabels(created_after_first)).toEqual(RELEASE_LABELS)
        expect(github.created()).toEqual(created_after_first)
    }, 60_000)
})

describe('luca-setup writes a starting config when there is none', () => {
    test('a repo shaped like tmnb gets its test, type, and lint checks from package.json', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })

        await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn(),
        })

        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        expect(testCommands({ config: loaded.config })).toEqual([
            { run: 'bun test', results: 'bun' },
            { run: 'bun run test:workers', results: 'pass_fail' },
        ])
        expect(loaded.config.checks.types).toBe('bun run type-check')
        expect(loaded.config.checks.lint).toBe('bun run lint')
    }, 60_000)

    test('a typecheck script becomes types, and a repo with no lint script gets no lint check', async () => {
        await makeRepo({
            files: {
                'package.json': JSON.stringify(
                    {
                        name: 'small',
                        private: true,
                        scripts: {
                            test: 'bun test',
                            typecheck: 'tsc --noEmit',
                        },
                    },
                    null,
                    4
                ),
            },
        })

        await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn(),
        })

        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        expect(testCommands({ config: loaded.config })).toEqual([
            { run: 'bun test', results: 'bun' },
        ])
        expect(loaded.config.checks.types).toBe('bun run typecheck')
        expect(loaded.config.checks.lint).toBeUndefined()
    }, 60_000)

    test('the report reminds that tickets needing tests the red check cannot read are ready-for-human', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })

        const end = await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn(),
        })

        expect(printed(end)).toContain('ready-for-human')
    }, 60_000)
})

describe('luca-setup converts an old-Luca config', () => {
    test('old keys are dropped, the rest is in the new shape, and muninn.vault is kept', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CONFIG_PATH]: OLD_LUCA_CONFIG,
            },
        })

        await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        const written = z
            .record(z.string(), z.unknown())
            .parse(JSON.parse(await readConfigText()))
        for (const key of Object.keys(written)) {
            expect(NEW_CONFIG_KEYS).toContain(key)
        }
        expect(written.muninn).toEqual({ vault: 'tmnb' })
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        expect(loaded.config.muninn).toEqual({ vault: 'tmnb' })
        expect(testCommands({ config: loaded.config })).toEqual([
            { run: 'bun test', results: 'bun' },
            { run: 'bun run test:workers', results: 'pass_fail' },
        ])
    }, 60_000)
})

describe('luca setup converts an old-Luca config with a top-level vault', () => {
    test('an old config with a top-level vault keeps that vault as muninn.vault', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CONFIG_PATH]: JSON.stringify(
                    {
                        lucaVersion: '12.4.0',
                        oversight: 'full-auto',
                        vault: 'movie-rankings',
                    },
                    null,
                    2
                ),
            },
        })
        const memory = createFakeMuninn({ vaults: { 'movie-rankings': [] } })

        const end = await setup({ github: fakeGitHub().github, memory })

        const written = z
            .record(z.string(), z.unknown())
            .parse(JSON.parse(await readConfigText()))
        for (const key of Object.keys(written)) {
            expect(NEW_CONFIG_KEYS).toContain(key)
        }
        expect(written.muninn).toEqual({ vault: 'movie-rankings' })
        const loaded = await loadEngineConfig({ repo_root: repo })
        if (!loaded.ok) throw new Error(loaded.error)
        expect(loaded.config.muninn).toEqual({ vault: 'movie-rankings' })
        expect(checkNamed(end, 'vault').status).toBe('done')
        expect(
            memory.calls().some(({ vault }) => vault === 'movie-rankings')
        ).toBe(true)
        expect(printed(end)).toContain('movie-rankings')
    }, 60_000)
})

describe('luca-setup leaves a new-style config alone', () => {
    test('a new-style config is not changed, even where package.json would guess otherwise', async () => {
        const mine = `{
  "checks": {
    "test": ["bun test packages", { "run": "bun run test:workers", "results": "pass_fail" }],
    "types": "bun run type-check",
    "lint": "bun run lint && bun run syncpack:check"
  },
  "rule_files": ["AGENTS.md"],
  "muninn": { "vault": "tmnb" }
}
`
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE, [CONFIG_PATH]: mine },
        })

        await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expect(await readConfigText()).toBe(mine)
        expect((await git(repo, 'status', '--porcelain')).trim()).toBe('')
    }, 60_000)
})

describe('luca-setup never commits and is safe to run again', () => {
    test('it leaves the commits, locally and on origin, as they were', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CONFIG_PATH]: OLD_LUCA_CONFIG,
            },
        })
        const head = (await git(repo, 'rev-parse', 'HEAD')).trim()
        const origin_head = (await git(origin, 'rev-parse', 'main')).trim()

        await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
        expect(await commitCount(repo)).toBe('1')
        expect((await git(origin, 'rev-parse', 'main')).trim()).toBe(
            origin_head
        )
        // The rewritten config waits in the working tree for a PR.
        expect(await git(repo, 'status', '--porcelain')).toContain(
            '.luca/config.json'
        )
    }, 60_000)

    test('a second run in a row gives the same result', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub({
            labels: [{ name: 'refactor', color: 'abcdef', description: '' }],
        })
        const memory = createFakeMuninn()
        const head = (await git(repo, 'rev-parse', 'HEAD')).trim()

        const first = await setup({ github: github.github, memory })
        const config_after_first = await readConfigText()
        const labels_after_first = github.labels()
        const created_after_first = github.created()
        logs.length = 0
        const second = await setup({ github: github.github, memory })

        expect(await readConfigText()).toBe(config_after_first)
        expect(github.labels()).toEqual(labels_after_first)
        expect(github.created()).toEqual(created_after_first)
        expect(second.checks).toEqual(first.checks)
        expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
    }, 60_000)
})

/** The last line the command printed that isn't blank. */
const lastLine = (): string =>
    logs
        .join('\n')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .at(-1) ?? ''

describe('luca setup speaks as luca setup', () => {
    test('its output and fixes name `luca setup`, never the old luca-setup', async () => {
        await makeRepo({
            files: { 'package.json': TMNB_PACKAGE },
            push: false,
        })

        const end = await setup({
            github: fakeGitHub({ login: null, sub_issues: false }).github,
            memory: createFakeMuninn({ fail: [{ vault: 'tmnb' }] }),
        })

        expect(printed(end)).toContain('luca setup')
        expect(printed(end)).not.toContain('luca-setup')
        for (const { detail } of end.checks) {
            expect(detail).not.toContain('luca-setup')
        }
    }, 60_000)
})

describe('luca setup ends with the planning-skills pointer', () => {
    test('with things left to do, the last line points to /setup-matt-pocock-skills', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })

        const end = await setup({
            github: fakeGitHub({ login: null }).github,
            memory: createFakeMuninn(),
        })

        expect(end.ok).toBe(false)
        expect(lastLine()).toContain('/setup-matt-pocock-skills')
        expect(
            end.message
                .split('\n')
                .filter((line) => line.trim() !== '')
                .at(-1)
        ).toContain('/setup-matt-pocock-skills')
    }, 60_000)

    test('in a ready repo, the last line still points to /setup-matt-pocock-skills', async () => {
        await makeRepo({
            files: {
                'package.json': TMNB_PACKAGE,
                [CONFIG_PATH]: JSON.stringify(
                    {
                        checks: {
                            test: 'bun test',
                            types: 'bun run type-check',
                            lint: 'bun run lint',
                        },
                        muninn: { vault: 'tmnb' },
                    },
                    null,
                    4
                ),
            },
        })

        await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expect(lastLine()).toContain('/setup-matt-pocock-skills')
    }, 60_000)
})

/** The engine's README and every page of its docs, as one text. */
const engineDocs = async (): Promise<string> => {
    const engine = join(import.meta.dir, '..', '..')
    const pages = [
        'README.md',
        ...new Bun.Glob('docs/*.md').scanSync({ cwd: engine }),
    ]
    const texts = await Promise.all(
        pages.map((page) => Bun.file(join(engine, page)).text())
    )
    return texts.join('\n')
}

describe('the engine README', () => {
    test('has a "Setting up a repo" section about luca-setup', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'docs', 'setup.md')
        ).text()
        const start = readme.indexOf('\n## Setting up a repo')
        expect(start).toBeGreaterThan(-1)
        const rest = readme.slice(start + 1)
        const next = rest.indexOf('\n## ')
        const section = next === -1 ? rest : rest.slice(0, next)
        // The command is `luca setup` now; this section still covers it.
        expect(section).toMatch(/luca[ -]setup/)
        expect(section).toContain('.luca/config.json')
    })

    test('has a "Setting up a repo" section about luca setup', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'docs', 'setup.md')
        ).text()
        const start = readme.indexOf('\n## Setting up a repo')
        expect(start).toBeGreaterThan(-1)
        const rest = readme.slice(start + 1)
        const next = rest.indexOf('\n## ')
        const section = next === -1 ? rest : rest.slice(0, next)
        expect(section).toContain('luca setup')
        expect(section).toContain('.luca/config.json')
        expect(section).toContain('/setup-matt-pocock-skills')
    })

    test('no longer mentions the luca-setup command', async () => {
        const readme = await engineDocs()

        expect(readme).not.toContain('luca-setup')
    })
})
