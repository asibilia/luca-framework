/**
 * Doctor's repo group (`repoChecks`), which `luca setup` runs once too: the
 * labels, the config, its junit commands (#668), the GitHub remote, issue
 * links, the base branch on `origin`, and the memory vault. Read-only.
 */
import { join } from 'node:path'

import {
    checksFor,
    ok,
    problem,
    type DoctorCheck,
    type Found,
} from './doctor-checks'
import { errorText, findConfig } from './setup-config'
import { checkJunit, junitCommands } from './setup-junit-check'

import {
    ENGINE_CONFIG_FILE,
    loadEngineConfig,
    testCommands,
} from '../config/engine-config'
import { safeMemory, type MemoryClient } from '../memory/memory-client'
import { runCommand } from '../shell/run-command'
import {
    RELEASE_LABEL_DEFINITIONS,
    RELEASE_LABELS,
    RUN_LABELS,
    type Tracker,
} from '../tracker/tracker'

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

/** Where a repo that uses changesets keeps their config. */
const CHANGESET_CONFIG_FILE = join('.changeset', 'config.json')

/** The labels `repo` needs: the run's, plus the release ones with changesets. */
export const labelsFor = async ({ repo }: { repo: string }) => [
    ...RUN_LABELS,
    ...((await Bun.file(join(repo, CHANGESET_CONFIG_FILE)).exists())
        ? RELEASE_LABELS.map((name) => RELEASE_LABEL_DEFINITIONS[name])
        : []),
]

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
 * label and write no file. Each problem carries its fix. The `junit` check
 * (#668) is there only when the config loads and has a junit command.
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
    const junit: [string, () => Promise<Found>][] =
        loaded.ok && junitCommands({ config: loaded.config }).length > 0
            ? [['junit', () => checkJunit({ repo, config: loaded.config })]]
            : []
    return checksFor({
        group: 'repo',
        checks: [
            ['labels', () => checkLabels({ repo, github, github_repo })],
            ['config', () => checkConfig({ repo, loaded })],
            ...junit,
            ['github_remote', async () => checkGitHubRemote({ github_repo })],
            ['issue_links', () => checkIssueLinks({ github, github_repo })],
            ['base_branch', () => checkBaseBranch({ repo, base_branch })],
            ['vault', () => checkVault({ memory, vault })],
        ],
    })
}
