"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAtom } from "jotai";
import {
  Activity,
  LayoutDashboard,
  GitBranch,
  RefreshCw,
  Shield,
  ListTodo,
  Brain,
  Scale,
  Bot,
  DollarSign,
  GitPullRequest,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { sidebarOpenAtom } from "~/stores/sidebar";
import { NAV_ITEMS } from "~/lib/constants";
import { useMediaQuery } from "~/hooks/use-media-query";

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  LayoutDashboard,
  GitBranch,
  RefreshCw,
  Shield,
  ListTodo,
  Brain,
  Scale,
  Bot,
  DollarSign,
  GitPullRequest,
  StickyNote,
};

/**
 * Sidebar navigation component.
 *
 * Renders the navigation items defined in constants.
 * Highlights the active route. Collapsible via Jotai atom.
 * Auto-collapses below 768px viewport width.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Auto-collapse sidebar on mobile, auto-expand on desktop
  useEffect(() => {
    setIsOpen(isDesktop);
  }, [isDesktop, setIsOpen]);

  if (!isOpen) return null;

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-6 w-6 rounded bg-accent" />
        <span className="font-mono text-sm font-bold tracking-tight">
          luca-observer
        </span>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="sr-only focus:not-sr-only focus:rounded focus:bg-muted focus:p-2 focus:font-mono focus:text-sm focus:text-muted-foreground"
        aria-label="Toggle sidebar"
      >
        Skip to navigation
      </button>
      <nav
        className="flex flex-1 flex-col gap-0.5 p-2"
        role="navigation"
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
                isActive
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {(() => {
                const Icon = ICON_MAP[item.icon];
                return Icon ? (
                  <Icon className="h-4 w-4 shrink-0 opacity-60" />
                ) : (
                  <span className="font-mono text-xs opacity-60">
                    {item.icon}
                  </span>
                );
              })()}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <p className="font-mono text-xs text-muted-foreground">v0.1.0</p>
      </div>
    </aside>
  );
}
