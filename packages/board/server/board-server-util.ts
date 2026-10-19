/** Small things the board server's modules share. */

/** The run phases after which no engine is needed. */
export const OVER_PHASES = new Set(['done', 'refused', 'nothing_to_do'])

export const errorText = ({ error }: { error: unknown }): string =>
    error instanceof Error ? error.message : String(error)
