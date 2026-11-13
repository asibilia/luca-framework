import { z } from 'zod'

import {
    alreadySent,
    alreadySentNote,
    draftFingerprint,
    verdictAlreadySent,
} from './already-sent'
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
import { sendStopper } from './send-checks'
import {
    readSendProgress,
    saveSendProgress,
    type VerdictKey,
} from './send-progress'
import { isSignedIn, readLogin } from './signed-in'
import type { WalkGit, WalkHost } from './walk-host'

import { isOwnRepo, type Gh } from '../../engine/src/story/story-github'

/**
 * `Send the review` (#752, section 11): every draft as one GitHub review
 * with the owner's verdict, posted as a pending review, filled, submitted,
 * and then, on the owner's own pull request in their own repo, the
 * verdict label. In a repo that isn't the signed-in user's own (#766), no
 * label is touched and no record line is posted: the record, and the send
 * in progress, are kept on this computer. On someone else's pull request,
 * `Just comments` comes first and a real GitHub verdict is confirmed.
 */

type Event = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'

type Verdict = {
    label: string
    /** The verdict as the send in progress keeps it. */
    key: VerdictKey
    /** The event on someone else's pull request. */
    event: Event
    /**
     * The label it sets on the owner's own pull request in their own
     * repo, and the one it takes off.
     */
    labels: { add: string; remove: string } | null
}

const VERDICTS: Verdict[] = [
    {
        label: 'Signed off',
        key: 'signed_off',
        event: 'APPROVE',
        labels: { add: 'signed-off', remove: 'changes-wanted' },
    },
    {
        label: 'Changes wanted',
        key: 'changes_wanted',
        event: 'REQUEST_CHANGES',
        labels: { add: 'changes-wanted', remove: 'signed-off' },
    },
    {
        label: 'Just comments',
        key: 'just_comments',
        event: 'COMMENT',
        labels: null,
    },
]

/** On someone else's pull request, the verdict that posts no verdict comes first. */
const THEIR_VERDICTS: Verdict[] = [
    ...VERDICTS.filter(({ event }) => event === 'COMMENT'),
    ...VERDICTS.filter(({ event }) => event !== 'COMMENT'),
]

/** The modal question before a real GitHub verdict, and its button. */
const confirmOf = ({
    event,
    ref,
}: {
    event: Event
    ref: PullRequestRef
}): { text: string; confirm_label: string } | null =>
    event === 'APPROVE'
        ? {
              text: `Approve #${ref.number} in ${ref.repo} on GitHub?`,
              confirm_label: 'Approve',
          }
        : event === 'REQUEST_CHANGES'
          ? {
                text: `Request changes on #${ref.number} in ${ref.repo} on GitHub?`,
                confirm_label: 'Request changes',
            }
          : null

/**
 * A review's text when it would be empty in a repo that isn't yours (no
 * record line): GitHub may refuse a blank COMMENT or REQUEST_CHANGES.
 */
const NO_TEXT = 'See my comments on the code.'

