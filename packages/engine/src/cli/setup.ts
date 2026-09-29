import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import {
    checksFor,
    formatChecks,
    ok,
    problem,
    type DoctorCheck,
    type Found,
} from './doctor-checks'

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
    HUMAN_LABEL,
    NEEDS_INFO_LABEL,
    READY_LABEL,
    REFACTOR_LABEL,
    RELEASE_LABELS,
    type Tracker,
} from '../tracker/tracker'

/**
 * `luca setup`: gets a repo ready for Luca. It creates the labels a run
 * needs (and the `release:*` ones in a repo with changesets), writes a
 * starting `.luca/config.json` with the repo's GitHub name as its vault
 * (or converts old Luca's, or leaves a
 * new-style one alone), runs `luca doctor`'s repo checks once, and ends
 * with a plain list of what's done and what's left, then a pointer to
 * `/setup-matt-pocock-skills`. It never commits, and running it again
 * gives the same result, so it doubles as a health check.
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

/** The repo checks that are also setup's own checks, by name. */
const CHECKS_FROM_DOCTOR = [
    'github_remote',
    'issue_links',
    'base_branch',
    'vault',
] as const

/** The checks setup reports, by name. */
export type SetupCheckName = 'gh_login' | (typeof CHECKS_FROM_DOCTOR)[number]

/** One check: done, or a to-do whose `detail` is the plain fix. */
export type SetupCheck = {
    name: SetupCheckName
    status: 'done' | 'todo'
    detail: string
}

/**
 * How setup ended: `ok` when nothing is left to do; `doctor` holds the repo
 * checks it ended with.
 */
export type SetupEnd = {
    ok: boolean
    message: string
    checks: SetupCheck[]
    doctor: DoctorCheck[]
}

