import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { EngineSettings } from '../shared/engine-settings'

/**
 * Where the plugin keeps its usage lines for the engine:
 * `$LUCA_BOARD_STATE_DIR/usage-lines.json`, else
 * `~/.local/state/luca/board/usage-lines.json`. Every run reads it directly,
 * so runs started from the command line obey the lines too.
 */
export const defaultUsageLinesPath = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string =>
    join(
        env.LUCA_BOARD_STATE_DIR || join(home_dir, '.local/state/luca/board'),
        'usage-lines.json'
    )

/**
 * Writes the usage lines from the plugin's settings to `path`, atomically
 * (a temp file, then a rename), so a run never reads half a file.
 */
export const writeUsageLines = async ({
    path,
    settings,
}: {
    path: string
    settings: Pick<EngineSettings, 'weekly_line' | 'five_hour_line'>
}): Promise<void> => {
    const { weekly_line, five_hour_line } = settings
    await mkdir(dirname(path), { recursive: true })
    const temp = `${path}.${process.pid}.tmp`
    await writeFile(
        temp,
        `${JSON.stringify({ weekly_line, five_hour_line }, null, 2)}\n`
    )
    await rename(temp, path)
}
