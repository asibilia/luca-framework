import { MAX_CRASHES } from './loop-caps'

import type { RunState } from '../journal/replay'
import type { CrashCounts, StepCrashes } from '../journal/step-records'

/** The run's steps when crashes stop it. */
export type CrashAction =
    /** The same run-level step crashed too often: stop the run for good. */
    | { type: 'stop_for_crashes'; reason: string }
    /** The run stopped for crashes. It never goes on. */
    | { type: 'done'; outcome: 'crashed'; reason: string }

/**
 * The crashes on these keys that reached `MAX_CRASHES`, if any: the first
 * such key's count.
 *
 * @example
 * crashedOut({ crashes: state.crashes, keys: ['11'] }) // { step: 'launch_agent:test-writer', count: 3, first_seq: 40 }
 */
export const crashedOut = ({
    crashes,
    keys,
}: {
    crashes: CrashCounts
    keys: (key: string) => boolean
}): StepCrashes | null =>
    Object.entries(crashes).find(
        ([key, crash]) => keys(key) && crash.count >= MAX_CRASHES
    )?.[1] ?? null

/**
 * Why a step is not taken again, for a stuck detail or a stop's reason: the
 * step and how many crashes in a row cut it off.
 *
 * @example
 * crashDetail({ crash }) // 'A crash cut off the step `run_red_check` 3 times in a row. ...'
 */
export const crashDetail = ({ crash }: { crash: StepCrashes }): string =>
    `A crash cut off the step \`${crash.step}\` ${crash.count} times in a row, so the engine does not take it again by itself.`

/** The run-level keys: the run's own steps, and taking replies. */
const isRunKey = (key: string): boolean => key === 'run' || key === 'replies'

/**
 * The crash half of the decision step. Pure. A run-level step (or taking a
 * reply) cut off by `MAX_CRASHES` crashes in a row stops the run for good,
 * and that stop sticks. `null` when crashes have nothing to say. A ticket's
 * crashes make the ticket stuck (`decide-build.ts`), and the final review's
 * make it stuck (`decide-final-review.ts`).
 *
 * @example
 * decideCrashes({ state }) // { type: 'stop_for_crashes', reason: 'A crash cut off the step `create_run_branch` 3 times ...' }
 */
export const decideCrashes = ({
    state,
}: {
    state: RunState
}): CrashAction | null => {
    if (state.crash_stopped !== null) {
        return {
            type: 'done',
            outcome: 'crashed',
            reason: state.crash_stopped.reason,
        }
    }
    const crash = crashedOut({ crashes: state.crashes, keys: isRunKey })
    return crash === null
        ? null
        : { type: 'stop_for_crashes', reason: crashDetail({ crash }) }
}
