/**
 * What the scheduler knows of an action: its key, its step's name, its
 * ticket and role, and which actions wait, run slow, or use the run branch.
 */
import has from 'lodash/has'
import partition from 'lodash/partition'

import type { EngineAction } from './decide'
import { isFinalReviewAction } from './decide-final-review'

import type { JournalRecord } from '../journal/journal-record'
import { crashesAfter, type CrashCounts } from '../journal/step-records'

/**
 * The ticket an action works on, or `null` for a run-level action. The
 * plan's actions are the whole run's, whichever ticket hit the limit; a
 * ticket's usage record is that ticket's. Reading and taking replies is
 * the run's too (see `keyOf`).
 */
export const ticketOf = (action: EngineAction): number | null => {
    switch (action.type) {
        case 'start_limit_wait':
        case 'wait_for_limit':
        case 'stop_for_billing':
        case 'wait_for_reply':
        case 'take_reply':
        case 'ignore_reply':
            return null
        case 'record_usage':
            return action.usage.ticket
        default:
            return 'ticket' in action && typeof action.ticket === 'number'
                ? action.ticket
                : null
    }
}

/**
 * Replies are read and taken beside the other steps, one at a time, under
 * their own key: waiting for a reply never holds a ticket up.
 */
const REPLY_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'wait_for_reply',
    'take_reply',
    'ignore_reply',
])

/**
 * The scheduler's key for an action: at most one action per key runs at a
 * time. Reading and taking replies has its own (`replies`). Each lens has
 * its own (`lens:<lens>`), so the five lenses review at once; the final review's other steps share `final`; a ticket's steps its
 * number; and the run's own steps `run`, which only ever run alone.
 */
export const keyOf = (action: EngineAction): string => {
    if (REPLY_ACTIONS.has(action.type)) return 'replies'
    // A search waits under the key of the step it comes before: its
    // ticket's, the final review's, or (the run's start) the run's.
    if (action.type === 'recall_memories') {
        if (action.ticket !== null) return String(action.ticket)
        return action.point === 'run_start' ? 'run' : 'final'
    }
    if (action.type === 'launch_lens') return `lens:${action.lens}`
    if (isFinalReviewAction(action)) return 'final'
    const ticket = ticketOf(action)
    return ticket === null ? 'run' : String(ticket)
}

/** Actions that are an agent's turn: their step names the role. */
const AGENT_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'launch_agent',
    'follow_up_agent',
    'launch_lens',
    'launch_final_fixer',
    'follow_up_final_fixer',
])

/** The agent role of an agent's turn (the learner's is `learner`), else `null`. */
export const agentRoleOf = (action: EngineAction): string | null => {
    if (action.type === 'launch_learner') return 'learner'
    return AGENT_ACTIONS.has(action.type) &&
        'role' in action &&
        action.role !== null
        ? action.role
        : null
}

/**
 * A step's name in the journal: its action type, plus `:<role>` for an
 * agent's turn, such as `follow_up_agent:implementer`.
 *
 * @example
 * stepOf({ type: 'run_gates', ticket: 11, target: 'ticket' }) // 'run_gates'
 */
export const stepOf = (action: EngineAction): string => {
    const role = agentRoleOf(action)
    return role === null ? action.type : `${action.type}:${role}`
}

/**
 * Waits get no step records: a crash during one is no step's fault, and a
 * restarted engine just waits again (a limit wait until the same time).
 */
export const WAIT_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'wait_for_reply',
    'wait_for_limit',
    'wait_for_usage_line',
    'wait_for_repo',
])

/**
 * Steps that can run for minutes: installs, test runs, and agents' turns.
 * The board hears of them as they start, so a run never looks frozen.
 */
export const SLOW_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    ...AGENT_ACTIONS,
    'launch_learner',
    'install_dependencies',
    'run_baseline_tests',
    'run_red_check',
    'check_already_done',
    'run_gates',
    'run_final_gates',
    'run_final_slow_tests',
])

/**
 * Actions that read or move the run branch. At most one runs at a time, so
 * joins, their gates, pushes, and new worktrees see one run branch. The
 * final review's fixers, gates, slow tests (#563), commit, and push work in
 * the run branch's worktree; its lenses only read it. Nothing writes there
 * while a lens runs, though: its after-turn guard judges that worktree, so
 * the slow tests wait for round 1's lenses (see `decideFinalReview`).
 */
export const usesRunBranch = (action: EngineAction): boolean => {
    switch (action.type) {
        case 'create_ticket_worktree':
        case 'join_run_branch':
        case 'push_run_branch':
        case 'rebase_ticket':
        case 'start_final_review':
        case 'launch_final_fixer':
        case 'follow_up_final_fixer':
        case 'run_final_gates':
        case 'run_final_slow_tests':
        case 'commit_final_fix':
        case 'push_final_fixes':
        case 'write_changeset':
        case 'ship_final_review':
        case 'undo_join':
        case 'retry_ticket':
            return true
        case 'run_gates':
        case 'install_dependencies':
            return action.target === 'run_branch'
        // It puts back a run branch a join crashes cut off too often left.
        case 'mark_stuck':
            return action.reason === 'crashed'
        default:
            return false
    }
}

/** The crash counts per key, from the journal's records. */
export const crashesIn = (records: JournalRecord[]): CrashCounts =>
    records.reduce<CrashCounts>(
        (crashes, record) => crashesAfter({ crashes, record }),
        {}
    )

/**
 * The actions on keys a crash cut a step off first, in their order, then
 * the rest: a step a crash cut off (or the stop for it) starts before any
 * other, so a half-done change to the run branch, such as a join, is put
 * right before another step reads the run branch.
 */
export const redosFirst = ({
    actions,
    crashes,
}: {
    actions: EngineAction[]
    crashes: CrashCounts
}): EngineAction[] => {
    const [redos, rest] = partition(actions, (action) =>
        has(crashes, keyOf(action))
    )
    return [...redos, ...rest]
}

/** The session a follow-up goes to, if the action is one. */
export const followUpSessionOf = (action: EngineAction): string[] =>
    action.type === 'follow_up_agent' || action.type === 'follow_up_final_fixer'
        ? [action.session_id]
        : []
