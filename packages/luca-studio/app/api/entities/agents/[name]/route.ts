/**
 * GET /api/entities/agents/[name]
 *
 * Returns the full parsed config for a single agent, including raw config
 * text and metadata needed for round-trip editing. Includes an ETag header
 * computed from the source file contents.
 *
 * PUT /api/entities/agents/[name]
 *
 * Writes an agent config back to disk via the ts-round-trip write path.
 * Accepts `{ rawConfigText, metadata }` in the request body. Supports
 * optimistic concurrency via If-Match / ETag (409 on conflict).
 *
 * Error responses:
 * - 400: Invalid JSON body
 * - 404: Agent not found
 * - 409: ETag mismatch (stale write)
 * - 422: Malformed entity or missing fields
 * - 500: Unexpected write failure
 */
import { createEntityDetailHandler } from "~/lib/entity-route-helpers";

const handlers = createEntityDetailHandler("agents");

export const GET = handlers.GET;
export const PUT = handlers.PUT;
