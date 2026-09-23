import { decideBuild, type BuildAction } from './decide-build'
import { decidePlan, type PlanAction } from './decide-plan'

import { checkIntake } from '../intake/intake-checks'
import type { IntakeProblem, IntakeSnapshot } from '../intake/intake-schemas'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'

/** The next thing the engine should do, as picked by `decide`. */
export type EngineAction =
    /** The journal cannot be a run (for example it has no `run_started`). */
    | { type: 'invalid_journal'; reason: string }
    /** Read the spec, its sub-tickets, and outside blockers from the tracker. */
    | { type: 'read_intake'; spec_number: number }
    /** Tell each bad ticket what is missing, then end the run. */
    | { type: 'refuse_intake'; spec_number: number; problems: IntakeProblem[] }
    /** The spec has no open tickets; end the run. */
    | { type: 'finish_nothing_to_do'; closed_tickets: number[] }
    /** Write the spec and every ticket into the journal. */
    | { type: 'snapshot_intake'; snapshot: IntakeSnapshot }
    /** A limit wait, or a billing stop, before any build step. */
    | PlanAction
    /** Intake passed and every ticket is snapshotted: build the tickets. */
    | BuildAction
    /** The run ended at intake. */
    | { type: 'done'; outcome: 'refused' | 'nothing_to_do' }

/**
 * The engine core's decision step. Pure: given a run's journal, it returns the
 * next action. It never reads the tracker, the disk, or the clock.
 *
 * @example
 * const action = decide({ records: journal.read() })
 * if (action.type === 'read_intake') await readIntake(action.spec_number)
 */
export const decide = ({
    records,
}: {
    records: JournalRecord[]
}): EngineAction => {
    const state = replayRun({ records })
    const { phase, spec_number, config, intake } = state

    if (phase === 'new' || spec_number === null || config === null) {
        return {
            type: 'invalid_journal',
            reason: 'The journal has no run_started record.',
        }
    }
    switch (phase) {
        case 'started':
            return { type: 'read_intake', spec_number }
        case 'refused':
            return { type: 'done', outcome: 'refused' }
        case 'nothing_to_do':
            return { type: 'done', outcome: 'nothing_to_do' }
        case 'intake_passed':
            return (
                decidePlan({ state, spec_number }) ??
                decideBuild({ state, spec_number })
            )
        case 'intake_read':
        case 'snapshotting': {
            if (intake === null) {
                return {
                    type: 'invalid_journal',
                    reason: 'The journal has snapshots but no intake_read record.',
                }
            }
            const result = checkIntake({ config, intake_read: intake })
            if (result.outcome === 'refused') {
                return {
                    type: 'refuse_intake',
                    spec_number,
                    problems: result.problems,
                }
            }
            if (result.outcome === 'nothing_to_do') {
                return {
                    type: 'finish_nothing_to_do',
                    closed_tickets: result.closed_tickets,
                }
            }
            // A snapshot cut short by a crash is taken again in full; replay
            // keeps the latest snapshot of each ticket.
            return { type: 'snapshot_intake', snapshot: result.snapshot }
        }
    }
}
