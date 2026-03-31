/**
 * Recursively freeze an object and all nested objects.
 *
 * Unlike Object.freeze(), which only freezes top-level properties,
 * deepFreeze walks the entire object graph so that nested objects
 * (e.g. frontmatter, sections[]) are also immutable.
 *
 * @param obj - The object to deeply freeze
 * @returns The same object, now deeply frozen
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    // Skip getter/setter properties — accessing them on a frozen object
    // may trigger internal mutations (e.g., Zod v4 lazy shape getters)
    if (!desc || "get" in desc || "set" in desc) continue;
    const value = desc.value;
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}
