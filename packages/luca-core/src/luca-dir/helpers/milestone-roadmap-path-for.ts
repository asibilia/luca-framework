import { LUCA_DIR_ROOT } from '../constants.ts'
import { SemverTagSchema } from '../schemas.ts'

/**
 * Build the path for a milestone roadmap snapshot.
 */
export function milestoneRoadmapPathFor(versionTag: string): string {
    SemverTagSchema.parse(versionTag)
    return `${LUCA_DIR_ROOT}/milestones/${versionTag}-roadmap.md`
}
