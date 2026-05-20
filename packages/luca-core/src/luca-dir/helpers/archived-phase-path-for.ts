import { LUCA_DIR_ROOT } from '../constants.ts'
import { PhaseSlugSchema } from '../schemas.ts'

/**
 * Build the path for an archived phase directory.
 */
export function archivedPhasePathFor(slug: string): string {
    PhaseSlugSchema.parse(slug)
    return `${LUCA_DIR_ROOT}/archive/${slug}`
}
