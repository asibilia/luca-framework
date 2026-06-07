/**
 * GET /api/entities/skills/[name]
 *
 * Returns the full parsed config for a single skill, including raw config
 * text and metadata needed for round-trip editing. Includes an ETag header
 * computed from the source file contents.
 *
 * PUT /api/entities/skills/[name]
 *
 * Writes a skill config back to disk via the ts-round-trip write path.
 * Accepts `{ rawConfigText, metadata }` in the request body. Supports
 * optimistic concurrency via If-Match / ETag (409 on conflict).
 *
 * Error responses:
 * - 400: Invalid JSON body
 * - 404: Skill not found
 * - 409: ETag mismatch (stale write)
 * - 422: Malformed entity or missing fields
 * - 500: Unexpected write failure
 */
import { createEntityDetailHandler } from '~/lib/entity-route-helpers'

const handlers = createEntityDetailHandler('skills')

export const GET = handlers.GET
export const PUT = handlers.PUT
