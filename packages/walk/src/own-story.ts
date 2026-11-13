import { z } from 'zod'

import type { PullRequestRef } from './pull-request-ref'
import { isSignedIn } from './signed-in'

import {
    isStoryComment,
    type StoryUnpack,
} from '../../engine/src/story/story-comments'
import type { Gh } from '../../engine/src/story/story-github'
import { findStory } from '../../engine/src/story/story-pick'

/**
 * The story Luca Walk believes (#766): a shared story (comments on the
 * pull request) only when the signed-in user wrote its comments, since
 * anyone who can comment could post one; a private story (on this
 * computer) always. The engine's `findStory` picks between the homes as
 * it does for everyone, given a `gh` whose comment list holds only the
 * signed-in user's comments.
 */

/** A comment on the pull request's conversation, with its real author. */
export type PullComment = { id: number; body: string; author: string | null }

const CommentPagesSchema = z.array(
    z.array(
        z.object({
            id: z.number().int(),
            body: z.string().nullable(),
            user: z.object({ login: z.string() }).nullable(),
        })
    )
)

const commentsArgs = (ref: PullRequestRef) => [
    'api',
    `repos/${ref.repo}/issues/${ref.number}/comments?per_page=100`,
    '--paginate',
    '--slurp',
]

/** Every comment on the conversation, oldest first; gh's error when it fails. */
const readPullComments = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<
    { ok: true; comments: PullComment[] } | { ok: false; stderr: string }
> => {
    const listed = await gh({ args: commentsArgs(ref) })
    if (!listed.ok) return { ok: false, stderr: listed.stderr }
    try {
        const pages = CommentPagesSchema.parse(JSON.parse(listed.stdout))
        return {
            ok: true,
            comments: pages.flat().map(({ id, body, user }) => ({
                id,
                body: body ?? '',
                author: user?.login ?? null,
            })),
        }
    } catch {
        return {
            ok: false,
            stderr: `gh answered something else: ${listed.stdout.trim()}`,
        }
    }
}

/**
 * The story of `ref` the owner can trust, a note when a story by someone
 * else is on the pull request (it is never used), and the conversation's
 * comments, read once (null when they could not be read). Throws as
 * `findStory` does: when the comments can't be read and there is no
 * private story.
 *
 * @param login - The signed-in user; null when unknown, so no shared story is used.
 * @example
 * await findOwnStory({ gh, stories_dir, ref, login: 'octocat' })
 * // { found: { status: 'none' }, note: 'There is a story on #12 by hubot, not by you, so it is not used.', comments }
 */
export const findOwnStory = async ({
    gh,
    stories_dir,
    ref,
    login,
}: {
    gh: Gh
    stories_dir: string
    ref: PullRequestRef
    login: string | null
}): Promise<{
    found: StoryUnpack
    note: string | null
    comments: PullComment[] | null
}> => {
    const read = await readPullComments({ gh, ref })
    const listing = commentsArgs(ref).join(' ')
    const mineOnly: Gh = async (call) => {
        const joined = call.args.join(' ')
        if (joined === listing) {
            if (!read.ok) return { ok: false, stdout: '', stderr: read.stderr }
            const mine = read.comments
                .filter(({ author }) => isSignedIn({ author, login }))
                .map(({ id, body }) => ({ id, body }))
            return { ok: true, stdout: JSON.stringify([mine]), stderr: '' }
        }
        if (login !== null && joined === 'api user --jq .login') {
            return { ok: true, stdout: `${login}\n`, stderr: '' }
        }
        return gh(call)
    }
    const { found } = await findStory({
        gh: mineOnly,
        stories_dir,
        repo: ref.repo,
        pr_number: ref.number,
    })
    const comments = read.ok ? read.comments : null
    const others = [
        ...new Set(
            (comments ?? [])
                .filter(
                    ({ author, body }) =>
                        !isSignedIn({ author, login }) &&
                        isStoryComment({ body })
                )
                .map(({ author }) => author ?? 'ghost')
        ),
    ]
    return {
        found,
        note:
            others.length === 0
                ? null
                : `There is a story on #${ref.number} by ${others.join(', ')}, not by you, so it is not used.`,
        comments,
    }
}
