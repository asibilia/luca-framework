import compact from 'lodash/compact'
import max from 'lodash/max'

import type { AgentRole } from '../agents/role-results'
import type { ReplyProblem, StuckReason } from '../journal/journal-record'
import type {
    FinalReviewState,
    ReplayedStuck,
    ReplayedWorktree,
    TicketProgress,
} from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

/** Longest error text a comment or prompt quotes. */
const DETAIL_MAX = 3000

/** Why a ticket is stuck, in one line. */
const REASON_LINES: Record<StuckReason, string> = {
    agent_failed: 'An agent failed on every try it had.',
    red_check_failed:
        "The red check still fails: the new tests don't fail the way they should.",
    nothing_new_to_test: 'The test-writer found nothing new to test.',
    leftovers_found:
        'The leftover scan found files that must not be committed.',
    gates_failed: 'The checks still fail.',
    bad_test:
        'The implementer sent a test back as bad, and it cannot go back again.',
    changes_requested: 'The ticket review still asks for changes.',
    join_failed: 'The ticket still clashes with the run branch.',
    join_gates_failed:
        'The checks still fail once the ticket joins the run branch.',
    install_failed: 'Installing the dependencies failed.',
    setup_change_needed:
        'An agent needs a test setup file changed, and only you may change one.',
    crashed: 'The engine crashed in the same step, again and again.',
}

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
            return `If the ticket changes no behavior, add the \`${REFACTOR_LABEL}\` label, then reply ${retry}. Otherwise say in the ticket what should change.`
        case 'leftovers_found':
            return `Delete those files in the worktree (or move them out of it), then reply ${retry}.`
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
        case 'setup_change_needed':
            return `Make that change yourself in the worktree, then reply ${retry}.`
        case 'crashed':
            return `Read the engine's log for why it crashed, fix what trips it, then reply ${retry} to take the step again with a fresh agent.`
    }
}

/** A code fence longer than any run of backticks in `text`. */
const fenced = (text: string): string => {
    const longest = max((text.match(/`+/g) ?? []).map(({ length }) => length))
    const fence = '`'.repeat(Math.max(3, (longest ?? 0) + 1))
    const clipped =
        text.length > DETAIL_MAX
            ? `${text.slice(0, DETAIL_MAX)}\n... (clipped)`
            : text
    return `${fence}\n${clipped}\n${fence}`
}

const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`

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

/** Why the final review is stuck, in one line, where it differs from a ticket. */
const FINAL_REASON_LINES: Partial<Record<StuckReason, string>> = {
    changes_requested: 'The final review still asks for changes.',
    gates_failed: "The checks still fail after the final review's fixes.",
    bad_test:
        "While fixing the final review's findings, the implementer sent a test back as bad.",
    agent_failed: 'A final review agent failed on every try it had.',
    crashed:
        'The engine crashed in the same final review step, again and again.',
}

/** What the owner could do about the stuck final review, per reason. */
const finalSuggestion = ({ reason }: { reason: StuckReason }): string => {
    switch (reason) {
        case 'changes_requested':
            return "Fix the open findings in the run branch's worktree, then reply `retry`; or reply `ship` if they can wait for review in the PR."
        case 'leftovers_found':
            return "Delete those files in the run branch's worktree, then reply `retry`."
        default:
            return "Read the last error, fix what trips it in the run branch's worktree, then reply `retry`; or reply `ship` to open the PR anyway."
    }
}

/**
 * The comment on the spec issue when the final review is stuck: why (one
 * line), what was tried, the last error, a suggestion, and the replies:
 * `retry`, `stop`, and `ship` (never `skip`).
 *
 * @example
 * finalStuckComment({ review, run_branch })
 * // '**The final review is stuck**\n\nWhy: The final review still asks for changes. ...'
 */
export const finalStuckComment = ({
    review,
    run_branch,
}: {
    review: FinalReviewState
    run_branch: ReplayedWorktree
}): string => {
    const stuck = review.stuck ?? { reason: 'agent_failed', detail: '' }
    const tries = Object.entries(review.failed_tries).flatMap(
        ([role, count]) =>
            count === undefined || count === 0
                ? []
                : [`${plural(count, 'failed try')} by the ${role}`]
    )
    const tried = compact([
        review.round > 1 && plural(review.round - 1, 'fix round'),
        review.gate_fix_rounds > 0 &&
            `${plural(review.gate_fix_rounds, 'fix round')} on the checks`,
        ...tries,
    ])
    return [
        '**The final review is stuck**',
        [
            `Why: ${FINAL_REASON_LINES[stuck.reason] ?? reasonLine({ reason: stuck.reason })}`,
            `Tried: ${tried.length === 0 ? 'Nothing more: another try would fail the same way.' : `${tried.join(', ')}.`}`,
            `Suggestion: ${finalSuggestion({ reason: stuck.reason })}`,
            `Run branch worktree: \`${run_branch.path}\` (a \`retry\` keeps your edits there)`,
        ].join('\n'),
        `Last error:\n\n${fenced(stuck.detail)}`,
        [
            'Reply with one word on this issue:',
            '- `retry`: fix the open findings again with fresh agents and fresh counts, keeping your edits.',
            '- `ship`: open the PR anyway, with the open findings listed at the top.',
            '- `stop`: end the run without a PR. The branch is kept.',
            '',
            'Only the spec owner counts.',
        ].join('\n'),
    ].join('\n\n')
}

