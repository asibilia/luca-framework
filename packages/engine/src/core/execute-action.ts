/**
 * Carries out one action: sends it to the module for its kind of step, or
 * journals it straight away.
 */
import { basename, dirname } from 'node:path'

import type { EngineAction } from './decide'
import { isFinalReviewAction } from './decide-final-review'
import { isMemoryAction } from './decide-memory'
import { executeAlreadyDoneAction } from './execute-already-done'
import {
    buildContext,
    executeBuildAction,
    type BuildDeps,
} from './execute-build'
import { writeChangeset } from './execute-changeset'
import {
    executeFinalReviewAction,
    shipFinalReviewIn,
} from './execute-final-review'
import { readIntake, refuseIntake } from './execute-intake'
import { executeMemoryAction } from './execute-memory'
import { openPullRequest } from './execute-pull-request'
import { executeStuckAction } from './execute-stuck'
import { executePlanAction, executeUsageLineAction } from './execute-waits'

import type { Journal } from '../journal/journal'
import { SYSTEM_CLOCK, type EngineClock } from '../limits/limit-wait'
import {
    DEFAULT_USAGE_LINES,
    LINE_OF,
    type UsageLines,
} from '../limits/usage-line'
import type { MemoryDeps } from '../memory/memory-client'
import type { CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/**
 * Which try of its step an action is: the seq of the step's first try (its
 * first `step_started`), and whether this try redoes one a crash cut off.
 * A redo adopts the side effects its first try left behind: its comments,
 * its PR, its worktrees and commits.
 */
export type StepTry = { first_seq: number; redo: boolean }

/**
 * Carries out one action: talks to the tracker, then records what happened in
 * the journal. The only impure half of the engine; `decide` picks the action.
 *
 * Stop actions (`done`, `invalid_journal`) do nothing here.
 */
export const executeAction = async ({
    action,
    journal,
    tracker,
    build,
    clock,
    reply_poll_ms,
    memory,
    step,
    read_usage_lines,
}: {
    action: EngineAction
    journal: Journal
    tracker: Tracker
    /** Needed for every step after intake. */
    build?: BuildDeps
    /** Limit waits and reply waits sleep by it. Defaults to `SYSTEM_CLOCK`. */
    clock?: EngineClock
    /** How long a reply wait sleeps before it reads the spec issue. */
    reply_poll_ms?: number
    /** The memory client, for a run with memory on (#370). */
    memory?: MemoryDeps
    /**
     * Which try of its step this is, from the scheduler. Left out, it is a
     * first try, numbered after the journal's last record.
     */
    step?: StepTry
    /**
     * Reads the `luca-board` usage lines, again before each nap of a
     * usage-line wait. Left out, the lines never change during a wait.
     */
    read_usage_lines?: () => Promise<UsageLines>
}): Promise<void> => {
    const tried: CommentStep = {
        run_id: basename(dirname(journal.file)),
        ...(step ?? {
            first_seq: (journal.read().at(-1)?.seq ?? 0) + 1,
            redo: false,
        }),
    }
    if (isMemoryAction(action)) {
        return executeMemoryAction({
            action,
            journal,
            tracker,
            memory,
            build,
            step: tried,
        })
    }
    switch (action.type) {
        case 'report_stuck':
        case 'wait_for_reply':
        case 'take_reply':
        case 'ignore_reply':
        case 'skip_ticket':
        case 'report_final_review_stuck':
        case 'retry_final_review':
        case 'mark_run_stuck':
        case 'report_run_stuck':
            return executeStuckAction({
                action,
                journal,
                tracker,
                clock: clock ?? SYSTEM_CLOCK,
                reply_poll_ms,
                step: tried,
            })
        case 'stop_for_crashes':
            journal.append({
                kind: 'run_stopped',
                ticket: null,
                role: null,
                content: {
                    reason: action.reason,
                    role: null,
                    billing: false,
                    crashed: true,
                },
            })
            return
        case 'record_usage':
            journal.append({
                kind: 'usage_recorded',
                ticket: action.usage.ticket,
                role: null,
                content: action.usage,
            })
            return
        case 'start_limit_wait':
        case 'wait_for_limit':
        case 'stop_for_billing':
            return executePlanAction({
                action,
                journal,
                tracker,
                clock: clock ?? SYSTEM_CLOCK,
                step: tried,
            })
        case 'start_usage_line_wait':
        case 'wait_for_usage_line':
            return executeUsageLineAction({
                action,
                journal,
                tracker,
                clock: clock ?? SYSTEM_CLOCK,
                read_usage_lines:
                    read_usage_lines ??
                    (async () => ({
                        ...DEFAULT_USAGE_LINES,
                        [LINE_OF[action.window]]: action.line,
                    })),
                step: tried,
            })
        case 'read_intake':
            return readIntake({
                spec_number: action.spec_number,
                journal,
                tracker,
            })
        case 'refuse_intake':
            return refuseIntake({
                spec_number: action.spec_number,
                problems: action.problems,
                journal,
                tracker,
                step: tried,
            })
        case 'mark_already_done':
        case 'close_ticket':
            return executeAlreadyDoneAction({
                action,
                journal,
                tracker,
                step: tried,
            })
        case 'finish_nothing_to_do':
            journal.append({
                kind: 'nothing_to_do',
                ticket: null,
                role: null,
                content: {
                    closed_tickets: action.closed_tickets,
                    already_done: action.already_done,
                    left_out: action.left_out ?? [],
                },
            })
            return
        case 'snapshot_intake': {
            const { spec, tickets, closed_tickets, left_out } = action.snapshot
            journal.append({
                kind: 'spec_snapshot',
                ticket: spec.number,
                role: null,
                content: {
                    spec,
                    ticket_order: tickets.map((ticket) => ticket.number),
                    closed_tickets,
                    left_out,
                },
            })
            for (const ticket of tickets) {
                journal.append({
                    kind: 'ticket_snapshot',
                    ticket: ticket.number,
                    role: null,
                    content: ticket,
                })
            }
            return
        }
        case 'invalid_journal':
        case 'done':
            return
        default:
            if (build === undefined) {
                throw new Error(
                    `The engine needs a git adapter and an agent launcher to ${action.type}.`
                )
            }
            if (isFinalReviewAction(action)) {
                return executeFinalReviewAction({
                    action,
                    context: buildContext({
                        journal,
                        tracker,
                        step: tried,
                        ...build,
                    }),
                })
            }
            if (action.type === 'write_changeset') {
                return writeChangeset({
                    action,
                    context: buildContext({
                        journal,
                        tracker,
                        step: tried,
                        ...build,
                    }),
                })
            }
            if (action.type === 'open_pull_request') {
                return openPullRequest({
                    action,
                    context: buildContext({
                        journal,
                        tracker,
                        step: tried,
                        ...build,
                    }),
                })
            }
            if (action.type === 'ship_final_review') {
                return shipFinalReviewIn({
                    context: buildContext({
                        journal,
                        tracker,
                        step: tried,
                        ...build,
                    }),
                })
            }
            return executeBuildAction({
                action,
                journal,
                tracker,
                step: tried,
                ...build,
            })
    }
}
