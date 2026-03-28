"use client";

import type { ReactNode } from "react";

import { useAtomValue } from "jotai";

import { CommandPalette } from "~/components/layout/command-palette";
import { NavRail } from "~/components/layout/nav-rail";
import { DetailPanel } from "~/components/layout/detail-panel";
import { useConfigHydration } from "~/hooks/use-config-hydration";
import { useKeyboardShortcuts } from "~/hooks/use-keyboard-shortcuts";
import {
  layoutContextAtom,
  detailPanelStateAtom,
  detailPanelWidthAtom,
  entitySidebarAtom,
  navRailWidthAtom,
} from "~/stores/layout";
import { cn } from "~/lib/utils";

/**
 * CSS Grid layout shell for Luca Studio.
 *
 * Composes NavRail (left) + optional entity sidebar + content slot (center) +
 * DetailPanel (right) into a responsive grid. When an entity sidebar is
 * present (build pages), the grid expands to 4 columns; otherwise 3 columns.
 *
 * The entity sidebar is driven by `entitySidebarAtom` -- build pages
 * (Agents, Skills, Rules) set this atom on mount with their entity tree JSX.
 *
 * Reads `layoutContextAtom` to apply adaptation:
 * - **dashboard**: NavRail expanded (240px), content max-w-7xl centered, detail closed
 * - **editor**: NavRail collapsed (48px), content full bleed, detail docked
 * - **browser**: NavRail expanded (240px), content flexible, detail floating
 *
 * @param children - Primary content rendered in the center zone
 * @param navChildren - Navigation content passed to NavRail as children
 * @param detailChildren - Content rendered inside the DetailPanel
 * @param detailTitle - Optional title for the DetailPanel header
 */
export function LayoutShell({
  children,
  navChildren,
  detailChildren,
  detailTitle,
}: {
  children: ReactNode;
  navChildren?: ReactNode;
  detailChildren?: ReactNode;
  detailTitle?: string;
}) {
  // Hydrate configAtom from the server on app mount (runs once)
  useConfigHydration();

  // Register centralized keyboard shortcuts (Cmd+K, Cmd+S, etc.)
  useKeyboardShortcuts();

  const layoutContext = useAtomValue(layoutContextAtom);
  const panelState = useAtomValue(detailPanelStateAtom);
  const panelWidth = useAtomValue(detailPanelWidthAtom);
  const entitySidebar = useAtomValue(entitySidebarAtom);
  const navWidth = useAtomValue(navRailWidthAtom);

  // Docked detail panel occupies grid space; floating/closed does not
  const isDocked = panelState === "docked";
  const isFloating = panelState === "floating";

  // Clamp detail panel width
  const clampedPanelWidth = Math.min(600, Math.max(400, panelWidth));

  // In editor context, NavRail forces 48px regardless of expanded/hovered state.
  // Mirror that here so the grid column width matches the rail's actual width.
  const effectiveNavWidth = layoutContext === "editor" ? 48 : navWidth;

  // Entity sidebar width (fixed 260px when present)
  const entitySidebarCol = entitySidebar ? "260px" : "";

  // Build grid columns: NavRail | [EntitySidebar] | Content | DetailPanel (if docked)
  const detailCol = isDocked ? `${clampedPanelWidth}px` : "0px";
  const gridColumns = entitySidebar
    ? `${effectiveNavWidth}px ${entitySidebarCol} 1fr ${detailCol}`
    : `${effectiveNavWidth}px 1fr ${detailCol}`;

  return (
    <div
      className="relative grid h-screen w-full overflow-hidden"
      style={{ gridTemplateColumns: gridColumns }}
    >
      {/* Zone A: Navigation Rail */}
      <NavRail>{navChildren}</NavRail>

      {/* Zone A.5: Entity Sidebar (build pages only) */}
      {entitySidebar && (
        <aside className="flex h-full flex-col overflow-y-auto border-r bg-muted/30">
          {entitySidebar}
        </aside>
      )}

      {/* Zone B: Primary Content */}
      <main
        className={cn(
          "relative flex h-full flex-col overflow-hidden",
          layoutContext === "dashboard" && "mx-auto w-full max-w-7xl",
        )}
      >
        {children}
      </main>

      {/* Zone C: Detail Panel (docked — occupies grid column) */}
      {isDocked && !isFloating && (
        <DetailPanel title={detailTitle}>{detailChildren}</DetailPanel>
      )}

      {/* Floating overlay (absolute positioned, not part of grid flow) */}
      {isFloating && !isDocked && (
        <DetailPanel title={detailTitle}>{detailChildren}</DetailPanel>
      )}

      {/* Command palette overlay (Cmd+K) */}
      <CommandPalette />
    </div>
  );
}
