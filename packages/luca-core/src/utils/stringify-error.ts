/**
 * Coerce an unknown caught value into a human-readable string.
 *
 * `catch` blocks receive `unknown`, not `Error`. This is the canonical,
 * repo-wide replacement for the open-coded
 * `err instanceof Error ? err.message : String(err)` pattern: it returns the
 * `Error.message` for real errors and the `String(...)` form for anything else
 * thrown (strings, numbers, `{ code }` objects, …) so no information is lost.
 *
 * For a fixed fallback string instead of `String(err)` on non-Error values,
 * use `extractErrorMessage(err, fallback)` in luca-cli.
 *
 * @param err - The caught value (unknown, from a catch block).
 * @returns The error message, or the stringified value when it is not an Error.
 *
 * @example
 * ```typescript
 * try {
 *   await risky()
 * } catch (err) {
 *   return { isError: true, message: stringifyError(err) }
 * }
 * ```
 */
export function stringifyError(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}
