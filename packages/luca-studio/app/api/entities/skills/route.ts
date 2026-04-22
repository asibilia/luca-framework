/**
 * GET /api/entities/skills
 *
 * Returns an array of skill summaries with parsed frontmatter metadata.
 * Scans both `src/skills/general/` and `src/skills/luca/` directories.
 *
 * Response shape: `{ data: EntitySummary[] }`
 */
import { createEntityListHandler } from '~/lib/entity-route-helpers'

export const GET = createEntityListHandler('skills')
