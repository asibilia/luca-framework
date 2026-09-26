import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { runSetup } from './setup'

import { loadEngineConfig, testCommands } from '../config/engine-config'
import { createFakeMuninn, type FakeMuninn } from '../testing/fake-muninn'
import { git } from '../testing/practice-repo'

/**
 * `luca-setup` end to end (seam 4): a throwaway repo with a local bare
 * `origin`, a fake GitHub (labels, the `gh` login, the repo, and its issue
 * links), and a fake MuninnDB.
 */

const CONFIG_PATH = join('.luca', 'config.json')

/** The keys a new-style engine config may have. */
const NEW_CONFIG_KEYS = [
    'checks',
    'test_file_patterns',
    'test_setup_files',
    'rule_files',
    'muninn',
    'run_budget_tokens',
]

/** A `package.json` shaped like tmnb's: a bun test, a vitest file, and more. */
const TMNB_PACKAGE = JSON.stringify(
    {
        name: 'tmnb',
        private: true,
        scripts: {
            dev: 'next dev',
            test: 'bun test',
            'test:workers': 'vitest run --config vitest.workers.config.ts',
            'type-check': 'tsc --noEmit',
            lint: 'eslint .',
            'syncpack:check': 'syncpack lint',
        },
    },
    null,
    4
)

/** An old-Luca config: its own keys, and the vault to keep. */
const OLD_LUCA_CONFIG = JSON.stringify(
    {
        lucaVersion: '13.1.0-alpha.0',
        oversight: 'full-auto',
        preferences: { schemaVersion: 1 },
        muninn: {
            vault: 'tmnb',
            todoBacklog: { vault: 'tmnb', rootId: 'x' },
        },
    },
    null,
    2
)

type FakeLabel = { name: string; color: string; description: string }

/** A fake GitHub side for the repo: labels, the login, and issue links. */
const fakeGitHub = ({
    labels = [],
    login = 'asibilia',
    repo_name = 'asibilia/tmnb',
    sub_issues = true,
    dependencies = true,
}: {
    labels?: FakeLabel[]
    login?: string | null
    repo_name?: string | null
    sub_issues?: boolean
    dependencies?: boolean
} = {}) => {
    const store = labels.map((label) => ({ ...label }))
    const created: string[] = []
    return {
        github: {
            login: async () => login,
            githubRepo: async () => repo_name,
            issueLinks: async () => ({ sub_issues, dependencies }),
            listLabels: async () => store.map(({ name }) => name),
            createLabel: async ({ name }: { name: string }) => {
                if (store.some((label) => label.name === name)) {
                    throw new Error(`label ${name} already exists`)
                }
                created.push(name)
                store.push({ name, color: 'ededed', description: '' })
            },
        },
        /** Every label now, as stored. */
        labels: () => store.map((label) => ({ ...label })),
        /** The names of the labels setup created, oldest first. */
        created: () => [...created],
    }
}

let root = ''
let repo = ''
let origin = ''
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'luca-setup-')))
    repo = join(root, 'repo')
    origin = join(root, 'origin.git')
    logs.length = 0
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/**
 * A throwaway repo with these files in its first commit and a local bare
 * `origin`. `main` is pushed unless `push` is false.
 */
const makeRepo = async ({
    files,
    push = true,
}: {
    files: Record<string, string>
    push?: boolean
}) => {
    await $`git init -q --bare -b main ${origin}`.quiet()
    await $`git init -q -b main ${repo}`.quiet()
    const hooks = join(root, 'no-hooks')
    await mkdir(hooks)
    await git(repo, 'config', 'user.name', 'Practice')
    await git(repo, 'config', 'user.email', 'practice@example.com')
    await git(repo, 'config', 'commit.gpgsign', 'false')
    await git(repo, 'config', 'core.hooksPath', hooks)
    await Bun.write(join(repo, 'README.md'), '# Throwaway\n')
    for (const [path, content] of Object.entries(files)) {
        await Bun.write(join(repo, path), content)
    }
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'initial')
    await git(repo, 'remote', 'add', 'origin', origin)
    if (push) await git(repo, 'push', '-q', 'origin', 'main')
}

const setup = async ({
    github,
    memory,
}: {
    github: ReturnType<typeof fakeGitHub>['github']
    memory: FakeMuninn
}) => runSetup({ repo, github, memory, log })

/** Everything the command printed, its end message included. */
const printed = (end: { message: string }): string =>
    [...logs, end.message].join('\n')

const readConfigText = (): Promise<string> =>
    Bun.file(join(repo, CONFIG_PATH)).text()

const checkNamed = (
    end: Awaited<ReturnType<typeof setup>>,
    name: string
): { name: string; status: string; detail: string } => {
    const found = end.checks.find((check) => check.name === name)
    if (found === undefined) throw new Error(`No check named ${name}`)
    return found
}

/** Checks that a check is a to-do whose fix is printed. */
const expectToDo = (end: Awaited<ReturnType<typeof setup>>, name: string) => {
    const check = checkNamed(end, name)
    expect(check.status).toBe('todo')
    expect(check.detail.trim()).not.toBe('')
    expect(printed(end)).toContain(check.detail)
}

const commitCount = async (cwd: string): Promise<string> =>
    (await git(cwd, 'rev-list', '--count', 'main')).trim()

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
        ])
        const labels = github.labels()
        expect(labels.find(({ name }) => name === 'refactor')).toEqual(refactor)
        expect(labels.find(({ name }) => name === 'bug')).toEqual(bug)
        expect(labels.map(({ name }) => name).toSorted()).toEqual([
            'bug',
            'needs-info',
            'ready-for-agent',
            'refactor',
        ])
    }, 60_000)

    test('a repo with no labels gets all three', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub()

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(github.created().toSorted()).toEqual([
            'needs-info',
            'ready-for-agent',
            'refactor',
        ])
    }, 60_000)

    test('a repo that has every label gets none created', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })
        const github = fakeGitHub({
            labels: ['ready-for-agent', 'refactor', 'needs-info'].map(
                (name) => ({ name, color: '123456', description: 'Mine' })
            ),
        })

        await setup({ github: github.github, memory: createFakeMuninn() })

        expect(github.created()).toEqual([])
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

    test('a config with no vault is a to-do with a fix', async () => {
        await makeRepo({ files: { 'package.json': TMNB_PACKAGE } })

        const end = await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn(),
        })

        expectToDo(end, 'vault')
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

describe('the engine README', () => {
    test('has a "Setting up a repo" section about luca-setup', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()
        const start = readme.indexOf('\n## Setting up a repo')
        expect(start).toBeGreaterThan(-1)
        const rest = readme.slice(start + 1)
        const next = rest.indexOf('\n## ')
        const section = next === -1 ? rest : rest.slice(0, next)
        expect(section).toContain('luca-setup')
        expect(section).toContain('.luca/config.json')
    })
})
