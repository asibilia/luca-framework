import { atom } from "jotai";

// ---------------------------------------------------------------------------
// Layer 2b -- Settings Page Atoms
//
// Separate from config-atoms.ts to avoid coupling structured config editing
// with raw JSON string editing. The raw config draft is a string (the JSON
// text itself) while configDraftAtom holds a parsed object.
// ---------------------------------------------------------------------------

/**
 * Raw JSON string draft for the Settings page config editor.
 *
 * Holds the full config.json as a string for CodeMirror to edit directly.
 * `null` until the user opens the raw editor (lazy initialization).
 *
 * Distinct from `configDraftAtom` (which holds a parsed object for
 * structured editing on the Config page).
 */
export const rawConfigDraftAtom = atom<string | null>(null);
