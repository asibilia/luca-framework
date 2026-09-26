import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import {
    ENGINE_CONFIG_FILE,
    EngineConfigSchema,
    isBunTestCommand,
    loadEngineConfig,
    MuninnConfigSchema,
    testCommands,
    type EngineConfig,
    type TestCommand,
} from '../config/engine-config'
import { safeMemory, type MemoryClient } from '../memory/memory-client'
import { runCommand } from '../shell/run-command'
import {
    NEEDS_INFO_LABEL,
    READY_LABEL,
    REFACTOR_LABEL,
    type Tracker,
} from '../tracker/tracker'

/**
 * `luca-setup`: gets a repo ready for Luca. It creates the labels a run
 * needs, writes a starting `.luca/config.json` (or converts old Luca's, or
 * leaves a new-style one alone), checks everything a run needs, and ends
 * with a plain list of what's done and what's left. It never commits, and
 * running it again gives the same result, so it doubles as a health check.
 */

/**
 * The GitHub side of setup: the tracker's labels and issue links, plus the
 * `gh` login and the repo's GitHub name, so tests can use a fake.
 */
export type SetupGitHub = Pick<
    Tracker,
    'listLabels' | 'createLabel' | 'issueLinks'
> & {
    /** The login `gh` is signed in as, or `null` when it isn't. */
    login: () => Promise<string | null>
    /** The repo's GitHub `owner/name`, or `null` when it has none. */
    githubRepo: () => Promise<string | null>
}

/** The checks setup runs, by name. */
export type SetupCheckName =
    | 'gh_login'
    | 'github_remote'
    | 'issue_links'
    | 'base_branch'
    | 'vault'

/** One check: done, or a to-do whose `detail` is the plain fix. */
export type SetupCheck = {
    name: SetupCheckName
    status: 'done' | 'todo'
    detail: string
}

/** How setup ended: `ok` when nothing is left to do. */
export type SetupEnd = { ok: boolean; message: string; checks: SetupCheck[] }

/** The labels a run needs, with what they're for. */
const LABELS = [
    {
        name: READY_LABEL,
        color: '0e8a16',
        description: 'Ready for a Luca run',
    },
    {
        name: REFACTOR_LABEL,
        color: '5319e7',
        description: 'Changes shape, not behavior: no new tests',
    },
    {
        name: NEEDS_INFO_LABEL,
        color: 'd93f0b',
        description: 'Luca needs more detail before it can build this',
    },
]

/**
 * The top-level and `muninn` keys of a new-style engine config, from its
 * schema. A config with any other key (such as old Luca's `lucaVersion`) is
 * an old-Luca config.
 */
const NEW_CONFIG_KEYS = new Set(Object.keys(EngineConfigSchema.shape))
const NEW_MUNINN_KEYS = new Set(Object.keys(MuninnConfigSchema.shape))

const PackageJsonSchema = z.looseObject({
    scripts: z.record(z.string(), z.string()).default({}),
})

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The checks guessed from `package.json` scripts: `test` and `test:*`
 * become test commands (a script that is a `bun test` command runs as
 * written and is bun-readable; the rest run with `bun run` and are
 * pass-or-fail), `type-check` or `typecheck` becomes types, and `lint`
 * becomes lint. Pure.
 *
 * @example
 * guessChecks({ scripts: { test: 'bun test', 'test:workers': 'vitest run', lint: 'eslint .' } })
 * // { test: [{ run: 'bun test', results: 'bun' }, { run: 'bun run test:workers', results: 'pass_fail' }], lint: 'bun run lint' }
 */
export const guessChecks = ({
    scripts,
}: {
    scripts: Record<string, string>
}): EngineConfig['checks'] => {
    const test: TestCommand[] = Object.entries(scripts)
        .filter(([name]) => name === 'test' || name.startsWith('test:'))
        .toSorted(([a], [b]) => Number(b === 'test') - Number(a === 'test'))
        .map(([name, script]) =>
            isBunTestCommand(script)
                ? { run: script.trim(), results: 'bun' }
                : { run: `bun run ${name}`, results: 'pass_fail' }
        )
    const types = ['type-check', 'typecheck'].find(
        (name) => scripts[name] !== undefined
    )
    return {
        ...(test.length === 0 ? {} : { test }),
        ...(types === undefined ? {} : { types: `bun run ${types}` }),
        ...(scripts.lint === undefined ? {} : { lint: 'bun run lint' }),
    }
}

