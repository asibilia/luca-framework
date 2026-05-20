import { LUCA_DIR_ROOT } from '../constants.ts'
import { SemverTagSchema } from '../schemas.ts'

/**
 * Build the path for a milestone-close backlog snapshot.
 *
 * @param versionTag - SemVer-prefixed tag, e.g. "v12.0.0"
 * @param format     - "json" (machine-readable) or "md" (human-readable)
 */
export function backlogSnapshotPathFor(
    versionTag: string,
    format: 'json' | 'md'
): string {
    SemverTagSchema.parse(versionTag)
    return `${LUCA_DIR_ROOT}/milestones/${versionTag}-backlog-snapshot.${format}`
}
