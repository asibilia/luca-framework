import { $ } from 'bun'

import { z } from 'zod'

import {
    labelDefinition,
    OpenedPullRequestSchema,
    TrackerCommentSchema,
    TrackerError,
    TrackerIssueSchema,
    type LabelDefinition,
    type Tracker,
    type TrackerIssue,
} from './tracker'

import type { CommandResult } from '../shell/run-command'

/** An issue as GitHub's REST API returns it (only the fields we use). */
const GitHubIssueSchema = z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable().default(''),
    state: z.enum(['open', 'closed']),
    labels: z
        .array(z.union([z.string(), z.object({ name: z.string() })]))
        .default([]),
    html_url: z.string().default(''),
    user: z.object({ login: z.string() }).nullable().default(null),
})

/** A comment as `gh api` returns it on posting (only its id is used). */
const GitHubCommentPostedSchema = z.object({ id: z.number().int() })

const GitHubIssueListSchema = z.array(GitHubIssueSchema)

/** Issues listed only for their numbers. */
const GitHubIssueNumbersSchema = z.array(
    z.object({ number: z.number().int().positive() })
)

/**
 * Pull requests as `gh pr list --json number,url,isCrossRepository` prints
 * them. A fork's PR has `isCrossRepository` set.
 */
const GitHubPullListSchema = z.array(
    OpenedPullRequestSchema.extend({ isCrossRepository: z.boolean() })
)

type GitHubIssue = z.infer<typeof GitHubIssueSchema>

/**
 * Runs `gh` with `args` and collects its output. Never throws on a non-zero
 * exit. The GitHub tracker makes every call through one, so tests can fake
 * `gh`.
 */
export type GhRunner = (
    args: string[]
) => Promise<Pick<CommandResult, 'exit_code' | 'stdout' | 'stderr'>>

/** The real `gh`, on the `PATH`. */
const runGh: GhRunner = async (args) => {
    const result = await $`gh ${args}`.quiet().nothrow()
    return {
        exit_code: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
    }
}

/** A failed `gh` call as a `TrackerError`, in `gh`'s own words. */
const ghError = ({
    args,
    result,
}: {
    args: string[]
    result: Awaited<ReturnType<GhRunner>>
}): TrackerError =>
    new TrackerError(
        `\`gh ${args.slice(0, 2).join(' ')}\` failed (exit code ${result.exit_code}): ${result.stderr.trim()}`
    )

const parseOrThrow = <T>({
    schema,
    value,
    what,
}: {
    schema: z.ZodType<T>
    value: unknown
    what: string
}): T => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
        throw new Error(
            `Unexpected GitHub answer for ${what}: ${z.prettifyError(parsed.error)}`
        )
    }
    return parsed.data
}

/**
 * The real tracker: GitHub issues through the `gh` CLI, which must be
 * installed and logged in. Engine tests use the in-memory tracker; the
 * tracker's own tests pass a fake `gh`.
 *
 * Adding a label the repo lacks creates it first (#500): when the add
 * fails, the repo's labels are read, and a missing one is created as
 * `labelDefinition` describes it, then added again. A failure with the
 * label there is thrown as it is. The happy path costs one call, and
 * nothing hangs on the wording of `gh`'s error.
 *
 * @param gh - Runs `gh`. Defaults to the real one.
 *
 * @example
 * const tracker = createGitHubTracker({ repo: 'asibilia/luca-framework' })
 * const spec = await tracker.readSpec({ spec_number: 359 })
 */
