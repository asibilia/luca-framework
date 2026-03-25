import { atom } from "jotai";

// ---------------------------------------------------------------------------
// Layer 3 -- Dirty Tracking
//
// Tracks divergence between draft atoms and their server state counterparts.
// Entity keys follow a convention:
//   - "config"              for configDraftAtom
//   - "routing"             for routingDraftAtom
//   - "agent:<name>"        for agentDraftAtom(name)
//   - "skill:<name>"        for skillDraftAtom(name)
//   - "rule:<name>"         for ruleDraftAtom(name)
//
// The dirty set and validation errors together determine whether a save
// operation is permitted (via `canSaveAtom`).
// ---------------------------------------------------------------------------

/**
 * Set of entity keys that have unsaved changes.
 *
 * An entity key is added when its draft diverges from the server state and
 * removed when the draft is saved or reverted.
 *
 * @example
 * ```ts
 * const [dirtySet] = useAtom(dirtySetAtom);
 * dirtySet.has("config"); // true if config draft differs from server
 * ```
 */
export const dirtySetAtom = atom<Set<string>>(new Set<string>());

/**
 * Map of entity keys to their validation error messages.
 *
 * When a draft edit introduces invalid data (e.g., fails Zod validation),
 * the errors are recorded here. Keys with empty arrays are treated as valid.
 *
 * @example
 * ```ts
 * const [errors] = useAtom(validationErrorsAtom);
 * errors.get("agent:lu-router"); // ["name is required"] or undefined
 * ```
 */
export const validationErrorsAtom = atom<Map<string, string[]>>(new Map());

/**
 * Derived read-only atom: `true` when a save operation is permitted.
 *
 * Save is permitted when:
 * 1. At least one entity key is dirty (`dirtySetAtom.size > 0`)
 * 2. No dirty key has validation errors
 *
 * This is the single source of truth for enabling/disabling save buttons.
 */
export const canSaveAtom = atom((get) => {
  const dirtySet = get(dirtySetAtom);
  if (dirtySet.size === 0) return false;

  const errors = get(validationErrorsAtom);
  for (const key of dirtySet) {
    const keyErrors = errors.get(key);
    if (keyErrors && keyErrors.length > 0) return false;
  }

  return true;
});

// ---------------------------------------------------------------------------
// Helper Write Atoms
//
// Convenience atoms that encapsulate common dirty-tracking mutations. Using
// write atoms (rather than raw `set` calls) keeps mutation logic centralised
// and makes it easy to add side-effects later (e.g., analytics, logging).
// ---------------------------------------------------------------------------

/**
 * Write atom that adds a key to the dirty set.
 *
 * @example
 * ```ts
 * const [, markDirty] = useAtom(markDirtyAtom);
 * markDirty("agent:lu-router");
 * ```
 */
export const markDirtyAtom = atom(null, (get, set, key: string) => {
  const prev = get(dirtySetAtom);
  const next = new Set(prev);
  next.add(key);
  set(dirtySetAtom, next);
});

/**
 * Write atom that removes a key from the dirty set.
 *
 * Also clears any validation errors for that key.
 *
 * @example
 * ```ts
 * const [, markClean] = useAtom(markCleanAtom);
 * markClean("agent:lu-router");
 * ```
 */
export const markCleanAtom = atom(null, (get, set, key: string) => {
  const prevDirty = get(dirtySetAtom);
  const nextDirty = new Set(prevDirty);
  nextDirty.delete(key);
  set(dirtySetAtom, nextDirty);

  const prevErrors = get(validationErrorsAtom);
  if (prevErrors.has(key)) {
    const nextErrors = new Map(prevErrors);
    nextErrors.delete(key);
    set(validationErrorsAtom, nextErrors);
  }
});

/**
 * Write atom that sets validation errors for a specific entity key.
 *
 * Pass an empty array to clear errors for that key.
 *
 * @example
 * ```ts
 * const [, setErrors] = useAtom(setValidationErrorsAtom);
 * setErrors({ key: "config", errors: ["gates.premortem must be boolean"] });
 * ```
 */
export const setValidationErrorsAtom = atom(
  null,
  (get, set, payload: { key: string; errors: string[] }) => {
    const prev = get(validationErrorsAtom);
    const next = new Map(prev);
    if (payload.errors.length === 0) {
      next.delete(payload.key);
    } else {
      next.set(payload.key, payload.errors);
    }
    set(validationErrorsAtom, next);
  },
);
