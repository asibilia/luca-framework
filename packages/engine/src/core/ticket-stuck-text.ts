/**
 * The texts about a stuck ticket: why it is stuck, what was tried, the stuck
 * comment with its suggestion, and the retry note in a fresh agent's prompt.
 */
import compact from 'lodash/compact'

import { fenced, plural } from './stuck-format'

import type { StuckReason } from '../journal/journal-record'
import type {
    ReplayedStuck,
    ReplayedWorktree,
    TicketProgress,
} from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

/** Why a ticket is stuck, in one line. */
const REASON_LINES: Record<StuckReason, string> = {
    agent_failed: 'An agent failed on every try it had.',
    red_check_failed:
        "The red check still fails: the new tests don't fail the way they should.",
    nothing_new_to_test:
        'The test-writer says the ticket changes no behavior, so there is nothing new to test: it looks like a refactor.',
    leftovers_found:
        'The leftover scan found files that must not be committed.',
    gates_failed: 'The checks still fail.',
    bad_test:
        'A test was sent back as bad (by the implementer, or because it checks nothing), and it cannot go back again.',
    changes_requested: 'The ticket review still asks for changes.',
    join_failed: 'The ticket still clashes with the run branch.',
    join_gates_failed:
        'The checks still fail once the ticket joins the run branch.',
    install_failed: 'Installing the dependencies failed.',
    prepare_failed:
        "The repo's prepare command failed before any agent worked.",
    setup_change_needed: 'An agent needs a change only you may make.',
    crashed: 'The engine crashed in the same step, again and again.',
    undo_refused:
        'Undoing its join would have rewound the run branch over other work, so the run branch was left alone.',
    environment_failed:
        "An agent says a failure is not the ticket's fault (the machine or another ticket), but the rerun failed the same way, or its reruns ran out.",
}

/**
 * How to keep a flagged doc the repo wants, for a `leftovers_found` stuck
 * (#520); `retry` is the reply that retries it.
 */
export const leftoverAllowHint = ({ retry }: { retry: string }): string =>
    `If one is a doc the repo wants, add a pattern for it to \`leftover_allow\` in the repo's \`.luca/config.json\` instead, resume the run (only a resume reads the config again, a plain \`retry\` doesn't), then reply ${retry}.`

/** What the user could do, per reason; `n` is the ticket. */
const suggestion = ({
    reason,
    n,
}: {
    reason: StuckReason
    n: number
}): string => {
    const retry = `\`retry #${n}\``
    switch (reason) {
        case 'agent_failed':
            return `Read the last error, fix what trips the agent (in the ticket or its worktree), then reply ${retry}.`
        case 'red_check_failed':
            return `Make the ticket's criteria clearer, or fix the tests in the worktree yourself, then reply ${retry}.`
        case 'nothing_new_to_test':
            return `A ticket that changes no behavior is a refactor ticket: add the \`${REFACTOR_LABEL}\` label, then reply ${retry}. It is built again as a refactor, with no new tests.`
        case 'leftovers_found':
            return `Delete those files in the worktree (or move them out of it), then reply ${retry}. ${leftoverAllowHint({ retry })}`
        case 'gates_failed':
            return `Fix the failing check in the worktree, or make the ticket clearer, then reply ${retry}.`
        case 'bad_test':
            return `Fix or remove that test in the worktree, or make the ticket clearer, then reply ${retry}.`
        case 'changes_requested':
            return `Fix the open findings in the worktree, then reply ${retry}; or reply \`skip #${n}\` if they can wait.`
        case 'join_failed':
            return `Reply ${retry} to put it on the run branch's tip again (uncommitted edits in its worktree are replaced), or \`skip #${n}\`.`
        case 'join_gates_failed':
            return `Its join was undone, so the run branch is safe. Reply ${retry} to join again and fix it on top of the run branch, or \`skip #${n}\`.`
        case 'install_failed':
            return `Fix the manifest or lockfile on the base branch, then reply ${retry}.`
        case 'prepare_failed':
            return `Fix what the prepare command needs on this computer (a missing tool, say), or the command in \`.luca/config.json\`, then reply ${retry}. If it ran out of time, raise \`prepare_timeout_ms\` there (30 minutes by default).`
        case 'setup_change_needed':
            return `Make that change yourself in the worktree, then reply ${retry}.`
        case 'crashed':
            return `Read the engine's log for why it crashed, fix what trips it, then reply ${retry} to take the step again with a fresh agent.`
        case 'undo_refused':
            return `Put the run branch back so this ticket's join is on top (or take its join off by hand), then reply ${retry}; or reply \`skip #${n}\`.`
        case 'environment_failed':
            return `Read the agent's evidence and the output. If the machine is at fault (a port in use, another process, a test that fails on the base branch too), fix that, then reply ${retry}. If the ticket's code is at fault, fix it in the worktree or make the ticket clearer, then reply ${retry}; or reply \`skip #${n}\`.`
    }
}

