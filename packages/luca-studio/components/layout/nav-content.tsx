"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Activity,
  Bot,
  Brain,
  Hexagon,
  LayoutDashboard,
  Settings,
  Shield,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { NAV_GROUPS } from "~/lib/constants";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/**
 * Icon map for navigation items.
 *
 * Maps the string icon name from NAV_GROUPS to a Lucide icon component.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Bot,
  Brain,
  Hexagon,
  LayoutDashboard,
  Settings,
  Shield,
  SlidersHorizontal,
  Workflow,
};

/**
 * Navigation content rendered inside the NavRail.
 *
 * Renders grouped navigation items from NAV_GROUPS with:
 * - Brand header (Hexagon icon + "Luca Studio" text)
 * - Group headers (non-clickable uppercase labels, hidden when collapsed)
 * - Navigation items with icon + label (label hidden when collapsed)
 * - Active page indicator (left border accent + background highlight)
 *
 * Reads the NavRail's `data-expanded` attribute via the parent `group/rail`
 * CSS class to toggle between collapsed (icon-only) and expanded (icon + label) states.
 */
export function NavContent() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1">
      {/* Brand header */}
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2 px-3 py-3",
          "text-foreground transition-colors hover:text-foreground/80",
        )}
      >
        <Hexagon className="size-5 shrink-0" />
        <span className="truncate text-sm font-semibold opacity-0 transition-opacity duration-200 group-data-[expanded=true]/rail:opacity-100">
          Luca Studio
        </span>
      </Link>

      {/* Navigation groups */}
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {/* Group header -- hidden when collapsed */}
          <span className="px-3 pb-1 pt-3 font-mono text-[10px] font-medium tracking-widest text-muted-foreground/60 opacity-0 transition-opacity duration-200 group-data-[expanded=true]/rail:opacity-100">
            {group.label}
          </span>

          {/* Group items */}
          {group.items.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = ICON_MAP[item.icon];

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md px-3 py-2",
                      "text-sm text-muted-foreground transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive && [
                        "bg-accent/50 text-foreground",
                        "before:absolute before:left-0 before:top-1 before:h-[calc(100%-8px)] before:w-0.5 before:rounded-full before:bg-primary",
                      ],
                    )}
                  >
                    {Icon ? (
                      <Icon className="size-4 shrink-0" />
                    ) : (
                      <span className="flex size-4 shrink-0 items-center justify-center font-mono text-[10px]">
                        {item.icon.charAt(0)}
                      </span>
                    )}
                    <span className="truncate opacity-0 transition-opacity duration-200 group-data-[expanded=true]/rail:opacity-100">
                      {item.label}
                    </span>
                  </Link>
                </TooltipTrigger>
                {/* Tooltip only visible when collapsed */}
                <TooltipContent
                  side="right"
                  className="group-data-[expanded=true]/rail:hidden"
                >
                  <span className="text-xs">{item.label}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
