import { basename, dirname } from 'node:path'

import has from 'lodash/has'
import partition from 'lodash/partition'

import { decideSteps, type EngineAction } from './decide'
import { isFinalReviewAction } from './decide-final-review'
import { isMemoryAction } from './decide-memory'
import type { PlanAction } from './decide-plan'
import type { UsageLineAction } from './decide-usage-line'
import {
    buildContext,
    executeBuildAction,
    type BuildDeps,
} from './execute-build'
import { executeFinalReviewAction } from './execute-final-review'
import { executeMemoryAction } from './execute-memory'
import { executeStuckAction } from './execute-stuck'
import {
    closeSessions,
    finishedSessions,
    openSessionsIn,
} from './session-close'

import type { BoardSync } from '../board/board-sync'
import type { EngineConfig } from '../config/engine-config'
import { outsideBlockerNumbers } from '../intake/intake-checks'
import type { IntakeProblem } from '../intake/intake-schemas'
import { jevAsksAfter, jevAsksBefore } from '../jev/jev-jobs'
import { askJevInShadow, type JevShadow } from '../jev/jev-shadow'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    crashesAfter,
    resumeEntry,
    stepFirstSeq,
    type CrashCounts,
} from '../journal/step-records'
import {
    LIMIT_WAIT_NAP_MS,
    limitWaitComment,
    SYSTEM_CLOCK,
    waitUntil,
    type EngineClock,
} from '../limits/limit-wait'
import {
    DEFAULT_USAGE_LINES,
    LINE_OF,
    runReadings,
    usageLineEndedComment,
    usageLineWaitComment,
    type UsageLineDeps,
    type UsageLines,
} from '../limits/usage-line'
import type { MemoryDeps } from '../memory/memory-client'
import { postCommentOnce, type CommentStep } from '../tracker/post-comment-once'
import {
    NEEDS_INFO_LABEL,
    READY_LABEL,
    type Tracker,
    type TrackerIssue,
} from '../tracker/tracker'

/** How many actions `runEngine` takes before it gives up, as a safety net. */
export const DEFAULT_MAX_STEPS = 1000

/** Actions that end `runEngine`'s loop: the run is over. */
export const STOP_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'done',
    'invalid_journal',
])

/**
 * Starts a run by writing its first record. The spec and config it names are
 * what every later step of the run works from.
 */
export const startRun = ({
    journal,
    spec_number,
    config,
    base_branch,
    memory,
    repo,
}: {
    journal: Journal
    spec_number: number
    config: EngineConfig
    /** The branch the run branch starts from. Defaults to `main`. */
    base_branch?: string
    /**
     * Turns memory on (#370), with the project's vault (`null` searches only
     * `default`). Leave it out for a run without memory.
     */
    memory?: { project_vault: string | null }
    /** The repo the run is on, so a resume can find it. Defaults to `null`. */
    repo?: string | null
}): JournalRecord =>
    journal.append({
        kind: 'run_started',
        ticket: null,
        role: null,
        content: {
            spec_number,
            config,
            base_branch,
            memory: memory ?? null,
            repo,
        },
    })

/** The comment a bad spec or ticket gets when intake refuses the run. */
export const refusalComment = ({
    spec_number,
    missing,
}: {
    spec_number: number
    missing: string[]
}): string =>
    `Luca intake refused the run for spec #${spec_number}. This issue is not ready yet:\n\n` +
    `${missing.map((line) => `- ${line}`).join('\n')}\n\n` +
    `Fix these, move the issue back to \`${READY_LABEL}\`, and start the run again.`

const readIntake = async ({
    spec_number,
    journal,
    tracker,
}: {
    spec_number: number
    journal: Journal
    tracker: Tracker
}) => {
    const spec = await tracker.readSpec({ spec_number })
    const subTickets = await tracker.listSubTickets({ spec_number })
    const outside = await Promise.all(
        outsideBlockerNumbers({ sub_tickets: subTickets }).map((number) =>
            tracker.readIssue({ number })
        )
    )
    journal.append({
        kind: 'intake_read',
        ticket: null,
        role: null,
        content: {
            spec,
            sub_tickets: subTickets,
            outside_blockers: outside.filter(
                (issue): issue is TrackerIssue => issue !== null
            ),
        },
    })
}