/** A send's outcome: the drafts it cleared, and the review it posted. */
type Outcome =
    | { kind: 'sent'; plan: ReviewPlan; sent: DraftComment[] }
    /** A review GitHub already took holds the drafts `sent`. */
    | { kind: 'already'; sent: DraftComment[] }
    /** Nothing was posted, for the reason in `text`. */
    | { kind: 'stopped'; text: string }

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
    const error = (text: string) => host.showMessage({ kind: 'error', text })
    const login = await readLogin({ gh })
    if (login === null) {
        await error(
            `The review was not sent: Luca Walk could not read who is signed in to GitHub. Your comments are still saved.`
        )
        return
    }
    const own = isSignedIn({ author, login })
    const your_repo = isOwnRepo({ repo: ref.repo, login })
    const verdict = await host.pick({
        placeholder: 'Your verdict',
        items: own ? VERDICTS : THEIR_VERDICTS,
    })
    if (verdict === null) return
    // GitHub won't let the owner approve their own pull request: the
    // verdict goes on a label instead, in their own repo only.
    const event: Event = own ? 'COMMENT' : verdict.event
    const labels = own && your_repo ? verdict.labels : null
    // A COMMENT review with no comments would look blank. A verdict with
    // none still goes: an approval, or the record and label on the
    // owner's own pull request in their own repo.
    if (
        event === 'COMMENT' &&
        labels === null &&
        feedback.comments().length === 0
    ) {
        await host.showMessage({
            kind: 'info',
            text: `There is nothing to send: you have no comments on #${ref.number}.`,
        })
        return
    }
    const ask = confirmOf({ event, ref })
    if (ask !== null && !(await host.confirm(ask))) return
    const reviews = `repos/${ref.repo}/pulls/${ref.number}/reviews`
    const json = ({ args, body }: { args: string[]; body: unknown }) =>
        gh({ args: [...args, '--input', '-'], input: JSON.stringify(body) })
    const comments = feedback.comments()
    const record: ReviewRecord = {
        schema_version: 1,
        commit: head_sha,
        approved_files: feedback.approvedFiles(),
    }
    const sent_drafts = comments.map((comment) => draftFingerprint({ comment }))
    /** The pending review this send made, to delete when the send fails. */
    const made_review: { id: number | null } = { id: null }

    /**
     * Posts the review, after the signed-in user's own reviews were read
     * and the app's leftover pending ones deleted.
     */
    const post = async (): Promise<ReviewPlan> => {
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
                record_line: your_repo
                    ? reviewRecordLine({ record: { ...record, sent_drafts } })
                    : null,
                empty_text: event === 'APPROVE' ? '' : NO_TEXT,
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
        // The send in progress is kept here before anything is submitted:
        // in a repo that isn't yours the review's text holds no record, and
        // a verdict with no comments has no draft to be found by anywhere.
        await saveSendProgress({
            walk_dir,
            ref,
            send: {
                review_id: id,
                commit: head_sha,
                sent_drafts,
                verdict: verdict.key,
            },
        })

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
        const submitted = await json({
            args: ['api', '-X', 'POST', `${reviews}/${id}/events`],
            body: { event },
        })
        if (!submitted.ok) throw failure(submitted)
        return made
    }

    /**
     * Sends the review (#752, section 11, "How it is posted"): the drafts
     * a review GitHub already took holds, when there is one; stopped when
     * GitHub's head moved, a line comment was written at another head, or
     * a review the owner started on GitHub is in the way. The app's own
     * pending review holds the record line, or, in a repo that isn't
     * yours, is the one the send in progress names.
     */
    const attempt = async (): Promise<Outcome> => {
        const own_reviews = await ownReviews({ gh, ref, login })
        const progress = await readSendProgress({ walk_dir, ref })
        const already = alreadySent({
            comments,
            own_reviews,
            head_sha,
            progress,
        })
        if (already.length > 0) return { kind: 'already', sent: already }
        if (
            comments.length === 0 &&
            verdictAlreadySent({
                verdict: verdict.key,
                own_reviews,
                head_sha,
                progress,
            })
        ) {
            return { kind: 'already', sent: [] }
        }
        const stopper = await sendStopper({ gh, ref, head_sha, comments })
        if (stopper !== null) return { kind: 'stopped', text: stopper }
        const pending = own_reviews.filter(
            (review) => review.state === 'PENDING'
        )
        const ours = (review: { id: number; body: string | null }) =>
            (review.body ?? '').includes(REVIEW_RECORD_MARKER) ||
            progress.some(({ review_id }) => review_id === review.id)
        if (pending.some((review) => !ours(review))) {
            return {
                kind: 'stopped',
                text: `You have a review on #${ref.number} that you started on GitHub and did not send. Send or delete it on GitHub, then try again.`,
            }
        }
        for (const left of pending) {
            const deleted = await gh({
                args: ['api', '-X', 'DELETE', `${reviews}/${left.id}`],
            })
            if (!deleted.ok) throw failure(deleted)
        }
        return { kind: 'sent', plan: await post(), sent: comments }
    }

    let sent: Outcome
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
    if (sent.kind === 'stopped') {
        await error(sent.text)
        return
    }
    await feedback.clearSent({ ids: sent.sent.map(({ id }) => id) })
    // In your repo the review's text holds the record too, so a failed
    // write loses nothing; elsewhere the next visit walks it all again.
    // The send in progress is kept: another window may still hold drafts
    // this send took, and finds them by it.
    await saveReviewRecord({ walk_dir, ref, record }).catch(() => undefined)
    if (labels !== null) {
        const refused = await swapLabels({
            gh,
            repo: ref.repo,
            number: ref.number,
            ...labels,
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
                      sent: sent.sent.length,
                      left: comments.length - sent.sent.length,
                  })
                : `Review sent to #${ref.number}.${outsideNote(sent.plan.outside)}`,
    })
}
