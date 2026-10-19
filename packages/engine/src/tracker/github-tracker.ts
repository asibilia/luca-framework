import { z } from 'zod'

import {
    createGhCalls,
    realGh,
    realRetryDeps,
    TransientGhError,
    type GhRetryDeps,
    type GhRunner,
} from './gh-retry'
import {
    labelDefinition,
    OpenedPullRequestSchema,
    TrackerCommentSchema,
    TrackerIssueSchema,
    type LabelDefinition,
    type Tracker,
    type TrackerIssue,
} from './tracker'

export type { GhRunner } from './gh-retry'

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

/** Whether `gh label create` failed because the label is there already. */
const ALREADY_EXISTS = /already exists/i

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
 * Every call retries transient failures (see `gh-retry.ts`). A read throws
 * after its last try; only a 404 reads as none. A write checks whether its
 * first try landed before trying again: a comment with the same body is
 * adopted, as is an open PR from the same branch, and a label that already
 * exists counts as created.
 *
 * @param gh - Runs `gh`. Defaults to the real one.
 * @param sleep - Waits between tries. Defaults to a real wait.
 * @param log - Writes a retry to the run log. Defaults to stdout.
 *
 * @example
 * const tracker = createGitHubTracker({ repo: 'asibilia/luca-framework' })
 * const spec = await tracker.readSpec({ spec_number: 359 })
 */
export const createGitHubTracker = ({
    repo,
    gh,
    sleep,
    log,
}: {
    repo: string
    gh?: GhRunner
} & Partial<GhRetryDeps>): Tracker => {
    const calls = createGhCalls({
        run: gh ?? realGh(),
        sleep: sleep ?? realRetryDeps.sleep,
        log: log ?? realRetryDeps.log,
    })

    /** Runs `gh` and returns its output; throws when it fails. */
    const ghOk = (args: string[]): Promise<string> => calls.ok({ args })

    /** Reads `gh api <path>` as JSON; `null` only for a 404. */
    const ghApi = calls.api

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

    const listComments: Tracker['listComments'] = async ({
        number,
        since_id,
    }) =>
        // One JSON object per line, across every page.
        (
            await calls.read({
                args: [
                    'api',
                    '--paginate',
                    `repos/${repo}/issues/${number}/comments?per_page=100`,
                    '--jq',
                    '.[] | {id, author: (.user.login // ""), body: (.body // "")}',
                ],
                parse: (listed) =>
                    listed
                        .split('\n')
                        .filter((line) => line.trim() !== '')
                        .map((line) =>
                            parseOrThrow({
                                schema: TrackerCommentSchema,
                                value: JSON.parse(line),
                                what: `a comment on #${number}`,
                            })
                        ),
            })
        ).filter(({ id }) => id > since_id)

    /** Creates a label; one already there counts as created. */
    const createLabel: Tracker['createLabel'] = async (label) => {
        try {
            await ghOk(createLabelArgs(label))
        } catch (error) {
            if (error instanceof Error && ALREADY_EXISTS.test(error.message)) {
                return
            }
            throw error
        }
    }

    /** Adds or removes one label of an issue; never throws. */
    const editLabel = ({
        number,
        label,
        change,
    }: {
        number: number
        label: string
        change: 'add' | 'remove'
    }): Promise<Error | null> =>
        ghOk([
            'issue',
            'edit',
            String(number),
            '--repo',
            repo,
            `--${change}-label`,
            label,
        ]).then(
            () => null,
            (error: Error) => error
        )

    const findOpenPullRequest: Tracker['findOpenPullRequest'] = async ({
        head,
    }) => {
        // `--head` matches the branch name alone, so a fork's PR from a
        // branch of the same name is left out: it isn't the run's.
        const pull = await calls.read({
            args: [
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
            ],
            parse: (listed) =>
                parseOrThrow({
                    schema: GitHubPullListSchema,
                    value: JSON.parse(listed),
                    what: `the open pull requests from ${head}`,
                }).find(({ isCrossRepository }) => !isCrossRepository),
        })
        return pull === undefined
            ? null
            : { number: pull.number, url: pull.url }
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
        // Before a retry, a comment with the same body (its marker is in
        // it) is the first try landing: it is adopted, not posted again.
        comment: ({ number, body }) =>
            calls.read({
                args: [
                    'api',
                    `repos/${repo}/issues/${number}/comments`,
                    '-f',
                    `body=${body}`,
                ],
                parse: (posted) =>
                    parseOrThrow({
                        schema: GitHubCommentPostedSchema,
                        value: JSON.parse(posted),
                        what: `the comment posted on #${number}`,
                    }),
                landed: async () => {
                    const comments = await listComments({ number, since_id: 0 })
                    const same = comments.find((each) => each.body === body)
                    return same === undefined ? null : { id: same.id }
                },
            }),
        listComments,
        addLabel: async ({ number, label }) => {
            const failed = await editLabel({ number, label, change: 'add' })
            if (failed === null) return
            if ((await listLabels()).includes(label)) throw failed
            // A failed create still tries the add again: another run may
            // have just created the label.
            const created = await createLabel(
                labelDefinition({ name: label })
            ).then(
                () => null,
                (error: Error) => error
            )
            const again = await editLabel({ number, label, change: 'add' })
            if (again === null) return
            if (created === null) throw again
            throw new Error(
                `${again.message}; creating the label failed too: ${created.message}`
            )
        },
        removeLabel: async ({ number, label }) => {
            const failed = await editLabel({ number, label, change: 'remove' })
            if (failed === null) return
            // A label the repo lacks can't be on the issue.
            if ((await listLabels()).includes(label)) throw failed
        },
        // A read that fails fails the close too, rather than closing blind.
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
        // Retried only once no open PR from `head` shows the first try
        // landed; one that does is adopted.
        openPullRequest: ({ head, base, title, body }) =>
            calls.read({
                args: [
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
                ],
                parse: (created) => {
                    const url = created.trim()
                    const number = Number(/\/pull\/(\d+)/.exec(url)?.[1])
                    return parseOrThrow({
                        schema: OpenedPullRequestSchema,
                        value: { number, url },
                        what: `the pull request from ${head}`,
                    })
                },
                landed: () => findOpenPullRequest({ head }),
            }),
        findOpenPullRequest,
        listLabels,
        createLabel,
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
    const calls = createGhCalls({
        run: realGh({ cwd: repo }),
        ...realRetryDeps,
    })
    const name = await calls
        .ok({
            args: [
                'repo',
                'view',
                '--json',
                'nameWithOwner',
                '--jq',
                '.nameWithOwner',
            ],
        })
        .then(
            (stdout) => stdout.trim(),
            (error: Error) => {
                throw new Error(
                    `Could not find the GitHub repo of ${repo} with gh: ${error.message}`
                )
            }
        )
    if (name === '') {
        throw new Error(`Could not find the GitHub repo of ${repo} with gh`)
    }
    return name
}

/**
 * The login `gh` is signed in as, or `null` when it isn't. A transient
 * failure is retried, and throws after the last try.
 */
export const ghLogin = async (): Promise<string | null> => {
    const calls = createGhCalls({ run: realGh(), ...realRetryDeps })
    try {
        const login = (
            await calls.ok({ args: ['api', 'user', '--jq', '.login'] })
        ).trim()
        return login === '' ? null : login
    } catch (error) {
        if (error instanceof TransientGhError) throw error
        return null
    }
}
