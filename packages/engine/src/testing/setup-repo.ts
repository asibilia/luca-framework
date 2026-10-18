import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, beforeEach, expect } from 'bun:test'

import type { FakeMuninn } from './fake-muninn'
import { git } from './practice-repo'

import { runSetup } from '../cli/setup'

/**
 * `luca setup` end to end (seam 4): a throwaway repo with a local bare
 * `origin`, a fake GitHub (labels, the `gh` login, the repo, and its issue
 * links), and a fake MuninnDB. Shared by `cli/setup.test.ts` and
 * `cli/setup-checks.test.ts`: each calls `useSetupRepo()` once, and reads
 * `root`, `repo`, `origin`, and `logs` as they stand in the running test.
 */

export const CONFIG_PATH = join('.luca', 'config.json')

/** The keys a new-style engine config may have. */
export const NEW_CONFIG_KEYS = [
    'checks',
    'test_file_patterns',
    'test_setup_files',
    'rule_files',
    'muninn',
    'run_budget_tokens',
]

/** A `package.json` shaped like tmnb's: a bun test, a vitest file, and more. */
export const TMNB_PACKAGE = JSON.stringify(
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
export const OLD_LUCA_CONFIG = JSON.stringify(
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
export const fakeGitHub = ({
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
            createLabel: async ({ name, color, description }: FakeLabel) => {
                if (store.some((label) => label.name === name)) {
                    throw new Error(`label ${name} already exists`)
                }
                created.push(name)
                store.push({ name, color, description })
            },
        },
        /** Every label now, as stored. */
        labels: () => store.map((label) => ({ ...label })),
        /** The names of the labels setup created, oldest first. */
        created: () => [...created],
    }
}

export let root = ''
export let repo = ''
export let origin = ''
export const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

/** Makes fresh throwaway folders before each test, and removes them after. */
export const useSetupRepo = () => {
    beforeEach(async () => {
        root = realpathSync(await mkdtemp(join(tmpdir(), 'setup-repo-')))
        repo = join(root, 'repo')
        origin = join(root, 'origin.git')
        logs.length = 0
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
}

/**
 * A throwaway repo with these files in its first commit and a local bare
 * `origin`. `main` is pushed unless `push` is false.
 */
export const makeRepo = async ({
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

export const setup = async ({
    github,
    memory,
}: {
    github: ReturnType<typeof fakeGitHub>['github']
    memory: FakeMuninn
}) => runSetup({ repo, github, memory, log })

/** Everything the command printed, its end message included. */
export const printed = (end: { message: string }): string =>
    [...logs, end.message].join('\n')

export const readConfigText = (): Promise<string> =>
    Bun.file(join(repo, CONFIG_PATH)).text()

export const checkNamed = (
    end: Awaited<ReturnType<typeof setup>>,
    name: string
): { name: string; status: string; detail: string } => {
    const found = end.checks.find((check) => check.name === name)
    if (found === undefined) throw new Error(`No check named ${name}`)
    return found
}

/** Checks that a check is a to-do whose fix is printed. */
export const expectToDo = (
    end: Awaited<ReturnType<typeof setup>>,
    name: string
) => {
    const check = checkNamed(end, name)
    expect(check.status).toBe('todo')
    expect(check.detail.trim()).not.toBe('')
    expect(printed(end)).toContain(check.detail)
}

export const commitCount = async (cwd: string): Promise<string> =>
    (await git(cwd, 'rev-list', '--count', 'main')).trim()