export const createGitHubTracker = ({
    repo,
    gh,
}: {
    repo: string
    gh?: GhRunner
}): Tracker => {
    const run = gh ?? runGh

    /** Runs `gh` and returns its output; throws when it fails. */
    const ghOk = async (args: string[]): Promise<string> => {
        const result = await run(args)
        if (result.exit_code !== 0) throw ghError({ args, result })
        return result.stdout
    }

    /** Calls `gh api`; `null` when the call fails (such as a 404). */
    const ghApi = async ({ path }: { path: string }): Promise<unknown> => {
        const result = await run(['api', path])
        if (result.exit_code !== 0) return null
        return JSON.parse(result.stdout)
    }

    const blockedBy = async (number: number): Promise<number[]> => {
        const value = await ghApi({
            path: `repos/${repo}/issues/${number}/dependencies/blocked_by`,
        })
        if (value === null) return []
        return parseOrThrow({
            schema: GitHubIssueListSchema,
            value,
            what: `the blockers of #${number}`,
        }).map((issue) => issue.number)
    }

    const toTrackerIssue = async (issue: GitHubIssue): Promise<TrackerIssue> =>
        TrackerIssueSchema.parse({
            number: issue.number,
            title: issue.title,
            body: issue.body ?? '',
            state: issue.state,
            labels: issue.labels.map((label) =>
                typeof label === 'string' ? label : label.name
            ),
            blocked_by: await blockedBy(issue.number),
            url: issue.html_url,
            author: issue.user?.login ?? '',
        })

    const readIssue: Tracker['readIssue'] = async ({ number }) => {
        const value = await ghApi({ path: `repos/${repo}/issues/${number}` })
        if (value === null) return null
        return toTrackerIssue(
            parseOrThrow({
                schema: GitHubIssueSchema,
                value,
                what: `issue #${number}`,
            })
        )
    }

    const listLabels: Tracker['listLabels'] = async () =>
        (
            await ghOk([
                'label',
                'list',
                '--repo',
                repo,
                '--limit',
                '1000',
                '--json',
                'name',
                '--jq',
                '.[].name',
            ])
        )
            .split('\n')
            .filter((name) => name !== '')

    const createLabelArgs = ({
        name,
        color,
        description,
    }: LabelDefinition): string[] => [
        'label',
        'create',
        name,
        '--repo',
        repo,
        '--color',
        color,
        '--description',
        description,
    ]

    /** Adds or removes one label of an issue; never throws. */
    const editLabel = async ({
        number,
        label,
        change,
    }: {
        number: number
        label: string
        change: 'add' | 'remove'
    }): Promise<Error | null> => {
        const args = [
            'issue',
            'edit',
            String(number),
            '--repo',
            repo,
            `--${change}-label`,
            label,
        ]
        const result = await run(args)
        return result.exit_code === 0 ? null : ghError({ args, result })
    }

    return {
        readIssue,
        readSpec: async ({ spec_number }) => {
            const spec = await readIssue({ number: spec_number })
            if (spec === null) {
                throw new Error(`Spec #${spec_number} was not found in ${repo}`)
            }
            return spec
        },
        listSubTickets: async ({ spec_number }) => {
            const value = await ghApi({
                path: `repos/${repo}/issues/${spec_number}/sub_issues?per_page=100`,
            })
            if (value === null) return []
            const issues = parseOrThrow({
                schema: GitHubIssueListSchema,
                value,
                what: `the sub-tickets of #${spec_number}`,
            })
            return Promise.all(issues.map(toTrackerIssue))
        },
        comment: async ({ number, body }) => {
            const posted = await ghOk([
                'api',
                `repos/${repo}/issues/${number}/comments`,
                '-f',
                `body=${body}`,
            ])
            return parseOrThrow({
                schema: GitHubCommentPostedSchema,
                value: JSON.parse(posted),
                what: `the comment posted on #${number}`,
            })
        },
        listComments: async ({ number, since_id }) => {
            // One JSON object per line, across every page.
            const listed = await ghOk([
                'api',
                '--paginate',
                `repos/${repo}/issues/${number}/comments?per_page=100`,
                '--jq',
                '.[] | {id, author: (.user.login // ""), body: (.body // "")}',
            ])
            return listed
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line) =>
                    parseOrThrow({
                        schema: TrackerCommentSchema,
                        value: JSON.parse(line),
                        what: `a comment on #${number}`,
                    })
                )
                .filter(({ id }) => id > since_id)
        },
        addLabel: async ({ number, label }) => {
            const failed = await editLabel({ number, label, change: 'add' })
            if (failed === null) return
            if ((await listLabels()).includes(label)) throw failed
            // A failed create still tries the add again: another run may
            // have just created the label.
            const created = await run(
                createLabelArgs(labelDefinition({ name: label }))
            )
            const again = await editLabel({ number, label, change: 'add' })
            if (again === null) return
            if (created.exit_code === 0) throw again
            throw new Error(
                `${again.message}; creating the label failed too: ${created.stderr.trim()}`
            )
        },
        removeLabel: async ({ number, label }) => {
            const failed = await editLabel({ number, label, change: 'remove' })
            if (failed === null) return
            // A label the repo lacks can't be on the issue.
            if ((await listLabels()).includes(label)) throw failed
        },
        closeIssue: async ({ number }) => {
            const issue = await readIssue({ number })
            if (issue?.state === 'closed') return
            await ghOk([
                'issue',
                'close',
                String(number),
                '--repo',
                repo,
                '--reason',
                'completed',
            ])
        },
        openPullRequest: async ({ head, base, title, body }) => {
            const url = (
                await ghOk([
                    'pr',
                    'create',
                    '--repo',
                    repo,
                    '--head',
                    head,
                    '--base',
                    base,
                    '--title',
                    title,
                    '--body',
                    body,
                ])
            ).trim()
            const number = Number(/\/pull\/(\d+)/.exec(url)?.[1])
            return parseOrThrow({
                schema: OpenedPullRequestSchema,
                value: { number, url },
                what: `the pull request from ${head}`,
            })
        },
        findOpenPullRequest: async ({ head }) => {
            const listed = await ghOk([
                'pr',
                'list',
                '--repo',
                repo,
                '--head',
                head,
                '--state',
                'open',
                '--json',
                'number,url,isCrossRepository',
            ])
            // `--head` matches the branch name alone, so a fork's PR from a
            // branch of the same name is left out: it isn't the run's.
            const pull = parseOrThrow({
                schema: GitHubPullListSchema,
                value: JSON.parse(listed),
                what: `the open pull requests from ${head}`,
            }).find(({ isCrossRepository }) => !isCrossRepository)
            return pull === undefined
                ? null
                : { number: pull.number, url: pull.url }
        },
        listLabels,
        createLabel: async (label) => {
            await ghOk(createLabelArgs(label))
        },
        // Checked on the repo's newest issue; a repo with no issues yet
        // can't show them missing, so both count as there.
        issueLinks: async () => {
            const value = await ghApi({
                path: `repos/${repo}/issues?state=all&per_page=1`,
            })
            if (value === null) {
                throw new Error(`gh couldn't list the issues of ${repo}`)
            }
            const [newest] = parseOrThrow({
                schema: GitHubIssueNumbersSchema,
                value,
                what: `the newest issue of ${repo}`,
            })
            if (newest === undefined) {
                return { sub_issues: true, dependencies: true }
            }
            const works = async (path: string): Promise<boolean> =>
                (await ghApi({ path })) !== null
            return {
                sub_issues: await works(
                    `repos/${repo}/issues/${newest.number}/sub_issues`
                ),
                dependencies: await works(
                    `repos/${repo}/issues/${newest.number}/dependencies/blocked_by`
                ),
            }
        },
    }
}

/**
 * The GitHub `owner/name` of the repo checked out at `repo`, from `gh`.
 * Throws when `gh` can't find it.
 */
export const githubRepoOf = async ({
    repo,
}: {
    repo: string
}): Promise<string> => {
    const result =
        await $`gh repo view --json nameWithOwner --jq .nameWithOwner`
            .cwd(repo)
            .quiet()
            .nothrow()
    const name = result.stdout.toString().trim()
    if (result.exitCode !== 0 || name === '') {
        throw new Error(
            `Could not find the GitHub repo of ${repo} with gh: ${result.stderr.toString().trim()}`
        )
    }
    return name
}

/** The login `gh` is signed in as, or `null` when it isn't. */
export const ghLogin = async (): Promise<string | null> => {
    const result = await $`gh api user --jq .login`.quiet().nothrow()
    const login = result.stdout.toString().trim()
    return result.exitCode === 0 && login !== '' ? login : null
}
