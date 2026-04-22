/**
 * Safely extract an error message from an unknown caught value.
 *
 * In TypeScript, `catch` blocks receive `unknown`, not `Error`. This utility
 * provides a concise, type-safe way to extract a human-readable message from
 * any caught value without manual `instanceof` checks at every call site.
 *
 * @param err - The caught value (unknown type from catch blocks).
 * @param fallback - Message to return if err is not an Error instance.
 * @returns The error message string.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   const msg = extractErrorMessage(err, "Operation failed");
 *   console.error(msg);
 * }
 * ```
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback
}
