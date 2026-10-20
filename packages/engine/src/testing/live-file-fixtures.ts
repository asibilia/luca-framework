import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LiveFileSchema, type LiveFile } from '../core/live-file'

/**
 * The run's live file (#628) as the engine's tests read it: `live.json`
 * parsed with the writer's own schema (`core/live-file.ts`), never cast, so
 * a field the writer renames or drops fails the test that reads it.
 * The board reads the same file with its own, more forgiving schemas
 * (`packages/board/server/live-file.ts`).
 */

export {
    LiveFileSchema,
    type LiveAgent,
    type LiveFile,
    type LiveHelper,
    type LiveWait,
} from '../core/live-file'

/** The live file of the practice run (`run-1`) in `dir`. */
export const liveFileIn = (dir: string): string =>
    join(dir, 'runs', 'run-1', 'live.json')

/**
 * The live file at `file`, or `null` while there is none. A file that is
 * there but doesn't fit `LiveFileSchema` throws, naming the field.
 */
export const readLive = (file: string): LiveFile | null => {
    let json: unknown
    try {
        json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
        return null
    }
    return LiveFileSchema.parse(json)
}

/** The live file once `until` holds for it, or `null` after `ms`. */
export const waitForLive = async ({
    file,
    until,
    ms = 3000,
}: {
    file: string
    until: (live: LiveFile) => boolean
    ms?: number
}): Promise<LiveFile | null> => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        const live = readLive(file)
        if (live !== null && until(live)) return live
        await Bun.sleep(20)
    }
    return null
}
