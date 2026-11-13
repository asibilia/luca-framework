import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { diffFiles } from './diff-hunks'
import type { Feedback } from './feedback'
import type { PullRequestRef } from './pull-request-ref'
import { swapLabels } from './review-labels'
import { planReview, type ReadLines, type ReviewPlan } from './review-plan'
import {
    REVIEW_RECORD_MARKER,
    reviewRecordLine,
    saveReviewRecord,
    type ReviewRecord,
} from './review-record'
import type { WalkGit, WalkHost } from './walk-host'

import type { Gh } from '../../engine/src/story/story-github'

/**
 * `Send the review` (#752, section 11): every draft as one GitHub review
 * with the owner's verdict, posted as a pending review, filled, submitted,
 * and then, on the owner's own pull request, the verdict label.
 */

type Event = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'

type Verdict = {
    label: string
    /** The event on someone else's pull request. */
    event: Event
    /** The label it sets on the owner's own pull request, and the one it takes off. */
    labels: { add: string; remove: string } | null
}

const VERDICTS: Verdict[] = [
    {
        label: 'Signed off',
        event: 'APPROVE',
        labels: { add: 'signed-off', remove: 'changes-wanted' },
    },
    {
        label: 'Changes wanted',
        event: 'REQUEST_CHANGES',
        labels: { add: 'changes-wanted', remove: 'signed-off' },
    },
    { label: 'Just comments', event: 'COMMENT', labels: null },
]

const ReviewListSchema = z.array(
    z.array(
        z.object({
            id: z.number().int(),
            user: z.object({ login: z.string() }).nullable(),
            state: z.string(),
            body: z.string().nullable(),
        })
    )
)

const CreatedSchema = z.object({ id: z.number().int(), node_id: z.string() })

const ADD_FILE_THREAD = `mutation($pullRequestReviewId: ID!, $path: String!, $body: String!) {
  addPullRequestReviewThread(input: { pullRequestReviewId: $pullRequestReviewId, path: $path, body: $body, subjectType: FILE }) { thread { id } }
}`

/** Thrown for a step that failed: its text is gh's error. */
const failure = (ran: { stderr: string }) =>
    new Error(ran.stderr.trim() || 'gh failed')

const parsed = <T>(schema: z.ZodType<T>, stdout: string): T => {
    try {
        return schema.parse(JSON.parse(stdout))
    } catch {
        throw new Error(`gh answered something else: ${stdout.trim()}`)
    }
}

const outsideNote = (outside: number) =>
    outside === 0
        ? ''
        : outside === 1
          ? ' 1 comment was outside the diff, so it was posted as quoted text.'
          : ` ${outside} comments were outside the diff, so they were posted as quoted text.`

/**
 * Asks for the verdict and sends the review of `ref` at `head_sha`.
 *
 * @param story_base_sha - The story's base; null to read the merge base
 *   of `origin/<base_ref>` and the head.
 */
