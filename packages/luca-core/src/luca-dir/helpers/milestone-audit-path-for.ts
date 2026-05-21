import { LUCA_DIR_ROOT } from '../constants.ts'
import { SemverTagSchema } from '../schemas.ts'

/**
 * Build the path for a milestone audit summary.
 */
export function milestoneAuditPathFor(versionTag: string): string {
    SemverTagSchema.parse(versionTag)
    return `${LUCA_DIR_ROOT}/milestones/${versionTag}-audit.md`
}
