import type { JournalRecord } from './journal-record'

import type { EngineConfig } from '../config/engine-config'
import type {
    IntakeProblem,
    IntakeRead,
    SpecSnapshot,
    TicketSnapshot,
} from '../intake/intake-schemas'

/** Where a run stands, as far as intake goes. */
export type RunPhase =
    | 'new'
    | 'started'
    | 'intake_read'
    | 'refused'
    | 'nothing_to_do'
    /** The spec snapshot is written but some ticket snapshots are not. */
    | 'snapshotting'
    | 'intake_passed'

/** The snapshot as replayed from `spec_snapshot` and `ticket_snapshot`. */
export type ReplayedSnapshot = {
    spec: SpecSnapshot
    ticket_order: number[]
    closed_tickets: number[]
    /** The latest snapshot of each ticket, keyed by ticket number. */
    tickets: Record<number, TicketSnapshot>
}

/** A run's state, rebuilt only from its journal. There is no status file. */
export type RunState = {
    phase: RunPhase
    spec_number: number | null
    config: EngineConfig | null
    intake: IntakeRead | null
    problems: IntakeProblem[] | null
    snapshot: ReplayedSnapshot | null
    last_seq: number
}

const EMPTY_STATE: RunState = {
    phase: 'new',
    spec_number: null,
    config: null,
    intake: null,
    problems: null,
    snapshot: null,
    last_seq: 0,
}

const snapshotPhase = ({
    snapshot,
}: {
    snapshot: ReplayedSnapshot
}): RunPhase =>
    snapshot.ticket_order.every((number) => number in snapshot.tickets)
        ? 'intake_passed'
        : 'snapshotting'

const applyRecord = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): RunState => {
    const next = { ...state, last_seq: record.seq }
    switch (record.kind) {
        case 'run_started':
            return {
                ...next,
                phase: 'started',
                spec_number: record.content.spec_number,
                config: record.content.config,
            }
        case 'intake_read':
            return { ...next, phase: 'intake_read', intake: record.content }
        case 'intake_refused':
            return {
                ...next,
                phase: 'refused',
                problems: record.content.problems,
            }
        case 'nothing_to_do':
            return { ...next, phase: 'nothing_to_do' }
        case 'spec_snapshot': {
            const snapshot = {
                spec: record.content.spec,
                ticket_order: record.content.ticket_order,
                closed_tickets: record.content.closed_tickets,
                tickets: {},
            }
            return { ...next, snapshot, phase: snapshotPhase({ snapshot }) }
        }
        case 'ticket_snapshot': {
            if (state.snapshot === null) return next
            const snapshot = {
                ...state.snapshot,
                tickets: {
                    ...state.snapshot.tickets,
                    [record.content.number]: record.content,
                },
            }
            return { ...next, snapshot, phase: snapshotPhase({ snapshot }) }
        }
    }
}

/**
 * Rebuilds a run's state purely from its journal records, in order.
 *
 * @example
 * const state = replayRun({ records: journal.read() })
 * if (state.phase === 'refused') console.log(state.problems)
 */
export const replayRun = ({
    records,
}: {
    records: JournalRecord[]
}): RunState =>
    records.reduce(
        (state, record) => applyRecord({ state, record }),
        EMPTY_STATE
    )
