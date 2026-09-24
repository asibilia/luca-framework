import sortBy from 'lodash/sortBy'

import type { StuckAction } from './decide-stuck'
import { need, ticketWorktree, type BuildContext } from './execute-build'

import { checkIntake } from '../intake/intake-checks'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { Journal } from '../journal/journal'
import { replayRun } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import type { Tracker, TrackerIssue } from '../tracker/tracker'

/**
 * How long the engine waits between reads of the spec issue while stuck
 * work waits for a reply: 1 minute.
 */
export const REPLY_POLL_MS = 60_000

/** Whether the owner changed a ticket's text or labels since its snapshot. */
export const ticketChanged = ({
    snapshot,
    issue,
}: {
    snapshot: TicketSnapshot
    issue: TrackerIssue
}): boolean =>
    issue.title !== snapshot.title ||
    issue.body !== snapshot.body ||
    sortBy(issue.labels).join('\n') !== sortBy(snapshot.labels).join('\n')

/**
 * Carries out the tracker steps of stuck work, then journals what happened:
 * telling the spec issue a ticket is stuck, waiting for and reading its
 * comments, taking or sending back a reply, and skipping a ticket (with a
 * comment on it).
 */
export const executeStuckAction = async ({
    action,
    journal,
    tracker,
    clock,
    reply_poll_ms,
}: {
    action: Exclude<StuckAction, { type: 'undo_join' | 'retry_ticket' }>
    journal: Journal
    tracker: Tracker
    clock: EngineClock
    /** Defaults to `REPLY_POLL_MS`. */
    reply_poll_ms?: number
}): Promise<void> => {
    switch (action.type) {
        case 'report_stuck': {
            const { id } = await tracker.comment({
                number: action.spec_number,
                body: action.body,
            })
            journal.append({
                kind: 'stuck_reported',
                ticket: action.ticket,
                role: null,
                content: { comment_id: id, body: action.body },
            })
            return
        }
        case 'wait_for_reply': {
            await clock.sleep(reply_poll_ms ?? REPLY_POLL_MS)
            // Read the journal again: the engine may have commented meanwhile.
            const { engine_comments } = replayRun({ records: journal.read() })
            const comments = await tracker.listComments({
                number: action.spec_number,
                since_id: action.since_id,
            })
            for (const { id, author, body } of comments) {
                if (engine_comments.includes(id)) continue
                journal.append({
                    kind: 'comment_read',
                    ticket: null,
                    role: null,
                    content: { comment_id: id, author, body },
                })
            }
            return
        }
        case 'take_reply': {
            const state = replayRun({ records: journal.read() })
            const comment = state.comments.find(
                ({ comment_id }) => comment_id === action.comment_id
            )
            journal.append({
                kind: 'reply_received',
                ticket: action.ticket,
                role: null,
                content: {
                    word: action.word,
                    ticket: action.ticket,
                    comment_id: action.comment_id,
                    author: comment?.author ?? '',
                },
            })
            return
        }
        case 'ignore_reply': {
            const { id } = await tracker.comment({
                number: action.spec_number,
                body: action.answer,
            })
            journal.append({
                kind: 'reply_ignored',
                ticket: null,
                role: null,
                content: {
                    comment_id: action.comment_id,
                    reason: action.reason,
                    answer_id: id,
                },
            })
            return
        }
        case 'skip_ticket':
            await tracker.comment({ number: action.ticket, body: action.body })
            journal.append({
                kind: 'ticket_skipped',
                ticket: action.ticket,
                role: null,
                content: { because: action.because },
            })
            return
    }
}

/**
 * Carries out `retry` on a stuck ticket. It re-reads the ticket: unchanged,
 * the ticket resumes (`ticket_retried` with mode `resume`). With new text or
 * labels, its new copy is checked like at intake; a ready one is journaled
 * as a new `ticket_snapshot`, its worktree is reset to the run branch's
 * tip, and it starts over (`restart`). A copy that isn't ready is refused:
 * the spec issue hears why, and the ticket stays stuck.
 */
export const retryTicket = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<StuckAction, { type: 'retry_ticket' }>
}): Promise<void> => {
    const { state, journal, tracker, git, config } = context
    const number = action.ticket
    const snapshot = need({
        value: state.snapshot?.tickets[number],
        what: `snapshot of #${number}`,
    })
    const refuse = async (problems: string[]) => {
        const { id } = await tracker.comment({
            number: action.spec_number,
            body:
                `Couldn't retry #${number}: its new text or labels aren't ready to build.\n\n` +
                `${problems.map((line) => `- ${line}`).join('\n')}\n\n` +
                `Fix the ticket, then reply \`retry #${number}\` again (or \`skip #${number}\`).`,
        })
        journal.append({
            kind: 'ticket_retried',
            ticket: number,
            role: null,
            content: {
                mode: 'refused',
                base_sha: null,
                problems,
                answer_id: id,
            },
        })
    }
    const issue = await tracker.readIssue({ number })
    if (issue === null) return refuse(['The ticket could not be read.'])
    if (!ticketChanged({ snapshot, issue })) {
        journal.append({
            kind: 'ticket_retried',
            ticket: number,
            role: null,
            content: {
                mode: 'resume',
                base_sha: null,
                problems: [],
                answer_id: null,
            },
        })
        return
    }
    const intake = need({ value: state.intake, what: 'intake_read record' })
    const checked = checkIntake({
        config,
        intake_read: {
            ...intake,
            sub_tickets: intake.sub_tickets.map((ticket) =>
                ticket.number === number ? issue : ticket
            ),
        },
    })
    if (checked.outcome === 'refused') {
        return refuse(checked.problems.flatMap(({ missing }) => missing))
    }
    const fresh =
        checked.outcome === 'passed'
            ? checked.snapshot.tickets.find(
                  (ticket) => ticket.number === number
              )
            : undefined
    if (fresh === undefined) return refuse(['The ticket is no longer open.'])
    const runBranch = need({ value: state.run_branch, what: 'run branch' })
    // A ticket stuck before its worktree was made has nothing to reset.
    const sha =
        (state.tickets[number]?.worktree ?? null) === null
            ? null
            : (
                  await git.resetWorktree({
                      cwd: ticketWorktree({ state, ticket: number }).path,
                      to: await git.head({ cwd: runBranch.path }),
                  })
              ).sha
    journal.append({
        kind: 'ticket_snapshot',
        ticket: number,
        role: null,
        content: fresh,
    })
    journal.append({
        kind: 'ticket_retried',
        ticket: number,
        role: null,
        content: {
            mode: 'restart',
            base_sha: sha,
            problems: [],
            answer_id: null,
        },
    })
}
