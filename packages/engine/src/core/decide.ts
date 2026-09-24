import { decideBuild, type BuildAction } from './decide-build'
import { decideCrashes, type CrashAction } from './decide-crashes'
import { decideMemory, type MemoryAction } from './decide-memory'
import { decidePlan, type PlanAction } from './decide-plan'
import { decideUsage, type UsageAction } from './decide-usage'

import { checkIntake } from '../intake/intake-checks'
import type { IntakeProblem, IntakeSnapshot } from '../intake/intake-schemas'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun, type RunState } from '../journal/replay'

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
    /** A finished ticket's usage, or the run's before it ends. */
    | UsageAction
    /** Stopping the run for good after crashes on a run-level step. */
    | CrashAction
    /** Intake passed and every ticket is snapshotted: build the tickets. */
    | BuildAction
    /** Memory's recall points, the learner, and its saves (#370). */
    | MemoryAction
    /** The run ended at intake. */
    | { type: 'done'; outcome: 'refused' | 'nothing_to_do' }

/**
 * The engine core's decision step. Pure: given a run's journal, it returns
 * every action that can run now, in ticket order: one at a time through
 * intake, then at most one per ticket while tickets build at the same time.
 * It never reads the tracker, the disk, or the clock.
 *
 * Crashes come first: a run-level step cut off by a crash `MAX_CRASHES`
 * times in a row stops the run for good (`decide-crashes.ts`). Then the
 * plan: a limit wait or a billing stop is the only action,
 * for the whole run, however many tickets are in flight (the scheduler lets
 * them settle first, then every cut-off step is taken again after the
 * wait). A finished ticket's usage is recorded beside the build steps, and
 * the run's alone, just before it ends. A stop action (`done`,
 * `invalid_journal`) always comes alone.
 *
 * @example
 * const actions = decideSteps({ records: journal.read() })
 * // [{ type: 'launch_agent', ticket: 11, ... }, { type: 'run_red_check', ticket: 12, ... }]
 */
export const decideSteps = ({
    records,
}: {
    records: JournalRecord[]
}): EngineAction[] => {
    const state = replayRun({ records })
    const { phase, spec_number } = state
    const crash = phase === 'new' ? null : decideCrashes({ state })
    if (crash !== null) {
        // A stop for crashes is the end: the run's usage is recorded first.
        const usage =
            crash.type === 'done' && phase === 'intake_passed'
                ? decideUsage({ records, state, ending: true })
                : null
        return [usage ?? crash]
    }
    if (phase !== 'intake_passed' || spec_number === null) {
        return [decideIntake({ state })]
    }
    const plan = decidePlan({ state, spec_number })
    if (plan !== null) {
        // A billing stop is the end: the run's usage is recorded first.
        const usage =
            plan.type === 'done'
                ? decideUsage({ records, state, ending: true })
                : null
        return [usage ?? plan]
    }
    const build = decideMemory({
        state,
        records,
        spec_number,
        build: decideBuild({ state, spec_number }),
    })
    const ending = build.length === 1 && build[0]?.type === 'done'
    const usage = decideUsage({ records, state, ending })
    if (usage === null) return build
    return ending ? [usage] : [usage, ...build]
}

/**
 * The first action `decideSteps` returns: the next action, for a caller that
 * does one at a time.
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
    const [first] = decideSteps({ records })
    return (
        first ?? {
            type: 'invalid_journal',
            reason: 'The decision step found nothing to do.',
        }
    )
}

/** The decision step up to and through intake: one action at a time. */
const decideIntake = ({ state }: { state: RunState }): EngineAction => {
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
            // decideSteps builds; this is only reached without a spec number.
            return {
                type: 'invalid_journal',
                reason: 'The journal has no run_started record.',
            }
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