const refuseIntake = async ({
    spec_number,
    problems,
    journal,
    tracker,
    step,
}: {
    spec_number: number
    problems: IntakeProblem[]
    journal: Journal
    tracker: Tracker
    step: CommentStep
}) => {
    for (const [n, { ticket, missing }] of problems.entries()) {
        if (ticket === null) continue
        await postCommentOnce({
            tracker,
            number: ticket,
            body: refusalComment({ spec_number, missing }),
            step,
            n,
        })
        await tracker.addLabel({ number: ticket, label: NEEDS_INFO_LABEL })
        await tracker.removeLabel({ number: ticket, label: READY_LABEL })
    }
    journal.append({
        kind: 'intake_refused',
        ticket: null,
        role: null,
        content: { problems },
    })
}

/**
 * Carries out a limit wait or a billing stop. A limit wait's start tells the
 * spec issue (unless it already heard of this reset) before it is journaled;
 * the wait itself sleeps by `clock` until its end, so a restarted engine
 * waits out only what is left.
 */
const executePlanAction = async ({
    action,
    journal,
    tracker,
    clock,
    step,
}: {
    action: Exclude<PlanAction, { type: 'done' }>
    journal: Journal
    tracker: Tracker
    clock: EngineClock
    step: CommentStep
}): Promise<void> => {
    switch (action.type) {
        case 'start_limit_wait': {
            const { rate_limit_type, resets_at, until, ticket, role } = action
            if (action.announce) {
                await postCommentOnce({
                    tracker,
                    number: action.spec_number,
                    body: limitWaitComment({
                        rate_limit_type,
                        resets_at,
                        until,
                    }),
                    step,
                    n: 0,
                })
            }
            journal.append({
                kind: 'limit_wait_started',
                ticket: null,
                role: null,
                content: {
                    resets_at,
                    until,
                    rate_limit_type,
                    hit_ticket: ticket,
                    hit_role: role,
                },
            })
            return
        }
        case 'wait_for_limit':
            await waitUntil({ clock, until: action.until })
            journal.append({
                kind: 'limit_wait_ended',
                ticket: null,
                role: null,
                content: { until: action.until },
            })
            return
        case 'stop_for_billing':
            journal.append({
                kind: 'run_stopped',
                ticket: null,
                role: null,
                content: { reason: action.reason, role: null, billing: true },
            })
            return
    }
}

/**
 * Carries out a usage-line wait. Its start tells the spec issue, then is
 * journaled. The wait sleeps by `clock` in naps until its end, re-reading
 * the lines before each nap: a line raised above the reading ends it at
 * once. Its end tells the spec issue why the run carries on, then is
 * journaled.
 */
const executeUsageLineAction = async ({
    action,
    journal,
    tracker,
    clock,
    read_usage_lines,
    step,
}: {
    action: UsageLineAction
    journal: Journal
    tracker: Tracker
    clock: EngineClock
    read_usage_lines: () => Promise<UsageLines>
    step: CommentStep
}): Promise<void> => {
    const { spec_number, window, line, percent, until } = action
    if (action.type === 'start_usage_line_wait') {
        const { resets_at } = action
        await postCommentOnce({
            tracker,
            number: spec_number,
            body: usageLineWaitComment({ window, line, percent, resets_at }),
            step,
            n: 0,
        })
        journal.append({
            kind: 'usage_line_wait_started',
            ticket: null,
            role: null,
            content: { window, line, percent, resets_at, until },
        })
        return
    }
    const end = Date.parse(until)
    let reason: 'reset' | 'line_raised' = 'reset'
    for (;;) {
        const lines = await read_usage_lines()
        if (lines[LINE_OF[window]] > percent) {
            reason = 'line_raised'
            break
        }
        const left = end - clock.now()
        if (left <= 0) break
        await clock.sleep(Math.min(left, LIMIT_WAIT_NAP_MS))
    }
    await postCommentOnce({
        tracker,
        number: spec_number,
        body: usageLineEndedComment({ window, percent, reason }),
        step,
        n: 0,
    })
    journal.append({
        kind: 'usage_line_wait_ended',
        ticket: null,
        role: null,
        content: { until, reason },
    })
}

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
        case 'ship_final_review':
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
        case 'finish_nothing_to_do':
            journal.append({
                kind: 'nothing_to_do',
                ticket: null,
                role: null,
                content: { closed_tickets: action.closed_tickets },
            })
            return
        case 'snapshot_intake': {
            const { spec, tickets, closed_tickets } = action.snapshot
            journal.append({
                kind: 'spec_snapshot',
                ticket: spec.number,
                role: null,
                content: {
                    spec,
                    ticket_order: tickets.map((ticket) => ticket.number),
                    closed_tickets,
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
            return executeBuildAction({
                action,
                journal,
                tracker,
                step: tried,
                ...build,
            })
    }
}

/**
 * The ticket an action works on, or `null` for a run-level action. The
 * plan's actions are the whole run's, whichever ticket hit the limit; a
 * ticket's usage record is that ticket's. Reading and taking replies is
 * the run's too (see `keyOf`).
 */
const ticketOf = (action: EngineAction): number | null => {
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
const agentRoleOf = (action: EngineAction): string | null => {
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
const WAIT_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'wait_for_reply',
    'wait_for_limit',
    'wait_for_usage_line',
])

/**
 * Steps that can run for minutes: installs, test runs, and agents' turns.
 * The board hears of them as they start, so a run never looks frozen.
 */
const SLOW_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    ...AGENT_ACTIONS,
    'launch_learner',
    'install_dependencies',
    'run_baseline_tests',
    'run_red_check',
    'run_gates',
    'run_final_gates',
])

