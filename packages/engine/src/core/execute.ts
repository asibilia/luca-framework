import { decideSteps, type EngineAction } from './decide'
import { isFinalReviewAction } from './decide-final-review'
import type { PlanAction } from './decide-plan'
import {
    buildContext,
    executeBuildAction,
    type BuildDeps,
} from './execute-build'
import { executeFinalReviewAction } from './execute-final-review'

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
    limitWaitComment,
    SYSTEM_CLOCK,
    waitUntil,
    type EngineClock,
} from '../limits/limit-wait'
import {
    NEEDS_INFO_LABEL,
    READY_LABEL,
    type Tracker,
    type TrackerIssue,
} from '../tracker/tracker'

/** How many actions `runEngine` takes before it gives up, as a safety net. */
export const DEFAULT_MAX_STEPS = 1000

/** Actions that end `runEngine`'s loop: the run is over. */
const STOP_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
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
}: {
    journal: Journal
    spec_number: number
    config: EngineConfig
    /** The branch the run branch starts from. Defaults to `main`. */
    base_branch?: string
}): JournalRecord =>
    journal.append({
        kind: 'run_started',
        ticket: null,
        role: null,
        content: { spec_number, config, base_branch },
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
}: {
    spec_number: number
    problems: IntakeProblem[]
    journal: Journal
    tracker: Tracker
}) => {
    for (const { ticket, missing } of problems) {
        if (ticket === null) continue
        await tracker.comment({
            number: ticket,
            body: refusalComment({ spec_number, missing }),
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
}: {
    action: Exclude<PlanAction, { type: 'done' }>
    journal: Journal
    tracker: Tracker
    clock: EngineClock
}): Promise<void> => {
    switch (action.type) {
        case 'start_limit_wait': {
            const { rate_limit_type, resets_at, until, ticket, role } = action
            if (action.announce) {
                await tracker.comment({
                    number: action.spec_number,
                    body: limitWaitComment({
                        rate_limit_type,
                        resets_at,
                        until,
                    }),
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
}: {
    action: EngineAction
    journal: Journal
    tracker: Tracker
    /** Needed for every step after intake. */
    build?: BuildDeps
    /** Limit waits sleep by it. Defaults to `SYSTEM_CLOCK`. */
    clock?: EngineClock
}): Promise<void> => {
    switch (action.type) {
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
                    context: buildContext({ journal, tracker, ...build }),
                })
            }
            return executeBuildAction({ action, journal, tracker, ...build })
    }
}

/**
 * The ticket an action works on, or `null` for a run-level action. The
 * plan's actions are the whole run's, whichever ticket hit the limit; a
 * ticket's usage record is that ticket's.
 */
const ticketOf = (action: EngineAction): number | null => {
    switch (action.type) {
        case 'start_limit_wait':
        case 'wait_for_limit':
        case 'stop_for_billing':
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
 * The scheduler's key for an action: at most one action per key runs at a
 * time. Each lens has its own (`lens:<lens>`), so the five lenses review at
 * once; the final review's other steps share `final`; a ticket's steps its
 * number; and the run's own steps `run`, which only ever run alone.
 */
const keyOf = (action: EngineAction): string => {
    if (action.type === 'launch_lens') return `lens:${action.lens}`
    if (isFinalReviewAction(action)) return 'final'
    const ticket = ticketOf(action)
    return ticket === null ? 'run' : String(ticket)
}

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
            return true
        case 'run_gates':
        case 'install_dependencies':
            return action.target === 'run_branch'
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
}: {
    jev: JevShadow
    action: EngineAction
    journal: Journal
    tracker: Tracker
    build?: BuildDeps
    clock?: EngineClock
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
    await executeAction({ action, journal, tracker, build, clock })
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

/** One action the engine started and has not seen settle yet. */
type InFlight = { action: EngineAction; done: Promise<void> }

/**
 * Runs the engine: a scheduler over the decision step. Each pass it decides
 * every action that can run now from the journal and starts those it can,
 * so tickets build at the same time; then it waits for any one to settle
 * and decides again, until the run is done: refused, nothing to do, stuck,
 * or its PR opened. Building tickets needs `git` and `launcher`. Safe to
 * call on a journal left by a crashed engine; it picks up where the journal
 * ends.
 *
 * What may run together: one action per ticket; a run-level action (the run
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
 * With `board`, the whole journal is sent to the board once before the
 * first step and again after each step settles.
 *
 * A rejected plan limit is a limit wait: the engine sleeps by `clock` until
 * the window resets, then carries on. Overage or a billing error ends the
 * run for good (`done`, outcome `stopped`).
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
    /** Limit waits sleep by it. Defaults to `SYSTEM_CLOCK`; tests fake it. */
    clock?: EngineClock
}): Promise<EngineAction> => {
    const limit = max_steps ?? DEFAULT_MAX_STEPS
    const stops = new Set([...STOP_ACTIONS, ...(stop_before ?? [])])
    const build =
        git === undefined || launcher === undefined
            ? undefined
            : { git, launcher }
    const inFlight = new Map<string, InFlight>()
    let started = 0

    const execute = (action: EngineAction): Promise<void> =>
        jev === undefined
            ? executeAction({ action, journal, tracker, build, clock })
            : executeWithJev({ jev, action, journal, tracker, build, clock })
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

    // A resumed run catches the board up before its first step.
    await board?.sync({ records: journal.read() })
    for (;;) {
        const actions = decideSteps({ records: journal.read() })
        const stop = actions.find((action) => stops.has(action.type))
        if (stop !== undefined && inFlight.size === 0) return stop
        if (stop === undefined) {
            for (const action of actions) {
                const key = keyOf(action)
                if (!canStart({ action, key })) continue
                if (started >= limit) {
                    await settleAll()
                    throw new Error(
                        `The engine took ${limit} steps without finishing.`
                    )
                }
                started += 1
                const done = execute(action).finally(() => {
                    inFlight.delete(key)
                })
                // Seen by the race below; this keeps a rejection that lands
                // between races from counting as unhandled.
                done.catch(() => undefined)
                inFlight.set(key, { action, done })
            }
        }
        if (inFlight.size === 0) {
            throw new Error(
                `The engine could start none of: ${actions.map(({ type }) => type).join(', ')}.`
            )
        }
        try {
            // A stop waits for everything in flight; otherwise any one.
            await (stop === undefined
                ? Promise.race([...inFlight.values()].map(({ done }) => done))
                : Promise.all([...inFlight.values()].map(({ done }) => done)))
        } catch (error) {
            await settleAll()
            throw error
        }
        await board?.sync({ records: journal.read() })
    }
}