/** The labels a run needs, with what they're for. */
const LABELS = [
    {
        name: READY_LABEL,
        color: '0e8a16',
        description: 'Ready for a Luca run',
    },
    {
        // A run leaves these, and the tickets waiting on them, out (#499).
        name: HUMAN_LABEL,
        color: 'c5def5',
        description: 'Needs a person, not an agent',
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

/** The version-bump labels a repo with changesets gets, one per bump. */
const RELEASE_LABEL_INFO: Record<
    (typeof RELEASE_LABELS)[number],
    { color: string; description: string }
> = {
    'release:patch': {
        color: 'c2e0c6',
        description: "A patch bump for this spec's changeset (the default)",
    },
    'release:minor': {
        color: 'fbca04',
        description: "A minor bump for this spec's changeset",
    },
    'release:major': {
        color: 'b60205',
        description: "A major bump for this spec's changeset",
    },
    'release:none': {
        color: 'ededed',
        description: 'No version bump: an empty changeset',
    },
}

/** Where a repo that uses changesets keeps their config. */
const CHANGESET_CONFIG_FILE = join('.changeset', 'config.json')

/** The labels `repo` needs: the run's, plus the release ones with changesets. */
const labelsFor = async ({ repo }: { repo: string }) => [
    ...LABELS,
    ...((await Bun.file(join(repo, CHANGESET_CONFIG_FILE)).exists())
        ? RELEASE_LABELS.map((name) => ({ name, ...RELEASE_LABEL_INFO[name] }))
        : []),
]

/** The last line of setup's report: the planning skills' own setup. */
const SKILLS_POINTER =
    'Next: run `/setup-matt-pocock-skills` in Claude Code in this repo, so the planning skills (`/to-spec`, `/to-tickets`) know it.'

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

const vaultName = (vault: unknown): string | null =>
    typeof vault === 'string' && vault.trim() !== '' ? vault : null

/**
 * The vault an old-Luca config names in `muninn.vault`, or else in an older
 * top-level `vault`, if any.
 */
const oldVault = ({ raw }: { raw: Record<string, unknown> }): string | null =>
    vaultName(isRecord(raw.muninn) ? raw.muninn.vault : undefined) ??
    vaultName(raw.vault)

/**
 * The `name` part of a GitHub `owner/name`, a new repo's vault. Pure.
 *
 * @example
 * repoName({ github_repo: 'asibilia/tmnb' }) // 'tmnb'
 */
const repoName = ({
    github_repo,
}: {
    github_repo: string | null
}): string | null => vaultName(github_repo?.split('/').at(-1)?.trim() ?? null)

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
    labels,
}: {
    github: SetupGitHub
    labels: { name: string; color: string; description: string }[]
}): Promise<{ done: string[]; todo: string[] }> => {
    let have: Set<string>
    try {
        have = new Set(await github.listLabels())
    } catch (error) {
        return {
            done: [],
            todo: [
                `Couldn't list the repo's labels (${errorText(error)}). Fix gh and the GitHub remote, then run luca setup again.`,
            ],
        }
    }
    const done: string[] = []
    const todo: string[] = []
    for (const label of labels) {
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

const done = (detail: string) => ({ status: 'done' as const, detail })
const todo = (detail: string) => ({ status: 'todo' as const, detail })

/** A doctor check's result as a setup check: a to-do's detail ends with its fix. */
const asSetup = (found: Found): Omit<SetupCheck, 'name'> =>
    found.status === 'ok'
        ? done(found.detail)
        : todo(`${found.detail} ${found.fix ?? ''}`.trim())

/** The gh login, as setup checks it; a throw becomes a to-do with its error. */
const checkLogin = async ({
    github,
}: {
    github: SetupGitHub
}): Promise<SetupCheck> => {
    const name = 'gh_login'
    try {
        const user = await github.login()
        return user === null
            ? { name, ...todo('gh is not logged in. Run `gh auth login`.') }
            : { name, ...done(`gh is logged in as ${user}`) }
    } catch (error) {
        return {
            name,
            ...todo(
                `The ${name} check failed: ${errorText(error)}. Fix it, then run luca setup again.`
            ),
        }
    }
}

const checkGitHubRemote = ({
    github_repo,
}: {
    github_repo: string | null
}): Found =>
    github_repo === null
        ? problem({
              detail: 'The repo has no GitHub remote.',
              fix: 'Create one with `gh repo create --source . --push`, or add it with `git remote add origin <url>`.',
          })
        : ok(`The repo is ${github_repo} on GitHub`)

const checkIssueLinks = async ({
    github,
    github_repo,
}: {
    github: SetupGitHub
    github_repo: string | null
}): Promise<Found> => {
    if (github_repo === null) {
        return problem({
            detail: "Sub-issues and issue dependencies can't be checked without a GitHub remote.",
            fix: 'Add one, then run luca setup again.',
        })
    }
    const { sub_issues, dependencies } = await github.issueLinks()
    const missing = [
        ...(sub_issues ? [] : ['sub-issues']),
        ...(dependencies ? [] : ['issue dependencies']),
    ]
    if (missing.length === 0) {
        return ok(`${github_repo} has sub-issues and issue dependencies`)
    }
    return problem({
        detail: `${github_repo} has no ${missing.join(' or ')}. Luca reads a spec's tickets and blockers from them.`,
        fix: "Turn them on for the repo's issues, then run luca setup again.",
    })
}

const checkBaseBranch = async ({
    repo,
    base_branch,
}: {
    repo: string
    base_branch: string
}): Promise<Found> => {
    const listed = await runCommand({
        cmd: ['git', 'ls-remote', '--heads', 'origin', base_branch],
        cwd: repo,
    })
    if (listed.exit_code !== 0) {
        return problem({
            detail: `Couldn't reach origin (${listed.stderr.trim()}).`,
            fix: `Add an \`origin\` remote on GitHub and push \`${base_branch}\` to it: \`git push -u origin ${base_branch}\`.`,
        })
    }
    if (listed.stdout.trim() === '') {
        return problem({
            detail: `origin has no \`${base_branch}\` branch.`,
            fix: `Push it: \`git push -u origin ${base_branch}\`.`,
        })
    }
    return ok(`origin has \`${base_branch}\``)
}

const checkVault = async ({
    memory,
    vault,
}: {
    memory: MemoryClient
    vault: string | null
}): Promise<Found> => {
    if (vault === null) {
        return problem({
            detail: 'No memory vault.',
            fix: `Set \`muninn.vault\` in ${ENGINE_CONFIG_FILE} to the project's MuninnDB vault (such as the repo's name).`,
        })
    }
    const found = await safeMemory({ deps: { client: memory } }).recall({
        vault,
        query: 'luca setup',
        limit: 1,
        threshold: 0,
    })
    if (!found.ok) {
        return problem({
            detail: `MuninnDB couldn't search the \`${vault}\` vault (${found.error}).`,
            fix: 'Start MuninnDB, or set LUCA_MUNINN_URL and LUCA_MUNINN_TOKEN, then run luca setup again.',
        })
    }
    return ok(`MuninnDB has the \`${vault}\` vault`)
}

const SETUP_FIX = 'Run luca setup (or luca doctor --fix)'

/** The repo's labels, read-only: missing ones are a problem. */
const checkLabels = async ({
    repo,
    github,
    github_repo,
}: {
    repo: string
    github: SetupGitHub
    github_repo: string | null
}): Promise<Found> => {
    if (github_repo === null) {
        return problem({
            detail: "The labels weren't checked: the repo has no GitHub remote.",
            fix: `Add a GitHub remote, then ${SETUP_FIX.toLowerCase()}.`,
        })
    }
    const have = new Set(await github.listLabels())
    const needed = (await labelsFor({ repo })).map(({ name }) => name)
    const missing = needed.filter((name) => !have.has(name))
    if (missing.length > 0) {
        return problem({
            detail: `The repo is missing the ${missing.map((name) => `\`${name}\``).join(', ')} label${missing.length === 1 ? '' : 's'}.`,
            fix: `${SETUP_FIX} to create them.`,
        })
    }
    return ok(`The repo has the labels a run needs: ${needed.join(', ')}`)
}

/** The repo's `.luca/config.json`, read-only. */
const checkConfig = async ({
    repo,
    loaded,
}: {
    repo: string
    loaded: Awaited<ReturnType<typeof loadEngineConfig>>
}): Promise<Found> => {
    const found = await findConfig({ repo })
    if (found.kind === 'missing') {
        return problem({
            detail: `The repo has no ${ENGINE_CONFIG_FILE}.`,
            fix: `${SETUP_FIX} to write one from package.json's scripts.`,
        })
    }
    if (found.kind === 'old') {
        return problem({
            detail: `${ENGINE_CONFIG_FILE} is old Luca's.`,
            fix: `${SETUP_FIX} to convert it, keeping its vault.`,
        })
    }
    if (found.kind === 'broken') {
        return problem({
            detail: `${ENGINE_CONFIG_FILE} is broken: ${found.error}.`,
            fix: `Fix ${ENGINE_CONFIG_FILE} by hand, then run luca doctor again.`,
        })
    }
    if (!loaded.ok) {
        return problem({
            detail: `${ENGINE_CONFIG_FILE} doesn't load: ${loaded.error}`,
            fix: `Fix ${ENGINE_CONFIG_FILE}, then run luca doctor again.`,
        })
    }
    if (testCommands({ config: loaded.config }).length === 0) {
        return problem({
            detail: `${ENGINE_CONFIG_FILE} has no test command.`,
            fix: `Add one to \`checks.test\` in ${ENGINE_CONFIG_FILE}. Intake refuses a run without one.`,
        })
    }
    return ok(`${ENGINE_CONFIG_FILE} is new-style and has a test command`)
}