/** The repo's `package.json` scripts; none when it has no readable one. */
const readScripts = async ({
    repo,
}: {
    repo: string
}): Promise<Record<string, string>> => {
    const file = Bun.file(join(repo, 'package.json'))
    if (!(await file.exists())) return {}
    try {
        const parsed = PackageJsonSchema.safeParse(
            JSON.parse(await file.text())
        )
        return parsed.success ? parsed.data.scripts : {}
    } catch {
        return {}
    }
}

/** What is at `.luca/config.json` before setup touches it. */
type FoundConfig =
    | { kind: 'missing' }
    | { kind: 'broken'; error: string }
    | { kind: 'old'; raw: Record<string, unknown> }
    | { kind: 'new' }

const findConfig = async ({ repo }: { repo: string }): Promise<FoundConfig> => {
    const file = Bun.file(join(repo, ENGINE_CONFIG_FILE))
    if (!(await file.exists())) return { kind: 'missing' }
    let raw: unknown
    try {
        raw = JSON.parse(await file.text())
    } catch (error) {
        return { kind: 'broken', error: `it isn't JSON: ${errorText(error)}` }
    }
    if (!isRecord(raw)) {
        return { kind: 'broken', error: "it isn't a JSON object" }
    }
    const muninn = raw.muninn
    const old =
        Object.keys(raw).some((key) => !NEW_CONFIG_KEYS.has(key)) ||
        (isRecord(muninn) &&
            Object.keys(muninn).some((key) => !NEW_MUNINN_KEYS.has(key)))
    return old ? { kind: 'old', raw } : { kind: 'new' }
}

/** A starting config: the guessed checks, and the vault if there is one. */
const startingConfig = ({
    scripts,
    vault,
}: {
    scripts: Record<string, string>
    vault: string | null
}): Record<string, unknown> => ({
    checks: guessChecks({ scripts }),
    ...(vault === null ? {} : { muninn: { vault } }),
})

/** The vault an old-Luca config names in `muninn.vault`, if any. */
const oldVault = ({ raw }: { raw: Record<string, unknown> }): string | null => {
    const vault = isRecord(raw.muninn) ? raw.muninn.vault : undefined
    return typeof vault === 'string' && vault.trim() !== '' ? vault : null
}

const writeConfig = async ({
    repo,
    config,
}: {
    repo: string
    config: Record<string, unknown>
}) => {
    const path = join(repo, ENGINE_CONFIG_FILE)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, `${JSON.stringify(config, null, 4)}\n`)
}

const describeTest = ({ run, results }: TestCommand): string =>
    `\`${run}\` (${results === 'bun' ? 'bun-readable' : 'pass or fail'})`

/** The done and to-do lines for a config that loads. */
const reportConfig = ({
    config,
}: {
    config: EngineConfig
}): { done: string[]; todo: string[] } => {
    const tests = testCommands({ config })
    const done: string[] = []
    const todo: string[] = []
    if (tests.length === 0) {
        todo.push(
            `Add a test command to \`checks.test\` in ${ENGINE_CONFIG_FILE}. Intake refuses a run without one.`
        )
    } else {
        done.push(`Test commands: ${tests.map(describeTest).join(', ')}`)
        if (!tests.some(({ results }) => results === 'bun')) {
            todo.push(
                `No test command is bun-readable, so only refactor tickets can run. Add a \`bun test\` command to \`checks.test\` in ${ENGINE_CONFIG_FILE}.`
            )
        }
    }
    for (const kind of ['types', 'lint'] as const) {
        const command = config.checks[kind]
        if (command === undefined) {
            todo.push(
                `No ${kind} check. Add \`checks.${kind}\` to ${ENGINE_CONFIG_FILE} if the repo has one.`
            )
        } else {
            done.push(`The ${kind} check: \`${command}\``)
        }
    }
    return { done, todo }
}

