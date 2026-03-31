/**
 * XState snapshot value normalization utilities.
 *
 * Provides stable string representations of the XState `snapshot.value`
 * field, which may be either a flat string ("executing") or a compound
 * object ({ executing: "reviewing" }) when compound sub-states are active.
 *
 * **Phase 1 (current):** All states are flat strings, so both functions
 * return identical results. Zero behavior change.
 *
 * **Phase 2 (future):** When compound sub-states are introduced for the
 * `executing` state, `resolveStateValue()` will still return the top-level
 * state name ("executing"), while `resolveStatePath()` will return the full
 * dot-path ("executing.reviewing"). This allows call sites to opt-in to
 * finer-grained enforcement without a breaking change.
 *
 * @module luca-state/resolve-state-value
 */

/**
 * Normalize an XState snapshot `value` to the top-level state name.
 *
 * Handles both flat string values and compound state objects:
 * - `"executing"` → `"executing"`
 * - `{ executing: "reviewing" }` → `"executing"`
 * - `null` / `undefined` / unexpected types → `"idle"`
 *
 * @param value - The raw `snapshot.value` from an XState actor
 * @returns The top-level state name as a plain string
 *
 * @example
 * ```typescript
 * import { resolveStateValue } from "./__helpers/resolve-state-value";
 *
 * // Flat state (Phase 1 — current behavior)
 * resolveStateValue("executing");   // → "executing"
 * resolveStateValue("idle");        // → "idle"
 *
 * // Compound state (Phase 2 — forward-compatible)
 * resolveStateValue({ executing: "reviewing" }); // → "executing"
 * ```
 */
export function resolveStateValue(value: unknown): string {
  if (typeof value === "string") {
    return value || "idle";
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) {
      return keys[0] as string;
    }
  }
  return "idle";
}

/**
 * Extract the full dot-path from an XState snapshot `value`.
 *
 * For flat strings, this is identical to `resolveStateValue()`.
 * For compound state objects, this returns the full path joined by dots:
 * - `"executing"` → `"executing"`
 * - `{ executing: "reviewing" }` → `"executing.reviewing"`
 * - `null` / `undefined` / unexpected types → `"idle"`
 *
 * Used by the enforcement hook factory to pass finer-grained position
 * data to `computePipelinePosition()` when `use_computed_position` is true.
 *
 * @param value - The raw `snapshot.value` from an XState actor
 * @returns The full dot-separated state path as a plain string
 *
 * @example
 * ```typescript
 * import { resolveStatePath } from "./__helpers/resolve-state-value";
 *
 * // Flat state (Phase 1 — current behavior)
 * resolveStatePath("executing");   // → "executing"
 * resolveStatePath("idle");        // → "idle"
 *
 * // Compound state (Phase 2 — forward-compatible)
 * resolveStatePath({ executing: "reviewing" }); // → "executing.reviewing"
 * ```
 */
export function resolveStatePath(value: unknown): string {
  if (typeof value === "string") {
    return value || "idle";
  }
  if (value !== null && typeof value === "object") {
    const parts: string[] = [];
    let current: unknown = value;
    while (
      current !== null &&
      typeof current === "object" &&
      Object.keys(current as Record<string, unknown>).length > 0
    ) {
      const key = Object.keys(current as Record<string, unknown>)[0] as string;
      parts.push(key);
      current = (current as Record<string, unknown>)[key];
    }
    if (parts.length > 0) {
      return parts.join(".");
    }
  }
  return "idle";
}
