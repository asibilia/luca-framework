import { $ } from 'bun'

import { z } from 'zod'

import {
    OpenedPullRequestSchema,
    TrackerCommentSchema,
    TrackerIssueSchema,
    type Tracker,
    type TrackerIssue,
} from './tracker'

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

type GitHubIssue = z.infer<typeof GitHubIssueSchema>

/** Calls `gh api`; `null` when the call fails (such as a 404). */
const ghApi = async ({ path }: { path: string }): Promise<unknown> => {
    const result = await $`gh api ${path}`.quiet().nothrow()
    if (result.exitCode !== 0) return null
    return JSON.parse(result.stdout.toString())
}

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
 * installed and logged in. Not exercised by tests; the in-memory tracker
 * stands in for it.
 *
 * @example
 * const tracker = createGitHubTracker({ repo: 'asibilia/luca-framework' })
 * const spec = await tracker.readSpec({ spec_number: 359 })
 */
export const createGitHubTracker = ({ repo }: { repo: string }): Tracker => {
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
            const posted =
                await $`gh api repos/${repo}/issues/${number}/comments -f body=${body}`.quiet()
            return parseOrThrow({
                schema: GitHubCommentPostedSchema,
                value: JSON.parse(posted.stdout.toString()),
                what: `the comment posted on #${number}`,
            })
        },
        listComments: async ({ number, since_id }) => {
            // One JSON object per line, across every page.
            const listed =
                await $`gh api --paginate repos/${repo}/issues/${number}/comments?per_page=100 --jq ${'.[] | {id, author: (.user.login // ""), body: (.body // "")}'}`.quiet()
            return listed.stdout
                .toString()
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
            await $`gh issue edit ${number} --repo ${repo} --add-label ${label}`.quiet()
        },
        removeLabel: async ({ number, label }) => {
            await $`gh issue edit ${number} --repo ${repo} --remove-label ${label}`
                .quiet()
                .nothrow()
        },
        openPullRequest: async ({ head, base, title, body }) => {
            const url = (
                await $`gh pr create --repo ${repo} --head ${head} --base ${base} --title ${title} --body ${body}`.quiet()
            ).stdout
                .toString()
                .trim()
            const number = Number(/\/pull\/(\d+)/.exec(url)?.[1])
            return parseOrThrow({
                schema: OpenedPullRequestSchema,
                value: { number, url },
                what: `the pull request from ${head}`,
            })
        },
    }
}
