import { join } from 'node:path'

/**
 * The folder the `luca-board` plugin keeps its files in (the run registry,
 * the usage lines): `$LUCA_BOARD_STATE_DIR`, else
 * `~/.local/state/luca/board`. The same rule as the board's own, so the
 * engine reads the files the plugin writes.
 *
 * @example
 * boardStateDir({ env: process.env, home_dir: homedir() })
 * // '/Users/me/.local/state/luca/board'
 */
export const boardStateDir = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string =>
    env.LUCA_BOARD_STATE_DIR || join(home_dir, '.local/state/luca/board')