/** What the engine already tried on a ticket, from its counts. */
export const triedText = ({
    progress,
}: {
    progress: TicketProgress
}): string => {
    const tries = Object.entries(progress.failed_tries).flatMap(
        ([role, count]) =>
            count === undefined || count === 0
                ? []
                : [`${plural(count, 'failed try')} by the ${role}`]
    )
    const reviewFixRounds =
        progress.review_fix === null
            ? 0
            : Math.max(0, progress.review_fix.round - 1)
    const parts = compact([
        progress.red_fix_rounds > 0 &&
            `${plural(progress.red_fix_rounds, 'fix round')} on the red check`,
        progress.gate_fix_rounds > 0 &&
            `${plural(progress.gate_fix_rounds, 'fix round')} on the checks`,
        progress.bad_test_bounces > 0 &&
            `${plural(progress.bad_test_bounces, 'bad test')} sent back`,
        reviewFixRounds > 0 && plural(reviewFixRounds, 'review fix round'),
        progress.rejoins > 0 &&
            `${plural(progress.rejoins, 'rebase')} onto the run branch`,
        progress.test_updates > 0 &&
            `${plural(progress.test_updates, 'test update')} after a rebase`,
        progress.engine_failures > 0 &&
            `${plural(progress.engine_failures, 'engine failure')} in a row`,
        ...tries,
    ])
    return parts.length === 0
        ? 'Nothing more: another try would fail the same way.'
        : `${parts.join(', ')}.`
}

/** Why a ticket is stuck, in one line. */
export const reasonLine = ({ reason }: { reason: StuckReason }): string =>
    REASON_LINES[reason]

/**
 * The comment on the spec issue when a ticket is stuck: which ticket, why
 * (one line), what was tried, the last error, a suggestion, and the replies.
 *
 * @example
 * stuckComment({ ticket: 11, title: 'Add sum', progress, stuck })
 * // '**Ticket #11 is stuck: Add sum**\n\nWhy: The checks still fail. ...'
 */
export const stuckComment = ({
    ticket,
    title,
    progress,
    stuck,
    worktree,
}: {
    ticket: number
    title: string
    progress: TicketProgress
    stuck: ReplayedStuck
    worktree: ReplayedWorktree | null
}): string =>
    compact([
        `**Ticket #${ticket} is stuck: ${title}**`,
        [
            `Why: ${reasonLine({ reason: stuck.reason })}`,
            `Tried: ${triedText({ progress })}`,
            `Suggestion: ${suggestion({ reason: stuck.reason, n: ticket })}`,
            worktree === null
                ? ''
                : `Worktree: \`${worktree.path}\` (a \`retry\` keeps your code edits there)`,
        ]
            .filter(Boolean)
            .join('\n'),
        `Last error:\n\n${fenced(stuck.detail)}`,
        [
            'Reply with one word on this issue:',
            `- \`retry #${ticket}\`: pick up where it stopped with a fresh agent, or start it over if you changed the ticket's text or labels.`,
            `- \`skip #${ticket}\`: leave it out, with the tickets that wait on it, and ship the rest. They stay open.`,
            '- `stop`: end the run without a PR. The branch is kept.',
            '',
            'Only the spec owner counts. With one ticket stuck, the bare word works too. Other tickets keep building meanwhile.',
        ].join('\n'),
    ]).join('\n\n')

/**
 * The prompt section for the first fresh agent after a `retry` resumed a
 * stuck ticket: why it got stuck, and to keep the owner's edits.
 */
export const retrySection = ({ retried }: { retried: ReplayedStuck }): string =>
    [
        '## This ticket was retried',
        '',
        `It got stuck (${reasonLine({ reason: retried.reason })}) and the spec's owner replied \`retry\`. You are a fresh agent picking up where it stopped. The owner may have changed files in this worktree: keep their changes.`,
        '',
        'What stopped it:',
        '',
        fenced(retried.detail),
    ].join('\n')
