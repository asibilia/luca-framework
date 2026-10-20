/** Small things the board server's modules share. */

export const errorText = ({ error }: { error: unknown }): string =>
    error instanceof Error ? error.message : String(error)