/** A token count with thousands separators, such as `50,000`. */
const tokensText = (tokens: number): string =>
    String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * Why the run is stuck on its budget, in one line.
 *
 * @example
 * runBudgetDetail({ tokens: 50_100, budget: 50_000 })
 * // 'The run used 50,100 tokens of its run budget of 50,000.'
 */
export const runBudgetDetail = ({
    tokens,
    budget,
}: {
    tokens: number
    budget: number
}): string =>
    `The run used ${tokensText(tokens)} tokens of its run budget of ${tokensText(budget)}.`

/**
 * The comment on the spec issue when the whole run is stuck on its run
 * budget: why, how big one budget is, and the replies `retry` and `stop`
 * (never `skip` or `ship`).
 *
 * @example
 * runStuckComment({ detail, budget: 9_000_000 })
 * // '**The run is stuck: it used up its run budget**\n\nWhy: ...'
 */
export const runStuckComment = ({
    detail,
    budget,
}: {
    detail: string
    /** One full run budget. */
    budget: number
}): string =>
    [
        '**The run is stuck: it used up its run budget**',
        [
            `Why: ${detail}`,
            `One run budget is ${tokensText(budget)} tokens (input, output, and cache writes; cache reads don't count). A repo changes it with \`run_budget_tokens\` in \`.luca/config.json\`.`,
            'Nothing new starts until you reply. Other stuck work waits for its reply until the run carries on.',
        ].join('\n'),
        [
            'Reply with one word on this issue:',
            `- \`retry\`: add one more full run budget (${tokensText(budget)} tokens) and carry on where it stopped.`,
            '- `stop`: end the run without a PR. The branch is kept.',
            '',
            'Only the spec owner counts.',
        ].join('\n'),
    ].join('\n\n')

/**
 * The detail of a ticket stuck on a test setup file change: the file, why,
 * and what to do.
 */
export const setupChangeDetail = ({
    role,
    file,
    reason,
    setup_files,
}: {
    role: AgentRole
    file: string
    reason: string
    /** The config's test setup files. */
    setup_files: string[]
}): string =>
    `The ${role} needs the test setup file \`${file || 'unnamed'}\` changed: ${reason || 'no reason given'}\n` +
    `Agents may never change a test setup file${setup_files.length > 0 ? ` (${setup_files.join(', ')})` : ''}. Make the change yourself in the ticket's worktree, then reply retry.`

/** The comment a skipped ticket gets on its own issue. */
export const skipComment = ({
    spec_number,
    because,
    stuck,
}: {
    spec_number: number
    because: number | null
    stuck: ReplayedStuck | null
}): string =>
    because === null
        ? `Luca left this ticket out of the run for spec #${spec_number}: it got stuck (${stuck === null ? 'no reason recorded' : reasonLine({ reason: stuck.reason })}) and the spec's owner replied \`skip\`. It stays open for a later run.`
        : `Luca left this ticket out of the run for spec #${spec_number}: it waits on #${because}, which was skipped. It stays open for a later run.`

/** What the engine answers a reply it can't use. */
export const replyAnswer = ({
    problem,
    named,
    stuck,
}: {
    problem: ReplyProblem
    /** The ticket the reply named, if any. */
    named: number | null
    /** The tickets waiting for a reply now. */
    stuck: number[]
}): string => {
    const list = stuck.map((number) => `#${number}`).join(', ')
    switch (problem) {
        case 'no_ticket_named':
            return `More than one ticket is stuck (${list}), so name the one you mean, such as \`retry #${stuck[0]}\` or \`skip #${stuck[0]}\`.`
        case 'not_stuck':
            return `#${named} is not stuck, so there is nothing to retry or skip. Stuck now: ${list || 'nothing'}.`
        case 'nothing_stuck':
            return 'Nothing is stuck right now, so there is nothing to retry or skip.'
        case 'ship_needs_final_review':
            return '`ship` is only for a stuck final review. For a stuck ticket, reply `retry #n`, `skip #n`, or `stop`.'
        case 'skip_not_for_final_review':
            return "The final review can't be skipped. Reply `retry`, `stop`, or `ship` (opens the PR with the open findings listed at the top)."
    }
}

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
