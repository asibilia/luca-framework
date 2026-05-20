import { LUCA_DIR_ROOT } from '../constants.ts'
import { PhaseSlugSchema, ReviewerNameSchema } from '../schemas.ts'

/**
 * Build the path for an audit file written by a reviewer during REVIEWING.
 *
 * @param slug     - Phase slug
 * @param reviewer - Reviewer name (kebab-case), e.g. "code-review"
 */
export function auditPathFor(slug: string, reviewer: string): string {
    PhaseSlugSchema.parse(slug)
    ReviewerNameSchema.parse(reviewer)
    return `${LUCA_DIR_ROOT}/phases/${slug}/audits/${reviewer}.md`
}