/** Creates the labels the repo is missing; leaves the others as they are. */
const ensureLabels = async ({
    github,
}: {
    github: SetupGitHub
}): Promise<{ done: string[]; todo: string[] }> => {
    let have: Set<string>
    try {
        have = new Set(await github.listLabels())
    } catch (error) {
        return {
            done: [],
            todo: [
                `Couldn't list the repo's labels (${errorText(error)}). Fix gh and the GitHub remote, then run luca-setup again.`,
            ],
        }
    }
    const done: string[] = []
    const todo: string[] = []
    for (const label of LABELS) {
        if (have.has(label.name)) {
            done.push(`The \`${label.name}\` label is there`)
            continue
        }
        try {
            await github.createLabel(label)
            done.push(`Created the \`${label.name}\` label`)
        } catch (error) {
            todo.push(
                `Couldn't create the \`${label.name}\` label (${errorText(error)}). Create it with \`gh label create ${label.name}\`.`
            )
        }
    }
    return { done, todo }
}

/** Runs one check; a throw becomes a to-do with its error. */
const check = async ({
    name,
    run,
}: {
    name: SetupCheckName
    run: () => Promise<Omit<SetupCheck, 'name'>>
}): Promise<SetupCheck> => {
    try {
        return { name, ...(await run()) }
    } catch (error) {
        return {
            name,
            status: 'todo',
            detail: `The ${name} check failed: ${errorText(error)}. Fix it, then run luca-setup again.`,
        }
    }
}

const done = (detail: string) => ({ status: 'done' as const, detail })
const todo = (detail: string) => ({ status: 'todo' as const, detail })

const checkIssueLinks = async ({
    github,
    github_repo,
}: {
    github: SetupGitHub
    github_repo: string | null
}) => {
    if (github_repo === null) {
        return todo(
            "Sub-issues and issue dependencies can't be checked without a GitHub remote. Add one, then run luca-setup again."
        )
    }
    const { sub_issues, dependencies } = await github.issueLinks()
    const missing = [
        ...(sub_issues ? [] : ['sub-issues']),
        ...(dependencies ? [] : ['issue dependencies']),
    ]
    if (missing.length === 0) {
        return done(`${github_repo} has sub-issues and issue dependencies`)
    }
    return todo(
        `${github_repo} has no ${missing.join(' or ')}. Luca reads a spec's tickets and blockers from them: turn them on for the repo's issues, then run luca-setup again.`
    )
}

const checkBaseBranch = async ({
    repo,
    base_branch,
}: {
    repo: string
    base_branch: string
}) => {
    const listed = await runCommand({
        cmd: ['git', 'ls-remote', '--heads', 'origin', base_branch],
        cwd: repo,
    })
    if (listed.exit_code !== 0) {
        return todo(
            `Couldn't reach origin (${listed.stderr.trim()}). Add an \`origin\` remote on GitHub and push \`${base_branch}\` to it.`
        )
    }
    if (listed.stdout.trim() === '') {
        return todo(
            `origin has no \`${base_branch}\` branch. Push it: \`git push -u origin ${base_branch}\`.`
        )
    }
    return done(`origin has \`${base_branch}\``)
}

const checkVault = async ({
    memory,
    vault,
}: {
    memory: MemoryClient
    vault: string | null
}) => {
    if (vault === null) {
        return todo(
            `No memory vault. Set \`muninn.vault\` in ${ENGINE_CONFIG_FILE} to the project's MuninnDB vault (such as the repo's name).`
        )
    }
    const found = await safeMemory({ deps: { client: memory } }).recall({
        vault,
        query: 'luca-setup',
        limit: 1,
        threshold: 0,
    })
    if (!found.ok) {
        return todo(
            `MuninnDB couldn't search the \`${vault}\` vault (${found.error}). Start MuninnDB, or set LUCA_MUNINN_URL and LUCA_MUNINN_TOKEN, then run luca-setup again.`
        )
    }
    return done(`MuninnDB has the \`${vault}\` vault`)
}

const list = (lines: string[]): string =>
    lines.length === 0
        ? '- nothing'
        : lines.map((line) => `- ${line}`).join('\n')

/**
 * Gets `repo` ready for Luca. It creates the missing `ready-for-agent`,
 * `refactor`, and `needs-info` labels; writes a starting
 * `.luca/config.json` from `package.json` when there is none (see
 * `guessChecks`), rewrites an old-Luca config into the new shape keeping
 * its `muninn.vault`, and leaves a new-style config alone; then checks the
 * `gh` login, the GitHub remote, sub-issues and issue dependencies,
 * `base_branch` (default `main`) on `origin`, and the vault through
 * `memory`. It never commits and never throws: it ends with the done and
 * to-do list, logged and returned.
 *
 * @example
 * const end = await runSetup({ repo: process.cwd(), github, memory, log: console.log })
 * if (!end.ok) console.log(end.checks.filter(({ status }) => status === 'todo'))
 */
