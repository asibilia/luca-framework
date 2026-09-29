import { join } from 'node:path'

import type { BuildAction } from './decide-build'
import type { BuildContext } from './execute-build'
import { openTicketsNotInRun } from './not-in-run'
import {
    fitPullRequestBody,
    PULL_REQUEST_FILE,
    withNotInRun,
} from './pull-request-text'

import { postCommentOnce } from '../tracker/post-comment-once'
import type { OpenedPullRequest } from '../tracker/tracker'

/** A failed `gh` call's error, as the GitHub tracker words it. */
const GH_FAILED = /\bgh \w+ \w+`? failed\b/

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Opens the run's one pull request, then journals `pull_request_opened`
 * (#508). Its full text (with the spec's open tickets not in the run) is
 * saved first to `pull-request.md` in the run folder, so it's never lost.
 * An open PR from the run branch is reused, never opened twice: the one a
 * try opened before a crash or a failure, or one the owner opened by hand.
 * The body sent keeps under `PULL_REQUEST_BUDGET`, and what doesn't fit
 * is posted as PR comments after it (`fitPullRequestBody`), each once. A
 * failed `gh` call journals the run stuck (`pull_request_failed`) with its
 * error, for the owner's `retry`; any other error is a crash.
 */
export const openPullRequest = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'open_pull_request' }>
}): Promise<void> => {
    const { journal, tracker, state, run_dir, step } = context
    const { head, base, title, body } = action
    // The spec's open tickets not in the run are named in the PR.
    const full = withNotInRun({
        body,
        open: await openTicketsNotInRun({ tracker, state }),
    })
    await Bun.write(join(run_dir, PULL_REQUEST_FILE), full)
    const fitted = fitPullRequestBody({ body: full })
    let opened: OpenedPullRequest
    try {
        opened =
            (await tracker.findOpenPullRequest({ head })) ??
            (await tracker.openPullRequest({
                head,
                base,
                title,
                body: fitted.body,
            }))
    } catch (error) {
        const detail = errorText(error)
        if (!GH_FAILED.test(detail)) throw error
        journal.append({
            kind: 'run_stuck',
            ticket: null,
            role: null,
            content: { reason: 'pull_request_failed', detail },
        })
        return
    }
    for (const [n, comment] of fitted.comments.entries()) {
        await postCommentOnce({
            tracker,
            number: opened.number,
            body: comment,
            step,
            n,
        })
    }
    journal.append({
        kind: 'pull_request_opened',
        ticket: null,
        role: null,
        content: { ...opened, head, base, title, body: full },
    })
}
