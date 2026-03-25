/**
 * ETag computation utility for optimistic concurrency control.
 *
 * Produces a short, deterministic fingerprint of file contents. The value
 * is a 16-character hex substring of the full SHA-256 digest — compact
 * enough for HTTP ETag headers while still providing negligible collision
 * probability for configuration-sized files.
 *
 * Uses Bun's built-in `CryptoHasher` for native-speed hashing.
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
export function computeETag(content: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex").substring(0, 16);
}
