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