/**
 * `luca setup`'s checks as doctor's repo group, read-only: they create no
 * label and write no file. Each problem carries its fix.
 *
 * @example
 * const checks = await repoChecks({ repo: process.cwd(), github, memory })
 */
export const repoChecks = async ({
    repo,
    github,
    memory,
    base_branch = 'main',
}: {
    repo: string
    github: SetupGitHub
    memory: MemoryClient
    base_branch?: string
}): Promise<DoctorCheck[]> => {
    const github_repo = await github.githubRepo().catch(() => null)
    const loaded = await loadEngineConfig({ repo_root: repo }).catch(
        (error: unknown) => ({ ok: false as const, error: errorText(error) })
    )
    const vault = loaded.ok ? (loaded.config.muninn?.vault ?? null) : null
    return checksFor({
        group: 'repo',
        checks: [
            ['labels', () => checkLabels({ repo, github, github_repo })],
            ['config', () => checkConfig({ repo, loaded })],
            ['github_remote', async () => checkGitHubRemote({ github_repo })],
            ['issue_links', () => checkIssueLinks({ github, github_repo })],
            ['base_branch', () => checkBaseBranch({ repo, base_branch })],
            ['vault', () => checkVault({ memory, vault })],
        ],
    })
}

const list = (lines: string[]): string =>
    lines.length === 0
        ? '- nothing'
        : lines.map((line) => `- ${line}`).join('\n')

