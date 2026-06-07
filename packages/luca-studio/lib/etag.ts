/**
 * ETag computation utility for optimistic concurrency control.
 *
 * Produces a short, deterministic fingerprint of file contents. The value
 * is a 16-character hex substring of the full SHA-256 digest — compact
 * enough for HTTP ETag headers while still providing negligible collision
 * probability for configuration-sized files.
 *
 * Uses Node.js `node:crypto` for hashing (compatible with Next.js API routes).
 *
 * @param content - The string content to hash.
 * @returns A 16-character lowercase hex string.
 *
 * @example
 * ```typescript
 * import { computeETag } from "~/lib/etag";
 *
 * const etag = computeETag('{"key":"value"}');
 * // => "a1b2c3d4e5f67890"  (deterministic for same input)
 * ```
 */
import { createHash } from 'node:crypto'

export function computeETag(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16)
}
