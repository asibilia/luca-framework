/**
 * Shared generic Map registry factory for Pi extensions.
 *
 * Provides a `createRegistry` factory function that replaces the 7
 * duplicated `new Map()` + get/set/delete/list patterns across 6
 * extensions: luca-chain, luca-tilldone, luca-query-experts,
 * luca-safety-rules, luca-teams, and luca-purpose-gating.
 *
 * Source: src/hooks/pi-extensions/__helpers/registry.ts
 */

/**
 * A typed in-memory registry backed by a Map.
 *
 * Provides get, set, delete, has, entries, values, keys, clear, and size
 * operations with consistent typing. Used by extensions that maintain
 * named entity collections (chains, loops, sessions, teams, etc.).
 *
 * @param name - Human-readable registry name (for error messages)
 * @returns Registry object with CRUD operations
 *
 * @example
 * ```typescript
 * interface LoopState {
 *   name: string;
 *   status: "running" | "passed" | "failed";
 * }
 *
 * const loops = createRegistry<LoopState>("loops");
 * loops.set("test-loop", { name: "test-loop", status: "running" });
 * const loop = loops.get("test-loop"); // LoopState | undefined
 * loops.delete("test-loop"); // true
 * ```
 */
export function createRegistry<T>(name: string): {
  /** Get an entry by key, or undefined */
  get: (key: string) => T | undefined;
  /** Set an entry by key */
  set: (key: string, value: T) => void;
  /** Delete an entry by key. Returns true if it existed. */
  delete: (key: string) => boolean;
  /** Check if a key exists */
  has: (key: string) => boolean;
  /** Get all entries as [key, value] pairs */
  entries: () => Array<[string, T]>;
  /** Get all values */
  values: () => T[];
  /** Get all keys */
  keys: () => string[];
  /** Clear all entries */
  clear: () => void;
  /** Number of entries */
  size: () => number;
  /** Registry name (for error messages) */
  name: string;
} {
  const store = new Map<string, T>();

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: T) => {
      store.set(key, value);
    },
    delete: (key: string) => store.delete(key),
    has: (key: string) => store.has(key),
    entries: () => Array.from(store.entries()),
    values: () => Array.from(store.values()),
    keys: () => Array.from(store.keys()),
    clear: () => store.clear(),
    size: () => store.size,
    name,
  };
}
