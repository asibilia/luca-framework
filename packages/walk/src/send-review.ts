import { z } from 'zod'

import { alreadySent, alreadySentNote, draftFingerprint } from './already-sent'
import { diffFiles } from './diff-hunks'
import type { DraftComment } from './drafts-file'
import type { Feedback } from './feedback'
import type { DiffBase } from './load-pull-request'
import type { PullRequestRef } from './pull-request-ref'
import { swapLabels } from './review-labels'
import { planReview, type ReadLines, type ReviewPlan } from './review-plan'
import {
    ownReviews,
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

/** A send's outcome: the drafts it cleared, and the review it posted. */
type Outcome =
    | { kind: 'sent'; plan: ReviewPlan; sent: DraftComment[]; own: boolean }
    /** A review GitHub already took holds the drafts `sent`. */
    | { kind: 'already'; sent: DraftComment[]; own: boolean }

const CreatedSchema = z.object({ id: z.number().int(), node_id: z.string() })

const ADD_FILE_THREAD = `mutation($pullRequestReviewId: ID!, $path: String!, $body: String!) {
  addPullRequestReviewThread(input: { pullRequestReviewId: $pullRequestReviewId, path: $path, body: $body, subjectType: FILE }) { thread { id } }
}`

/** Thrown for a step that failed: its text is gh's error. */
const failure = (ran: { stderr: string }) =>
    new Error(ran.stderr.trim() || 'gh failed')

const parsed = <T>({
    schema,
    stdout,
}: {
    schema: z.ZodType<T>
    stdout: string
}): T => {
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
 * @param base - The diff's base the drafts were made against: the hunks
 *   are read and the base side quoted at it.
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
    head_sha,
    base,
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
    head_sha: string
    base: DiffBase
}): Promise<void> => {
    const verdict = await host.pick({
        placeholder: 'Your verdict',
        items: VERDICTS,
    })
    if (verdict === null) return
    // A COMMENT review with no comments would look blank. A verdict with
    // none still goes: an approval, or the record and label on the
    // owner's own pull request.
    if (verdict.event === 'COMMENT' && feedback.comments().length === 0) {
        await host.showMessage({
            kind: 'info',
            text: `There is nothing to send: you have no comments on #${ref.number}.`,
        })
        return
    }
    const error = (text: string) => host.showMessage({ kind: 'error', text })
    const reviews = `repos/${ref.repo}/pulls/${ref.number}/reviews`
    const json = ({ args, body }: { args: string[]; body: unknown }) =>
        gh({ args: [...args, '--input', '-'], input: JSON.stringify(body) })
    const comments = feedback.comments()
    const record: ReviewRecord = {
        schema_version: 1,
        commit: head_sha,
        approved_files: feedback.approvedFiles(),
    }
    /** The pending review this send made, to delete when the send fails. */
    const made_review: { id: number | null } = { id: null }

    /**
     * Posts the review, after the signed-in user's own reviews were read
     * and the app's leftover pending ones deleted; `own` when the pull
     * request is the signed-in user's.
     */
    const post = async ({ own }: { own: boolean }): Promise<ReviewPlan> => {
        if (!base.ok) throw new Error(base.error)
        const base_sha = base.sha
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

        // Each side's file as its commit holds it, as GitHub shows it: a
        // symlink reads as its target's name, never the file it points
        // at, which may be outside the checkout.
        const readLines: ReadLines = async ({
            path,
            side,
            start_line,
            end_line,
        }) => {
            const shown = await git({
                args: [
                    'show',
                    `${side === 'head' ? head_sha : base_sha}:${path}`,
                ],
                cwd: checkout,
            })
            const text = shown.ok ? shown.stdout : ''
            return text.split('\n').slice(start_line - 1, end_line)
        }
        const plan = (quote_all: boolean) =>
            planReview({
                comments,
                files: diffFiles({ output: diff.stdout }),
                repo: ref.repo,
                head_sha,
                base_sha,
                record_line: reviewRecordLine({
                    record: {
                        ...record,
                        sent_drafts: comments.map((comment) =>
                            draftFingerprint({ comment })
                        ),
                    },
                }),
                quote_all,
                readLines,
            })
        const create = (made: ReviewPlan) =>
            json({
                args: ['api', '-X', 'POST', reviews],
                body: {
                    commit_id: head_sha,
                    body: made.body,
                    comments: made.comments,
                },
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
        const { id, node_id } = parsed({
            schema: CreatedSchema,
            stdout: created.stdout,
        })
        made_review.id = id

        for (const thread of made.file_threads) {
            const added = await json({
                args: ['api', 'graphql'],
                body: {
                    query: ADD_FILE_THREAD,
                    variables: {
                        pullRequestReviewId: node_id,
                        path: thread.path,
                        body: thread.body,
                    },
                },
            })
            if (!added.ok) throw failure(added)
        }
        // GitHub won't let the owner approve their own pull request: the
        // verdict goes on a label instead.
        const submitted = await json({
            args: ['api', '-X', 'POST', `${reviews}/${id}/events`],
            body: { event: own ? 'COMMENT' : verdict.event },
        })
        if (!submitted.ok) throw failure(submitted)
        return made
    }

    /**
     * Sends the review (#752, section 11, "How it is posted"): the drafts
     * a review GitHub already took holds, when there is one; null when a
     * review the owner started on GitHub is in the way.
     */
    const attempt = async (): Promise<Outcome | null> => {
        const { login, reviews: own_reviews } = await ownReviews({ gh, ref })
        const own = author === login
        const already = alreadySent({ comments, own_reviews, head_sha })
        if (already.length > 0) return { kind: 'already', sent: already, own }
        const pending = own_reviews.filter(
            (review) => review.state === 'PENDING'
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
        return {
            kind: 'sent',
            plan: await post({ own }),
            sent: comments,
            own,
        }
    }

    let sent: Outcome | null
    try {
        sent = await attempt()
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
    await feedback.clearSent({ ids: sent.sent.map(({ id }) => id) })
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
        text:
            sent.kind === 'already'
                ? alreadySentNote({
                      number: ref.number,
                      left: comments.length - sent.sent.length,
                  })
                : `Review sent to #${ref.number}.${outsideNote(sent.plan.outside)}`,
    })
}
