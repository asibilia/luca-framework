import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { z } from 'zod'

/** The published package the engine is installed as. */
export const LUCA_PACKAGE = '@alecsibilia/luca'

/** Luca's version when the engine runs from the repo's source, not an install. */
export const DEV_VERSION = 'dev (source)'

const ManifestSchema = z.looseObject({
    name: z.string().optional().catch(undefined),
    version: z.string().min(1).optional().catch(undefined),
})

/** The `package.json` in `dir`, or `null` when there is none or it can't be read. */
const manifestIn = (dir: string): z.infer<typeof ManifestSchema> | null => {
    const file = join(dir, 'package.json')
    if (!existsSync(file)) return null
    try {
        return ManifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
        return null
    }
}

/**
 * Luca's own version: the version of the installed `@alecsibilia/luca`
 * package, found by walking up from the engine's own files (`dir`). With no
 * such package above them, as when the engine runs from the repo's source,
 * it is `DEV_VERSION`.
 *
 * @example
 * lucaVersion() // '14.0.0-alpha.3' installed, 'dev (source)' from the repo
 */
export const lucaVersion = ({
    dir = import.meta.dir,
}: { dir?: string } = {}): string => {
    for (let at = dir; ; at = dirname(at)) {
        const manifest = manifestIn(at)
        if (manifest?.name === LUCA_PACKAGE && manifest.version !== undefined) {
            return manifest.version
        }
        if (dirname(at) === at) return DEV_VERSION
    }
}
