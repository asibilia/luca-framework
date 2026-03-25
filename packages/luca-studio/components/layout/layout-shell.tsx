"use client";

import type { ReactNode } from "react";

import { useAtomValue } from "jotai";

import { NavRail } from "~/components/layout/nav-rail";
import { DetailPanel } from "~/components/layout/detail-panel";
import { useConfigHydration } from "~/hooks/use-config-hydration";
import {
  layoutContextAtom,
  detailPanelStateAtom,
  detailPanelWidthAtom,
  navRailWidthAtom,
} from "~/stores/layout";
import { cn } from "~/lib/utils";

/**
 * Three-zone CSS Grid layout shell for Luca Studio.
 *
 * Composes NavRail (left) + content slot (center) + DetailPanel (right)
 * into a `grid-template-columns: auto 1fr auto` grid.
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

  const layoutContext = useAtomValue(layoutContextAtom);
  const panelState = useAtomValue(detailPanelStateAtom);
  const panelWidth = useAtomValue(detailPanelWidthAtom);
  const navWidth = useAtomValue(navRailWidthAtom);

  // Docked detail panel occupies grid space; floating/closed does not
  const isDocked = panelState === "docked";
  const isFloating = panelState === "floating";

  // Clamp detail panel width
  const clampedPanelWidth = Math.min(600, Math.max(400, panelWidth));

  // Build grid columns: NavRail | Content | DetailPanel (if docked)
  const gridColumns = isDocked
    ? `${navWidth}px 1fr ${clampedPanelWidth}px`
    : `${navWidth}px 1fr 0px`;

  return (
    <div
      className="relative grid h-screen w-full overflow-hidden"
      style={{ gridTemplateColumns: gridColumns }}
    >
      {/* Zone A: Navigation Rail */}
      <NavRail>{navChildren}</NavRail>

      {/* Zone B: Primary Content */}
      <main
        className={cn(
          "relative flex h-full flex-col overflow-hidden",
          layoutContext === "dashboard" && "mx-auto w-full max-w-7xl",
        )}
      >
        {children}
      </main>

      {/* Zone C: Detail Panel */}
      {isDocked && (
        <DetailPanel title={detailTitle}>{detailChildren}</DetailPanel>
      )}

      {/* Floating overlay (not part of grid flow) */}
      {isFloating && (
        <DetailPanel title={detailTitle}>{detailChildren}</DetailPanel>
      )}
    </div>
  );
}