/**
 * Gets `repo` ready for Luca. It creates the missing `ready-for-agent`,
 * `ready-for-human`, `refactor`, and `needs-info` labels, and in a repo with
 * `.changeset/config.json` the `release:*` ones too; writes a starting
 * `.luca/config.json` from `package.json` when there is none (see
 * `guessChecks`), with the repo's GitHub name as its `muninn.vault`, rewrites an old-Luca config into the new shape keeping
 * its `muninn.vault` (or an older top-level `vault`), and leaves a
 * new-style config alone; then checks the `gh` login and runs `luca
 * doctor`'s repo checks (`repoChecks`) once: the GitHub remote, sub-issues
 * and issue dependencies, `base_branch` (default `main`) on `origin`, and
 * the vault through `memory` become its checks, and the labels and config
 * checks print as doctor prints them. It never commits and never throws: it
 * ends with the done and to-do list and a pointer to
 * `/setup-matt-pocock-skills`, logged and returned, with every repo check in
 * `doctor`.
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

    const login = await checkLogin({ github })
    const github_repo = await github.githubRepo().catch(() => null)

    if (login.status === 'done' && github_repo !== null) {
        const labels = await ensureLabels({
            github,
            labels: await labelsFor({ repo }),
        })
        done_lines.push(...labels.done)
        todo_lines.push(...labels.todo)
    } else {
        todo_lines.push(
            'The labels were not checked. Fix the gh login and the GitHub remote, then run luca setup again.'
        )
    }

    const found = await findConfig({ repo })
    if (found.kind === 'missing' || found.kind === 'old') {
        const vault =
            found.kind === 'old'
                ? oldVault({ raw: found.raw })
                : repoName({ github_repo })
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
        if (found.kind === 'missing' && vault !== null) {
            done_lines.push(
                `Set the memory vault to \`${vault}\`, the repo's GitHub name. Change \`muninn.vault\` in ${ENGINE_CONFIG_FILE} to use another.`
            )
        }
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
    if (loaded.ok) {
        const report = reportConfig({ config: loaded.config })
        done_lines.push(...report.done)
        todo_lines.push(...report.todo)
    } else {
        todo_lines.push(
            `Fix ${ENGINE_CONFIG_FILE} (it was left as it is): ${loaded.error}`
        )
    }

    // Some repo checks become setup's own, listed as done or to do; the
    // others (the labels and the config) print as doctor prints them.
    const doctor = await repoChecks({ repo, github, memory, base_branch })
    const checks: SetupCheck[] = [login]
    const others: DoctorCheck[] = []
    for (const { name, ...found } of doctor) {
        const setup_name = CHECKS_FROM_DOCTOR.find((known) => known === name)
        if (setup_name === undefined) others.push({ name, ...found })
        else checks.push({ name: setup_name, ...asSetup(found) })
    }
    for (const line of formatChecks({ checks: others })) log(line)
    for (const { name, status, detail } of checks) {
        log(`[luca setup] ${name}: ${status === 'done' ? 'done' : 'to do'}`)
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
        `luca setup in ${repo}. Nothing was committed.`,
        `Done:\n${list(done_lines)}`,
        `To do:\n${list(todo_lines)}`,
        note,
        SKILLS_POINTER,
    ].join('\n\n')
    log(message)
    return { ok: todo_lines.length === 0, message, checks, doctor }
}
