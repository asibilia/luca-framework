import { formatChecks, type DoctorCheck, type Found } from './doctor-checks'
import {
    errorText,
    findConfig,
    oldVault,
    readScripts,
    repoName,
    reportConfig,
    startingConfig,
    writeConfig,
} from './setup-config'
import { labelsFor, repoChecks, type SetupGitHub } from './setup-repo-checks'

import {
    ENGINE_CONFIG_FILE,
    loadEngineConfig,
    testCommands,
} from '../config/engine-config'
import type { MemoryClient } from '../memory/memory-client'

export { repoChecks, type SetupGitHub } from './setup-repo-checks'

/**
 * `luca setup`: gets a repo ready for Luca. It creates the labels a run
 * needs (and the `release:*` ones in a repo with changesets), writes a
 * starting `.luca/config.json` with the repo's GitHub name as its vault
 * (or converts old Luca's, or leaves a
 * new-style one alone), runs `luca doctor`'s repo checks once, and ends
 * with a plain list of what's done and what's left, then a pointer to
 * `/setup-matt-pocock-skills`. It never commits, and running it again
 * gives the same result, so it doubles as a health check. Its config side
 * is in `setup-config.ts`, and doctor's repo group in `setup-repo-checks.ts`.
 */

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

/** The last line of setup's report: the planning skills' own setup. */
const SKILLS_POINTER =
    'Next: run `/setup-matt-pocock-skills` in Claude Code in this repo, so the planning skills (`/to-spec`, `/to-tickets`) know it.'

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
 * the vault through `memory` become its checks, and the labels, config and
 * junit checks print as doctor prints them. It never commits and never
 * throws: it ends with the done and to-do list and a pointer to
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
    // others (the labels, the config and junit) print as doctor prints them.
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
