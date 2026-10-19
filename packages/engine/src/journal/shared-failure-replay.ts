/**
 * Shared failures in replay (#544): the run-wide list of old tests that
 * failed, and whether a ticket's failed red check or gates failed only on
 * old tests another ticket failed shortly before, so a lone rerun is due.
 */
import type { JournalRecord } from './journal-record'
import type { OldTestFailure, RunState } from './run-state'
import type { TicketProgress } from './ticket-progress'

import type { TestCaseRef } from '../gates/gate-schemas'

/** How close in time two tickets' failures of one old test must be. */
export const SHARED_FAILURE_WINDOW_MS = 10 * 60_000

type CheckRecord = Extract<JournalRecord, { kind: 'red_check' | 'gates_run' }>

/** The test cases a check's record says failed: none in old gates records. */
const failedCasesOf = (record: CheckRecord): TestCaseRef[] =>
    record.kind === 'red_check'
        ? record.content.tests.cases
              .filter(({ status }) => status === 'failed')
              .map(({ file, full_name }) => ({ file, full_name }))
        : (record.content.failed_cases ?? [])

const sameTest = (a: TestCaseRef, b: TestCaseRef): boolean =>
    a.file === b.file && a.full_name === b.full_name

/**
 * Whether every one of `old` (non-empty) failed in another ticket, as
 * journaled before `time`'s record, within `SHARED_FAILURE_WINDOW_MS` of it.
 */
const sharedWithOthers = ({
    old,
    ticket,
    time,
    failures,
}: {
    old: TestCaseRef[]
    ticket: number
    time: string
    failures: OldTestFailure[]
}): boolean =>
    old.length > 0 &&
    old.every((test) =>
        failures.some(
            (failure) =>
                failure.ticket !== ticket &&
                sameTest(failure, test) &&
                Math.abs(Date.parse(failure.time) - Date.parse(time)) <=
                    SHARED_FAILURE_WINDOW_MS
        )
    )

/**
 * A ticket's progress with the check `record` journaled marked `shared`:
 * its red check, or its own gates. A join's gates get no lone rerun.
 */
const markedShared = ({
    progress,
    record,
}: {
    progress: TicketProgress
    record: CheckRecord
}): TicketProgress => {
    if (record.kind === 'red_check' && progress.red_check !== null) {
        return {
            ...progress,
            red_check: { ...progress.red_check, shared: true },
        }
    }
    if (
        record.kind === 'gates_run' &&
        record.content.target === 'ticket' &&
        progress.gates !== null
    ) {
        return { ...progress, gates: { ...progress.gates, shared: true } }
    }
    return progress
}

/**
 * The state after a ticket's red check or gates record, once its own
 * progress took it in: the old tests it failed (ones that passed at the
 * ticket's baseline) join `old_test_failures`, and a failed red check or
 * ticket gates is marked `shared` when every old test it failed also failed
 * in another ticket within 10 minutes, by record time. Only failures
 * journaled earlier count, so of two tickets failing at once the later one
 * gets the lone rerun. A check that failed no old test (only new ones) is
 * never shared.
 */
export const sharedFailuresAfter = ({
    state,
    record,
}: {
    state: RunState
    record: CheckRecord
}): RunState => {
    const { ticket } = record
    if (ticket === null || record.content.ok) return state
    const progress = state.tickets[ticket]
    const baseline = progress?.baseline
    if (progress === undefined || baseline === undefined || baseline === null) {
        return state
    }
    const old = failedCasesOf(record).filter((test) =>
        baseline.cases.some(
            (base) => base.status === 'passed' && sameTest(base, test)
        )
    )
    if (old.length === 0) return state
    const shared = sharedWithOthers({
        old,
        ticket,
        time: record.time,
        failures: state.old_test_failures,
    })
    return {
        ...state,
        tickets: {
            ...state.tickets,
            [ticket]: shared ? markedShared({ progress, record }) : progress,
        },
        old_test_failures: [
            ...state.old_test_failures,
            ...old.map(({ file, full_name }) => ({
                ticket,
                file,
                full_name,
                time: record.time,
            })),
        ],
    }
}
