import { z } from 'zod'

import {
    packStory,
    planCommentSync,
    unpackStory,
    type StoryUnpack,
} from './story-comments'
import type { Story } from './story-schema'

/**
 * A story's shared home on GitHub (#738): its comments on the PR and the
 * `review-ready` label. Everything goes through the `gh` command, given
 * as an adapter so tests never reach GitHub.
 */

/** The label a PR carries while its story matches its head commit. */
export const REVIEW_READY_LABEL = 'review-ready'

const LABEL_DESCRIPTION = 'Has an up-to-date review story (/luca-pr-prep)'

/** One `gh` call: its arguments, and text for its stdin, if any. */
export type Gh = (call: {
    args: string[]
    input?: string
}) => Promise<{ ok: boolean; stdout: string; stderr: string }>

/** Where a PR is. */
export type PrRef = { repo: string; pr_number: number }

const CommentPagesSchema = z.array(
    z.array(z.object({ id: z.number().int(), body: z.string().nullable() }))
)

const PrViewSchema = z.object({
    headRefOid: z.string(),
    state: z.string(),
    labels: z.array(z.object({ name: z.string() })),
})

/** Thrown when `gh` fails; the message says which call and why. */
const fail = ({ what, stderr }: { what: string; stderr: string }): never => {
    throw new Error(`${what}: ${stderr.trim() || 'gh failed'}`)
}

/** The PR's head commit, state, and labels, right now. */
export const prNow = async ({
    gh,
    repo,
    pr_number,
}: PrRef & { gh: Gh }): Promise<{
    head_sha: string
    state: string
    labels: string[]
}> => {
    const view = await gh({
        args: [
            'pr',
            'view',
            String(pr_number),
            '--repo',
            repo,
            '--json',
            'headRefOid,state,labels',
        ],
    })
    if (!view.ok)
        fail({ what: `reading PR #${pr_number}`, stderr: view.stderr })
    const pr = PrViewSchema.parse(JSON.parse(view.stdout))
    return {
        head_sha: pr.headRefOid,
        state: pr.state,
        labels: pr.labels.map(({ name }) => name),
    }
}

/** Every comment on the PR's conversation, oldest first. */
const prComments = async ({
    gh,
    repo,
    pr_number,
}: PrRef & { gh: Gh }): Promise<{ comment_id: number; body: string }[]> => {
    const listed = await gh({
        args: [
            'api',
            `repos/${repo}/issues/${pr_number}/comments?per_page=100`,
            '--paginate',
            '--slurp',
        ],
    })
    if (!listed.ok) {
        fail({
            what: `reading the comments of #${pr_number}`,
            stderr: listed.stderr,
        })
    }
    return CommentPagesSchema.parse(JSON.parse(listed.stdout))
        .flat()
        .map(({ id, body }) => ({ comment_id: id, body: body ?? '' }))
}

/** The story in the PR's comments, if any. */
export const loadSharedStory = async ({
    gh,
    repo,
    pr_number,
}: PrRef & { gh: Gh }): Promise<StoryUnpack> =>
    unpackStory({
        bodies: (await prComments({ gh, repo, pr_number })).map(
            ({ body }) => body
        ),
    })

/**
 * Posts a story on its PR: rewrites the story comments that are there,
 * adds the ones that are missing, and deletes the ones left over. Other
 * comments are never touched.
 *
 * @returns How many comments were updated, created, and deleted.
 */
export const postSharedStory = async ({
    gh,
    story,
}: {
    gh: Gh
    story: Story
}): Promise<{ updated: number; created: number; deleted: number }> => {
    const { repo, pr_number } = story
    const actions = planCommentSync({
        existing: await prComments({ gh, repo, pr_number }),
        bodies: packStory({ story }),
    })
    for (const step of actions) {
        const done =
            step.action === 'delete'
                ? await gh({
                      args: [
                          'api',
                          '-X',
                          'DELETE',
                          `repos/${repo}/issues/comments/${step.comment_id}`,
                      ],
                  })
                : await gh({
                      args:
                          step.action === 'update'
                              ? [
                                    'api',
                                    '-X',
                                    'PATCH',
                                    `repos/${repo}/issues/comments/${step.comment_id}`,
                                    '--input',
                                    '-',
                                ]
                              : [
                                    'api',
                                    '-X',
                                    'POST',
                                    `repos/${repo}/issues/${pr_number}/comments`,
                                    '--input',
                                    '-',
                                ],
                      input: JSON.stringify({ body: step.body }),
                  })
        if (!done.ok) {
            fail({
                what: `${step.action} of a story comment`,
                stderr: done.stderr,
            })
        }
    }
    const count = (action: string) =>
        actions.filter((step) => step.action === action).length
    return {
        updated: count('update'),
        created: count('create'),
        deleted: count('delete'),
    }
}

/** Adds `review-ready` to the PR, making the label first if the repo lacks it. */
export const addReadyLabel = async ({
    gh,
    repo,
    pr_number,
}: PrRef & { gh: Gh }): Promise<void> => {
    const add = () =>
        gh({
            args: [
                'pr',
                'edit',
                String(pr_number),
                '--repo',
                repo,
                '--add-label',
                REVIEW_READY_LABEL,
            ],
        })
    if ((await add()).ok) return
    await gh({
        args: [
            'label',
            'create',
            REVIEW_READY_LABEL,
            '--repo',
            repo,
            '--description',
            LABEL_DESCRIPTION,
            '--color',
            '0E8A16',
        ],
    })
    const again = await add()
    if (!again.ok) {
        fail({
            what: `adding the ${REVIEW_READY_LABEL} label`,
            stderr: again.stderr,
        })
    }
}

/** Takes `review-ready` off the PR. Fine when it wasn't there. */
export const removeReadyLabel = async ({
    gh,
    repo,
    pr_number,
}: PrRef & { gh: Gh }): Promise<void> => {
    await gh({
        args: [
            'api',
            '-X',
            'DELETE',
            `repos/${repo}/issues/${pr_number}/labels/${REVIEW_READY_LABEL}`,
        ],
    })
}

/**
 * Which home a story for this repo goes to when no flag says: `shared`
 * when the repo belongs to the signed-in GitHub user's own account,
 * `private` for every other repo (an organization's, a stranger's), and
 * when `gh` can't say who is signed in.
 */
export const defaultStoryHome = async ({
    gh,
    repo,
}: {
    gh: Gh
    repo: string
}): Promise<{ home: 'shared' | 'private'; why: string }> => {
    const owner = repo.split('/')[0] ?? ''
    const user = await gh({ args: ['api', 'user', '--jq', '.login'] })
    const login = user.stdout.trim()
    if (!user.ok || login === '') {
        return { home: 'private', why: 'gh could not say who is signed in' }
    }
    return owner.toLowerCase() === login.toLowerCase()
        ? { home: 'shared', why: `${repo} belongs to ${login}` }
        : { home: 'private', why: `${repo} does not belong to ${login}` }
}