/**
 * Actions that read or move the run branch. At most one runs at a time, so
 * joins, their gates, pushes, and new worktrees see one run branch. The
 * final review's fixers, gates, commit, and push work in the run branch's
 * worktree; its lenses only read it.
 */
const usesRunBranch = (action: EngineAction): boolean => {
    switch (action.type) {
        case 'create_ticket_worktree':
        case 'join_run_branch':
        case 'push_run_branch':
        case 'rebase_ticket':
        case 'start_final_review':
        case 'launch_final_fixer':
        case 'follow_up_final_fixer':
        case 'run_final_gates':
        case 'commit_final_fix':
        case 'push_final_fixes':
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

/**
 * Carries out one action with Jev in shadow mode: asks Jev before it (ticket
 * order, model, skills), then after it about the records it appended
 * (failure kinds, finding severities). Only the action's own ticket's new
 * records count, since other tickets append at the same time. Jev's answers
 * change nothing.
 */
const executeWithJev = async ({
    jev,
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
    jev: JevShadow
    action: EngineAction
    journal: Journal
    tracker: Tracker
    build?: BuildDeps
    clock?: EngineClock
    reply_poll_ms?: number
    memory?: MemoryDeps
    step?: StepTry
    read_usage_lines?: () => Promise<UsageLines>
}): Promise<void> => {
    const shadow = { jev: jev.client, journal, timeout_ms: jev.timeout_ms }
    await askJevInShadow({
        ...shadow,
        asks: jevAsksBefore({
            action,
            state: replayRun({ records: journal.read() }),
        }),
    })
    const lastSeq = journal.read().at(-1)?.seq ?? 0
    await executeAction({
        action,
        journal,
        tracker,
        build,
        clock,
        reply_poll_ms,
        memory,
        step,
        read_usage_lines,
    })
    const records = journal.read()
    await askJevInShadow({
        ...shadow,
        asks: jevAsksAfter({
            records: records.filter(
                (record) =>
                    record.seq > lastSeq && ownsRecord({ action, record })
            ),
            state: replayRun({ records }),
        }),
    })
}

/**
 * Whether a record appended while `action` ran is that action's own, since
 * other tickets (or other lenses) append at the same time: a ticket's
 * records for a ticket's step, a lens's for its lens, and the final
 * review's other ticket-less records for its other steps.
 */
const ownsRecord = ({
    action,
    record,
}: {
    action: EngineAction
    record: JournalRecord
}): boolean => {
    if (action.type === 'launch_lens') {
        return (
            record.ticket === null &&
            (record.role === null || record.role === action.role)
        )
    }
    if (isFinalReviewAction(action)) {
        return record.ticket === null && !record.role?.endsWith('-lens')
    }
    const ticket = ticketOf(action)
    return ticket === null || record.ticket === ticket
}

/** The crash counts per key, from the journal's records. */
const crashesIn = (records: JournalRecord[]): CrashCounts =>
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
const redosFirst = ({
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

/** One action the engine started and has not seen settle yet. */
type InFlight = { action: EngineAction; done: Promise<void> }

/** The session a follow-up goes to, if the action is one. */
const followUpSessionOf = (action: EngineAction): string[] =>
    action.type === 'follow_up_agent' || action.type === 'follow_up_final_fixer'
        ? [action.session_id]
        : []

/**
 * Runs the engine: a scheduler over the decision step. Each pass it decides
 * every action that can run now from the journal and starts those it can,
 * so tickets build at the same time; then it waits for any one to settle
 * and decides again, until the run is done: refused, nothing to do, its PR
 * opened, stopped by the owner's `stop`, or every ticket skipped. Building tickets needs `git` and `launcher`. Safe to
 * call on a journal left by a crashed engine; it picks up where the journal
 * ends.
 *
 * A stuck ticket is told to the spec issue while the other tickets keep
 * building; the engine then reads the spec issue every `reply_poll_ms`
 * for the owner's reply, with no time limit, and acts on it (see
 * `decide-stuck.ts`). Reply waits don't count towards `max_steps`.
 *
 * What may run together: one action per ticket; one reply action at a
 * time; a run-level action (the run
 * branch, the PR, removing worktrees, intake, a limit wait, a billing stop)
 * only alone, once everything in flight has settled; and one action on
 * the run branch at a time (a new worktree, a join, its gates, a push, a
 * rebase). A stop action waits for everything in flight, then the journal is
 * read again. If an action throws (such as a launcher stop), the rest are
 * let finish, then the first error is thrown. `max_steps` counts the actions
 * started.
 *
 * With `jev`, Jev is asked around each step in **shadow mode** and its
 * answers are journaled but never acted on. Without it, nothing changes.
 *
 * With `memory`, a run whose `run_started` turned memory on searches
 * MuninnDB at each recall point and saves the learner's memories at its
 * end (#370). A MuninnDB that errors or hangs is journaled and the run goes
 * on.
 *
 * With `board`, the whole journal is sent to the board once before the
 * first step and again after each step settles.
 *
 * A rejected plan limit is a limit wait: the engine sleeps by `clock` until
 * the window resets, then carries on. Overage or a billing error ends the
 * run for good (`done`, outcome `stopped`).
 *
 * With `usage`, the run keeps below the **usage line**: before each
 * decision it shares its readings with every run, reads the newest shared
 * ones and the lines, and pauses at a line (see `decide-usage-line.ts`).
 *
 * Crash recovery: every step it starts (not a wait) is journaled between a
 * `step_started` and a `step_ended` (none when the step throws). On start,
 * a step with no `step_ended` was cut off by a crash: one `run_resumed`
 * names them (`resumeEntry`), and each is taken again, an agent's turn in a
 * fresh session. A redo's `step_started` carries its first try's seq in
 * `first_seq`. The same step cut off `MAX_CRASHES` times in a row is not
 * taken again (see `decide-crashes.ts`).
 *
 * Agents' sessions close as soon as nothing can send them a follow-up
 * (`finishedSessions`): before each decision, the engine closes them with
 * the launcher and journals each as `agent_session_closed`. A run that ends
 * (`done`, or a thrown error) closes every session still open.
 *
 * @returns The action the loop stopped on.
 */
export const runEngine = async ({
    journal,
    tracker,
    max_steps,
    stop_before,
    git,
    launcher,
    jev,
    board,
    clock,
    reply_poll_ms,
    memory,
    usage,
}: Partial<BuildDeps> & {
    journal: Journal
    tracker: Tracker
    /** Defaults to `DEFAULT_MAX_STEPS`. */
    max_steps?: number
    /** Action types to stop at without carrying them out, such as in tests. */
    stop_before?: EngineAction['type'][]
    /** Jev in shadow mode. Leave it out to run without Jev. */
    jev?: JevShadow
    /** Sends the journal to the board after every step. Never throws. */
    board?: BoardSync
    /** Limit and reply waits sleep by it. Defaults to `SYSTEM_CLOCK`; tests fake it. */
    clock?: EngineClock
    /** How long each wait for a reply sleeps. Defaults to `REPLY_POLL_MS`. */
    reply_poll_ms?: number
    /**
     * The memory client (MuninnDB) for a run whose `run_started` turned
     * memory on (#370). Its errors and timeouts are journaled, never thrown.
     */
    memory?: MemoryDeps
    /** The usage lines and the shared readings. Left out, there is no usage line. */
    usage?: UsageLineDeps
}): Promise<EngineAction> => {
    const limit = max_steps ?? DEFAULT_MAX_STEPS
    const stops = new Set([...STOP_ACTIONS, ...(stop_before ?? [])])
    const build =
        git === undefined || launcher === undefined
            ? undefined
            : { git, launcher }
    const inFlight = new Map<string, InFlight>()
    let started = 0

    const execute = (action: EngineAction, step?: StepTry): Promise<void> =>
        jev === undefined
            ? executeAction({
                  action,
                  journal,
                  tracker,
                  build,
                  clock,
                  reply_poll_ms,
                  memory,
                  step,
                  read_usage_lines: usage?.read_lines,
              })
            : executeWithJev({
                  jev,
                  action,
                  journal,
                  tracker,
                  build,
                  clock,
                  reply_poll_ms,
                  memory,
                  step,
                  read_usage_lines: usage?.read_lines,
              })

    /** The decision step, with the usage line when the run has one. */
    const decideNow = async (
        records: JournalRecord[]
    ): Promise<EngineAction[]> => {
        if (usage === undefined) return decideSteps({ records })
        await usage.share(runReadings({ records }))
        return decideSteps({
            records,
            usage_lines: await usage.read_lines(),
            shared_readings: await usage.read_shared(),
        })
    }
    const settleAll = () =>
        Promise.allSettled([...inFlight.values()].map(({ done }) => done))
    const canStart = ({ action, key }: { action: EngineAction; key: string }) =>
        !inFlight.has(key) &&
        !inFlight.has('run') &&
        (key !== 'run' || inFlight.size === 0) &&
        !(
            usesRunBranch(action) &&
            [...inFlight.values()].some((running) =>
                usesRunBranch(running.action)
            )
        )

    /**
     * Carries out an action between its step records: `step_started` when
     * it starts, `step_ended` once it settles. Waits get none.
     */
    const runStep = async ({
        action,
        key,
        crashes,
    }: {
        action: EngineAction
        key: string
        crashes: CrashCounts
    }): Promise<void> => {
        if (WAIT_ACTIONS.has(action.type)) return execute(action)
        const step = stepOf(action)
        const who = { ticket: ticketOf(action), role: agentRoleOf(action) }
        const first_seq = stepFirstSeq({ crashes, key, step })
        const started = journal.append({
            kind: 'step_started',
            ...who,
            content: { key, step, first_seq },
        })
        await execute(action, {
            first_seq: first_seq ?? started.seq,
            redo: first_seq !== null,
        })
        journal.append({ kind: 'step_ended', ...who, content: { key, step } })
    }

    /**
     * Closes the sessions no follow-up can reach anymore (`all`: every one
     * still open), journaling each close. A follow-up under way keeps its
     * session open.
     */
    const closeFinished = async ({ all }: { all: boolean }): Promise<void> => {
        if (launcher === undefined) return
        const records = journal.read()
        const busy = [...inFlight.values()].flatMap(({ action }) =>
            followUpSessionOf(action)
        )
        await closeSessions({
            journal,
            launcher,
            sessions: all
                ? openSessionsIn({ records })
                : finishedSessions({ records, busy }),
        })
    }

    const loop = async (): Promise<EngineAction> => {
        for (;;) {
            // Before each decision, so no finished agent's session lingers
            // and no fix round goes to a closed one.
            await closeFinished({ all: false })
            const records = journal.read()
            const crashes = crashesIn(records)
            const actions = redosFirst({
                actions: await decideNow(records),
                crashes,
            })
            const stop = actions.find((action) => stops.has(action.type))
            if (stop !== undefined && inFlight.size === 0) {
                if (STOP_ACTIONS.has(stop.type)) {
                    await closeFinished({ all: true })
                }
                return stop
            }
            let slowStarted = false
            if (stop === undefined) {
                for (const action of actions) {
                    const key = keyOf(action)
                    if (!canStart({ action, key })) continue
                    // Waiting for a reply has no time limit, so it never counts.
                    const counts = action.type !== 'wait_for_reply'
                    if (counts && started >= limit) {
                        await settleAll()
                        throw new Error(
                            `The engine took ${limit} steps without finishing.`
                        )
                    }
                    if (counts) started += 1
                    const done = runStep({ action, key, crashes }).finally(
                        () => {
                            inFlight.delete(key)
                        }
                    )
                    // Seen by the race below; this keeps a rejection that lands
                    // between races from counting as unhandled.
                    done.catch(() => undefined)
                    inFlight.set(key, { action, done })
                    if (SLOW_ACTIONS.has(action.type)) slowStarted = true
                }
            }
            // A slow step shows on the board while it runs, not only once it ends.
            if (slowStarted) await board?.sync({ records: journal.read() })
            if (inFlight.size === 0) {
                throw new Error(
                    `The engine could start none of: ${actions.map(({ type }) => type).join(', ')}.`
                )
            }
            try {
                // A stop waits for everything in flight; otherwise any one.
                await (stop === undefined
                    ? Promise.race(
                          [...inFlight.values()].map(({ done }) => done)
                      )
                    : Promise.all(
                          [...inFlight.values()].map(({ done }) => done)
                      ))
            } catch (error) {
                await settleAll()
                throw error
            }
            await board?.sync({ records: journal.read() })
        }
    }

    // Steps a crash cut off are named once, before the first step.
    const resumed = resumeEntry({ records: journal.read() })
    if (resumed !== null) journal.append(resumed)
    // A resumed run catches the board up before its first step.
    await board?.sync({ records: journal.read() })
    try {
        return await loop()
    } catch (error) {
        // The run ends here, so no session stays open.
        await closeFinished({ all: true })
        throw error
    }
}
