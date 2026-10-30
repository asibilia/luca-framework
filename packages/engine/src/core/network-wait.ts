/**
 * The network wait (#701): a step that throws a tracker network error
 * (`isTrackerNetworkFailure`, after the tracker's own quick tries) makes
 * the run wait for GitHub instead of crashing. The step runs again every
 * minute; a step can run again safely, as crash recovery already redoes a
 * cut-off step. After 15 minutes the run crashes with the last error.
 */
import type { Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import { isTrackerNetworkFailure } from '../tracker/tracker'

/** How long the engine waits before it runs the step again. */
export const NETWORK_RETRY_MS = 60_000

/** How long the network wait lasts before the run crashes. */
export const NETWORK_WAIT_MS = 15 * 60_000

const START_LINE =
    "[luca-run] GitHub can't be reached; trying again every minute for up to 15 minutes."

const STILL_LINE =
    "[luca-run] GitHub still can't be reached; trying again in a minute."

/**
 * Runs `run` (one try of `step`; `redo` is true for each try after the
 * first), waiting for GitHub while it throws a network error: journals
 * `network_wait_started`, then `network_wait_ended` once a try works, or
 * with `gave_up` 15 minutes after the start, when it throws the last error.
 * Any other error is thrown at once.
 */
export const withNetworkWait = async ({
    journal,
    step,
    who,
    clock,
    log,
    run,
}: {
    journal: Journal
    step: string
    who: { ticket: number | null; role: string | null }
    clock: EngineClock
    log: (line: string) => void
    run: (args: { redo: boolean }) => Promise<void>
}): Promise<void> => {
    try {
        return await run({ redo: false })
    } catch (error) {
        if (!isTrackerNetworkFailure(error)) throw error
        journal.append({
            kind: 'network_wait_started',
            ...who,
            content: { step, error: error.message },
        })
        log(START_LINE)
    }
    const until = clock.now() + NETWORK_WAIT_MS
    for (let tries = 1; ; tries += 1) {
        await clock.sleep(NETWORK_RETRY_MS)
        try {
            await run({ redo: true })
            journal.append({
                kind: 'network_wait_ended',
                ...who,
                content: { step, tries },
            })
            return
        } catch (error) {
            if (!isTrackerNetworkFailure(error)) {
                journal.append({
                    kind: 'network_wait_ended',
                    ...who,
                    content: { step, tries },
                })
                throw error
            }
            if (clock.now() >= until) {
                journal.append({
                    kind: 'network_wait_ended',
                    ...who,
                    content: { step, tries, gave_up: true },
                })
                throw error
            }
            log(STILL_LINE)
        }
    }
}
