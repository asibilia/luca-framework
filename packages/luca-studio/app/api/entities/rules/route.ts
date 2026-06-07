/**
 * GET /api/entities/rules
 *
 * Returns an array of rule summaries with parsed frontmatter metadata.
 * Scans `src/rules/general/` and all profile subdirectories under
 * `src/rules/profiles/` (e.g. typescript/, go/, python/, rust/).
 *
 * Response shape: `{ data: EntitySummary[] }`
 */
import { createEntityListHandler } from '~/lib/entity-route-helpers'

export const GET = createEntityListHandler('rules')
