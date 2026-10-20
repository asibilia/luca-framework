/** Small things the board server's modules share. */

import type { BoardState } from '../shared/board-state'

/** The run phases after which no engine is needed. */
export const OVER_PHASES = new Set(['done', 'refused', 'nothing_to_do'])

/** Whether a run may still need an engine: not ended, not over. */
export const needsEngine = ({ state }: { state: BoardState }): boolean =>
    state.run.engine_ended === null && !OVER_PHASES.has(state.run.phase)

export const errorText = ({ error }: { error: unknown }): string =>
    error instanceof Error ? error.message : String(error)
