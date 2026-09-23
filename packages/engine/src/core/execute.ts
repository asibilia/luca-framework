import { decide, type EngineAction } from './decide'

import type { EngineConfig } from '../config/engine-config'
import { outsideBlockerNumbers } from '../intake/intake-checks'
import type { IntakeProblem } from '../intake/intake-schemas'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import {
    NEEDS_INFO_LABEL,
    READY_LABEL,
    type Tracker,
    type TrackerIssue,
} from '../tracker/tracker'

/** How many actions `runEngine` takes before it gives up, as a safety net. */
export const DEFAULT_MAX_STEPS = 1000

/** Actions that end `runEngine`'s loop: the run is over or waits on later work. */
const STOP_ACTIONS: ReadonlySet<EngineAction['type']> = new Set([
    'done',
    'invalid_journal',
    'await_build',
])

/**
 * Starts a run by writing its first record. The spec and config it names are
 * what every later step of the run works from.
 */
export const startRun = ({
    journal,
    spec_number,
    config,
}: {
    journal: Journal
    spec_number: number
    config: EngineConfig
}): JournalRecord =>
    journal.append({
        kind: 'run_started',
        ticket: null,
        role: null,
        content: { spec_number, config },
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
 * Carries out one action: talks to the tracker, then records what happened in
 * the journal. The only impure half of the engine; `decide` picks the action.
 *
 * Stop actions (`done`, `invalid_journal`, `await_build`) do nothing here.
 */
export const executeAction = async ({
    action,
    journal,
    tracker,
}: {
    action: EngineAction
    journal: Journal
    tracker: Tracker
}): Promise<void> => {
    switch (action.type) {
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
        case 'await_build':
        case 'done':
            return
    }
}

/**
 * Runs the engine: decide the next action from the journal, carry it out,
 * repeat, until the run is done or reaches the build seam. Safe to call on a
 * journal left by a crashed engine; it picks up where the journal ends.
 *
 * @returns The action the loop stopped on.
 */
export const runEngine = async ({
    journal,
    tracker,
    max_steps,
}: {
    journal: Journal
    tracker: Tracker
    /** Defaults to `DEFAULT_MAX_STEPS`. */
    max_steps?: number
}): Promise<EngineAction> => {
    const limit = max_steps ?? DEFAULT_MAX_STEPS
    for (let step = 0; step < limit; step += 1) {
        const action = decide({ records: journal.read() })
        if (STOP_ACTIONS.has(action.type)) return action
        await executeAction({ action, journal, tracker })
    }
    throw new Error(`The engine took ${limit} steps without finishing.`)
}