export const runSetup = async ({
    repo,
    github,
    memory,
    base_branch = 'main',
    log,
}: {
    repo: string
    github: SetupGitHub
    memory: MemoryClient
    base_branch?: string
    log: (line: string) => void
}): Promise<SetupEnd> => {
    const done_lines: string[] = []
    const todo_lines: string[] = []

    const login = await check({
        name: 'gh_login',
        run: async () => {
            const user = await github.login()
            return user === null
                ? todo('gh is not logged in. Run `gh auth login`.')
                : done(`gh is logged in as ${user}`)
        },
    })
    const github_repo = await github.githubRepo().catch(() => null)
    const remote: SetupCheck = {
        name: 'github_remote',
        ...(github_repo === null
            ? todo(
                  'The repo has no GitHub remote. Create one with `gh repo create --source . --push`, or add it with `git remote add origin <url>`.'
              )
            : done(`The repo is ${github_repo} on GitHub`)),
    }

    if (login.status === 'done' && remote.status === 'done') {
        const labels = await ensureLabels({ github })
        done_lines.push(...labels.done)
        todo_lines.push(...labels.todo)
    } else {
        todo_lines.push(
            'The labels were not checked. Fix the gh login and the GitHub remote, then run luca-setup again.'
        )
    }

    const found = await findConfig({ repo })
    if (found.kind === 'missing' || found.kind === 'old') {
        const vault = found.kind === 'old' ? oldVault({ raw: found.raw }) : null
        await writeConfig({
            repo,
            config: startingConfig({
                scripts: await readScripts({ repo }),
                vault,
            }),
        })
        done_lines.push(
            found.kind === 'missing'
                ? `Wrote ${ENGINE_CONFIG_FILE} from package.json's scripts. Check it, then merge it to main through a PR.`
                : `Rewrote old Luca's ${ENGINE_CONFIG_FILE} into the new shape${vault === null ? '' : `, keeping the \`${vault}\` vault`}. Check it, then merge it to main through a PR.`
        )
    } else if (found.kind === 'new') {
        done_lines.push(
            `${ENGINE_CONFIG_FILE} is new-style, so it was left as it is`
        )
    }
    const loaded =
        found.kind === 'broken'
            ? {
                  ok: false as const,
                  error: `${ENGINE_CONFIG_FILE}: ${found.error}`,
              }
            : await loadEngineConfig({ repo_root: repo })
    let vault: string | null = null
    if (loaded.ok) {
        const report = reportConfig({ config: loaded.config })
        done_lines.push(...report.done)
        todo_lines.push(...report.todo)
        vault = loaded.config.muninn?.vault ?? null
    } else {
        todo_lines.push(
            `Fix ${ENGINE_CONFIG_FILE} (it was left as it is): ${loaded.error}`
        )
    }

    const checks: SetupCheck[] = [
        login,
        remote,
        await check({
            name: 'issue_links',
            run: () => checkIssueLinks({ github, github_repo }),
        }),
        await check({
            name: 'base_branch',
            run: () => checkBaseBranch({ repo, base_branch }),
        }),
        await check({
            name: 'vault',
            run: () => checkVault({ memory, vault }),
        }),
    ]
    for (const { name, status, detail } of checks) {
        log(`[luca-setup] ${name}: ${status === 'done' ? 'done' : 'to do'}`)
        if (status === 'done') done_lines.push(detail)
        else todo_lines.push(detail)
    }

    const pass_fail = loaded.ok
        ? testCommands({ config: loaded.config }).filter(
              ({ results }) => results === 'pass_fail'
          )
        : []
    const note = `Tickets that need new tests the red check can't read${pass_fail.length === 0 ? '' : ` (such as tests for ${pass_fail.map(({ run }) => `\`${run}\``).join(', ')})`} aren't Luca tickets: label them ready-for-human.`
    const message = [
        `luca-setup in ${repo}. Nothing was committed.`,
        `Done:\n${list(done_lines)}`,
        `To do:\n${list(todo_lines)}`,
        note,
    ].join('\n\n')
    log(message)
    return { ok: todo_lines.length === 0, message, checks }
}
