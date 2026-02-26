/**
 * Discriminated union for operation results.
 *
 * Follows the AdapterResult<T> pattern from packages/luca-framework/src/contracts/work-tracker.ts.
 * Use this type for any function that can succeed with data or fail with an error message.
 *
 * @example
 * ```typescript
 * function parseConfig(input: string): Result<Config> {
 *   try {
 *     const data = JSON.parse(input);
 *     return { success: true, data };
 *   } catch (error) {
 *     return { success: false, error: error.message };
 *   }
 * }
 *
 * const result = parseConfig(rawInput);
 * if (result.success) {
 *   // TypeScript narrows: result.data is Config
 *   console.log(result.data);
 * } else {
 *   // TypeScript narrows: result.error is string
 *   console.error(result.error);
 * }
 * ```
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }
