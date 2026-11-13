import { z } from 'zod'

import type { PullRequestRef } from './pull-request-ref'

import {
    REPLY_MARKER,
    SUMMARY_MARKER,
} from '../../engine/skills/luca-pr-address/scripts/pr-findings'
import { COVERS_MARKER } from '../../engine/skills/luca-pr-address/scripts/summary-cover'
import type { Gh } from '../../engine/src/story/story-github'

/**
 * The conversation already on a pull request (#752, section 13): its
 * review threads, and the summaries `/luca-pr-address` posts.
 */

/** The author shown for a comment `/luca-pr-address` posted as a reply. */
export const AGENT_AUTHOR = 'luca-pr-address'

/** A review thread on GitHub, as Luca Walk shows it. */
export type GitHubThread = {
    path: string
    side: 'head' | 'base'
    /** The thread's first line; 1 for a file thread or a line that is gone. */
    start_line: number
    end_line: number
    comments: { author: string; body: string }[]
}

/**
 * A comment as the owner sees it: one holding the reply marker is the
 * agent's, with the marker taken out.
 *
 * @example
 * shownComment({ author: 'octocat', body: `Fixed.\n${REPLY_MARKER}` })
 * // { author: 'luca-pr-address', body: 'Fixed.' }
 */
export const shownComment = ({
    author,
    body,
}: {
    author: string
    body: string
}): { author: string; body: string } =>
    body.includes(REPLY_MARKER)
        ? {
              author: AGENT_AUTHOR,
              body: body.split(REPLY_MARKER).join('').trim(),
          }
        : { author, body }

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        nodes {
          path
          subjectType
          line
          startLine
          diffSide
          comments(first: 100) { nodes { author { login } body } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

const ThreadsPageSchema = z.object({
    data: z.object({
        repository: z.object({
            pullRequest: z.object({
                reviewThreads: z.object({
                    nodes: z.array(
                        z.object({
                            path: z.string(),
                            subjectType: z.string().nullish(),
                            line: z.number().int().nullish(),
                            startLine: z.number().int().nullish(),
                            diffSide: z.string().nullish(),
                            comments: z.object({
                                nodes: z.array(
                                    z.object({
                                        author: z
                                            .object({ login: z.string() })
                                            .nullish(),
                                        body: z.string(),
                                    })
                                ),
                            }),
                        })
                    ),
                    pageInfo: z.object({
                        hasNextPage: z.boolean(),
                        endCursor: z.string().nullish(),
                    }),
                }),
            }),
        }),
    }),
})

type ThreadNode = z.infer<
    typeof ThreadsPageSchema
>['data']['repository']['pullRequest']['reviewThreads']['nodes'][number]

const threadOf = (node: ThreadNode): GitHubThread => {
    const line = node.subjectType === 'FILE' ? null : (node.line ?? null)
    const start = line === null ? 1 : (node.startLine ?? line)
    return {
        path: node.path,
        side: node.diffSide === 'LEFT' ? 'base' : 'head',
        start_line: Math.min(start, line ?? 1),
        end_line: line ?? 1,
        comments: node.comments.nodes.map(({ author, body }) =>
            shownComment({ author: author?.login ?? 'ghost', body })
        ),
    }
}

/**
 * The pull request's review threads. Throws when `gh` fails.
 *
 * @example
 * await readGitHubThreads({ gh, ref: { repo: 'octocat/hello-world', number: 12 } })
 */
export const readGitHubThreads = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<GitHubThread[]> => {
    const [owner = '', name = ''] = ref.repo.split('/')
    const threads: GitHubThread[] = []
    let after: string | null = null
    for (;;) {
        const read = await gh({
            args: [
                'api',
                'graphql',
                '-f',
                `query=${THREADS_QUERY}`,
                '-f',
                `owner=${owner}`,
                '-f',
                `name=${name}`,
                '-F',
                `number=${ref.number}`,
                ...(after === null ? [] : ['-f', `after=${after}`]),
            ],
        })
        if (!read.ok) {
            throw new Error(
                `reading the review threads of #${ref.number}: ${read.stderr.trim() || 'gh failed'}`
            )
        }
        const page = ThreadsPageSchema.parse(JSON.parse(read.stdout)).data
            .repository.pullRequest.reviewThreads
        threads.push(...page.nodes.map(threadOf))
        if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) {
            return threads
        }
        after = page.pageInfo.endCursor
    }
}

const CommentPagesSchema = z.array(
    z.array(z.object({ body: z.string().nullable() }))
)

/**
 * The texts of `/luca-pr-address`'s summary comments, newest first, each
 * without its marker line. Throws when `gh` fails.
 */
export const readAgentSummaries = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<string[]> => {
    const listed = await gh({
        args: [
            'api',
            `repos/${ref.repo}/issues/${ref.number}/comments?per_page=100`,
            '--paginate',
            '--slurp',
        ],
    })
    if (!listed.ok) {
        throw new Error(
            `reading the comments of #${ref.number}: ${listed.stderr.trim() || 'gh failed'}`
        )
    }
    return CommentPagesSchema.parse(JSON.parse(listed.stdout))
        .flat()
        .map(({ body }) => body ?? '')
        .filter((body) => body.startsWith(SUMMARY_MARKER))
        .map(shownSummary)
        .reverse()
}

/**
 * A summary's text without its hidden parts: the marker line, and the
 * covers block from its `<!-- luca-pr-address covers` line through the
 * next `-->` line.
 *
 * @example
 * shownSummary(`${SUMMARY_MARKER} -->\n${COVERS_MARKER}\nrc-1\n-->\nFixed.`)
 * // 'Fixed.'
 */
const shownSummary = (body: string): string => {
    const shown: string[] = []
    let in_covers = false
    for (const line of body.split('\n')) {
        if (in_covers) {
            in_covers = line.trim() !== '-->'
            continue
        }
        if (line.trimStart().startsWith(COVERS_MARKER)) {
            in_covers = true
            continue
        }
        if (!line.includes(SUMMARY_MARKER)) shown.push(line)
    }
    return shown.join('\n').trim()
}
