/**
 * A run with no sign of life (#635): its engine is gone (the plugin's
 * process check found none, for a run it didn't start), or its live file
 * went stale (written more than a minute ago). Its busy cards say so, with
 * a flat red heartbeat, and their timers stop at the last sign of life.
 */
import {
    elapsedText,
    liveIsFresh,
    needsEngine,
    type BoardState,
} from '../shared/board-state'

/**
 * Why the run shows no sign of life, in words, and the time of its last
 * sign (the live file's write, else the latest record): `null` while the
 * engine is alive, or when the run needs none.
 *
 * @example
 * noLife({ state, now }) // { text: 'no sign of life for 1m 10s', at: 1790000000000 }
 */
export const noLife = ({
    state,
    now,
}: {
    state: BoardState
    now: number
}): { text: string; at: number } | null => {
    if (!needsEngine({ state })) return null
    const written = state.live_written_at
    if (state.engine_gone) {
        const at = Date.parse(
            written ??
                state.latest_at ??
                state.run.last_time ??
                state.run.started_at
        )
        return {
            text: `engine not running · last sign of life ${elapsedText({ ms: now - at })} ago`,
            at,
        }
    }
    if (written === null || liveIsFresh({ written_at: written, now })) {
        return null
    }
    const at = Date.parse(written)
    return { text: `no sign of life for ${elapsedText({ ms: now - at })}`, at }
}