export const sendReview = async ({
    host,
    gh,
    git,
    walk_dir,
    ref,
    checkout,
    feedback,
    author,
    base_ref,
    head_sha,
    story_base_sha,
}: {
    host: WalkHost
    gh: Gh
    git: WalkGit
    /** Where the review record is kept after the send. */
    walk_dir: string
    ref: PullRequestRef
    checkout: string
    feedback: Feedback
    author: string
    base_ref: string
    head_sha: string
    story_base_sha: string | null
}): Promise<void> => {
    const verdict = await host.pick({
        placeholder: 'Your verdict',
        items: VERDICTS,
    })
    if (verdict === null) return
    const error = (text: string) => host.showMessage({ kind: 'error', text })
    const reviews = `repos/${ref.repo}/pulls/${ref.number}/reviews`
    const json = (args: string[], body: unknown) =>
        gh({ args: [...args, '--input', '-'], input: JSON.stringify(body) })
    const comments = feedback.comments()
    const record: ReviewRecord = {
        schema_version: 1,
        commit: head_sha,
        approved_files: feedback.approvedFiles(),
    }
    /** The pending review this send made, to delete when the send fails. */
    const made_review: { id: number | null } = { id: null }

    /** Posts the review; null when one the owner started on GitHub is in the way. */
    const post = async (): Promise<{
        plan: ReviewPlan
        own: boolean
    } | null> => {
        const user = await gh({ args: ['api', 'user', '--jq', '.login'] })
        if (!user.ok) throw failure(user)
        const login = user.stdout.trim()

        let base_sha = story_base_sha
        if (base_sha === null) {
            const merged = await git({
                args: ['merge-base', `origin/${base_ref}`, head_sha],
                cwd: checkout,
            })
            if (!merged.ok) throw failure(merged)
            base_sha = merged.stdout.trim()
        }
        const diff = await git({
            args: [
                'diff',
                '--no-color',
                '--no-ext-diff',
                '-M',
                '-U3',
                base_sha,
                head_sha,
            ],
            cwd: checkout,
        })
        if (!diff.ok) throw failure(diff)

        const listed = await gh({
            args: ['api', `${reviews}?per_page=100`, '--paginate', '--slurp'],
        })
        if (!listed.ok) throw failure(listed)
        const pending = parsed(ReviewListSchema, listed.stdout)
            .flat()
            .filter(
                (review) =>
                    review.state === 'PENDING' && review.user?.login === login
            )
        const ours = (body: string | null) =>
            (body ?? '').includes(REVIEW_RECORD_MARKER)
        if (pending.some((review) => !ours(review.body))) return null
        for (const left of pending) {
            const deleted = await gh({
                args: ['api', '-X', 'DELETE', `${reviews}/${left.id}`],
            })
            if (!deleted.ok) throw failure(deleted)
        }

        const commit = base_sha
        const readLines: ReadLines = async ({
            path,
            side,
            start_line,
            end_line,
        }) => {
            let text = ''
            if (side === 'head') {
                text = await readFile(join(checkout, path), 'utf8').catch(
                    () => ''
                )
            } else {
                const shown = await git({
                    args: ['show', `${commit}:${path}`],
                    cwd: checkout,
                })
                text = shown.ok ? shown.stdout : ''
            }
            return text.split('\n').slice(start_line - 1, end_line)
        }
        const plan = (quote_all: boolean) =>
            planReview({
                comments,
                files: diffFiles({ output: diff.stdout }),
                repo: ref.repo,
                head_sha,
                base_sha: commit,
                record_line: reviewRecordLine({ record }),
                quote_all,
                readLines,
            })
        const create = (made: ReviewPlan) =>
            json(['api', '-X', 'POST', reviews], {
                commit_id: head_sha,
                body: made.body,
                comments: made.comments,
            })

        let made = await plan(false)
        let created = await create(made)
        if (
            !created.ok &&
            created.stderr.includes('HTTP 422') &&
            made.comments.length > 0
        ) {
            made = await plan(true)
            created = await create(made)
        }
        if (!created.ok) throw failure(created)
        const { id, node_id } = parsed(CreatedSchema, created.stdout)
        made_review.id = id

        for (const thread of made.file_threads) {
            const added = await json(['api', 'graphql'], {
                query: ADD_FILE_THREAD,
                variables: {
                    pullRequestReviewId: node_id,
                    path: thread.path,
                    body: thread.body,
                },
            })
            if (!added.ok) throw failure(added)
        }
        // GitHub won't let the owner approve their own pull request: the
        // verdict goes on a label instead.
        const own = author === login
        const submitted = await json(
            ['api', '-X', 'POST', `${reviews}/${id}/events`],
            { event: own ? 'COMMENT' : verdict.event }
        )
        if (!submitted.ok) throw failure(submitted)
        return { plan: made, own }
    }

    let sent: { plan: ReviewPlan; own: boolean } | null
    try {
        sent = await post()
    } catch (thrown) {
        if (made_review.id !== null) {
            await gh({
                args: ['api', '-X', 'DELETE', `${reviews}/${made_review.id}`],
            })
        }
        const text = thrown instanceof Error ? thrown.message : String(thrown)
        await error(
            `The review was not sent: ${text}. Your comments are still saved.`
        )
        return
    }
    if (sent === null) {
        await error(
            `You have a review on #${ref.number} that you started on GitHub and did not send. Send or delete it on GitHub, then try again.`
        )
        return
    }
    await feedback.clearSent({ ids: comments.map(({ id }) => id) })
    // The review's text holds the record too, so a failed write loses nothing.
    await saveReviewRecord({ walk_dir, ref, record }).catch(() => undefined)
    if (sent.own && verdict.labels !== null) {
        const refused = await swapLabels({
            gh,
            repo: ref.repo,
            number: ref.number,
            ...verdict.labels,
        })
        if (refused !== null) {
            await error(
                `The review was sent, but the labels were not changed: ${refused}.`
            )
            return
        }
    }
    await host.showMessage({
        kind: 'info',
        text: `Review sent to #${ref.number}.${outsideNote(sent.plan.outside)}`,
    })
}
