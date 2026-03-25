/**
 * GET /api/entities/agents
 *
 * Returns an array of agent summaries with parsed frontmatter metadata.
 * Scans both `src/agents/general/` and `src/agents/luca/` directories.
 *
 * Response shape: `{ data: EntitySummary[] }`
 */
import { createEntityListHandler } from "~/lib/entity-route-helpers";

export const GET = createEntityListHandler("agents");
