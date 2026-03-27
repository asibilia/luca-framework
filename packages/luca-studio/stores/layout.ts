import type { ReactNode } from "react";

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * Layout context determines zone sizing and adaptation behavior.
 *
 * - "dashboard": NavRail expanded, content centered at max-w-7xl, detail closed
 * - "editor": NavRail collapsed, content full bleed, detail docked
 * - "browser": NavRail expanded, content flexible, detail floating
 */
export type LayoutContext = "dashboard" | "editor" | "browser";

/**
 * Detail panel display state.
 *
 * - "closed": panel hidden
 * - "floating": absolute overlay on right, does not push content
 * - "docked": part of grid flow, pushes content left, resizable
 */
export type DetailPanelState = "closed" | "floating" | "docked";

// ---------------------------------------------------------------------------
// Persisted atoms (survive navigation and reload via localStorage)
// ---------------------------------------------------------------------------

/**
 * Whether the NavRail is pinned in expanded state (240px).
 *
 * Persisted in localStorage under "luca-studio-nav-rail-expanded".
 */
export const navRailExpandedAtom = atomWithStorage<boolean>(
  "luca-studio-nav-rail-expanded",
  false,
);

/**
 * Current detail panel display state.
 *
 * Persisted in localStorage under "luca-studio-detail-panel-state".
 */
export const detailPanelStateAtom = atomWithStorage<DetailPanelState>(
  "luca-studio-detail-panel-state",
  "closed",
);

/**
 * Detail panel width in pixels. Clamped to 400-600 range by consumers.
 *
 * Persisted in localStorage under "luca-studio-detail-panel-width".
 */
export const detailPanelWidthAtom = atomWithStorage<number>(
  "luca-studio-detail-panel-width",
  480,
);

// ---------------------------------------------------------------------------
// Transient atoms (not persisted)
// ---------------------------------------------------------------------------

/**
 * Transient hover state for NavRail preview expansion.
 *
 * Set to true on mouse enter, false on mouse leave.
 * Not persisted — resets on reload.
 */
export const navRailHoveredAtom = atom<boolean>(false);

/**
 * Layout context driving the adaptation table.
 *
 * Pages set this atom to control NavRail/content/detail zone sizing.
 * Not persisted — defaults to "dashboard" on each navigation.
 */
export const layoutContextAtom = atom<LayoutContext>("dashboard");

// ---------------------------------------------------------------------------
// Keyboard Shortcut Atoms
// ---------------------------------------------------------------------------

/**
 * Whether the command palette overlay is open.
 *
 * Toggled by Cmd+K shortcut and Escape key. Not persisted.
 */
export const commandPaletteOpenAtom = atom<boolean>(false);

/**
 * Whether the compiled preview overlay/panel is open.
 *
 * Toggled by Cmd+Shift+P shortcut. Not persisted.
 */
export const compiledPreviewOpenAtom = atom<boolean>(false);

/**
 * Entity sidebar content for build pages (Agents, Skills, Rules).
 *
 * Build pages set this atom on mount with their entity tree JSX and
 * clear it on unmount. When non-null, LayoutShell inserts a fixed-width
 * sidebar column between the NavRail and the main content area.
 *
 * Not persisted -- resets to null on navigation.
 */
export const entitySidebarAtom = atom<ReactNode | null>(null);

/**
 * Internal storage for the global save callback.
 *
 * Not exported -- use `globalSaveCallbackAtom` (read) and
 * `setGlobalSaveCallbackAtom` (write) instead.
 */
const _saveCallbackAtom = atom<(() => Promise<void>) | null>(null);

/**
 * Read-only atom for the global save callback.
 *
 * Used by the keyboard shortcut hook to invoke the current page's save.
 * Returns `null` when no save function is registered.
 */
export const globalSaveCallbackAtom = atom((get) => get(_saveCallbackAtom));

/**
 * Write atom to register/unregister the global save callback.
 *
 * Pages with save functionality register their save function on mount
 * and pass `null` on unmount. Uses a write atom to avoid the
 * SetStateAction ambiguity that occurs when storing functions in
 * basic atoms.
 *
 * @example
 * ```ts
 * const setSaveCallback = useSetAtom(setGlobalSaveCallbackAtom);
 * useEffect(() => {
 *   setSaveCallback(() => save());
 *   return () => setSaveCallback(null);
 * }, [save, setSaveCallback]);
 * ```
 */
export const setGlobalSaveCallbackAtom = atom(
  null,
  (_get, set, callback: (() => Promise<void>) | null) => {
    set(_saveCallbackAtom, callback ? () => callback : null);
  },
);

// ---------------------------------------------------------------------------
// Derived atoms
// ---------------------------------------------------------------------------

/**
 * Computed NavRail width based on expanded/hovered state.
 *
 * Returns 240 when expanded or hovered, 48 otherwise.
 * Read-only derived atom.
 */
export const navRailWidthAtom = atom<number>((get) => {
  const expanded = get(navRailExpandedAtom);
  const hovered = get(navRailHoveredAtom);
  return expanded || hovered ? 240 : 48;
});
