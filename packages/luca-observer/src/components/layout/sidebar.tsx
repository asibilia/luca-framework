"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAtom } from "jotai";

import { sidebarOpenAtom } from "~/stores/sidebar";
import { NAV_ITEMS } from "~/lib/constants";

/**
 * Sidebar navigation component.
 *
 * Renders the navigation items defined in constants.
 * Highlights the active route. Collapsible via Jotai atom.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [isOpen] = useAtom(sidebarOpenAtom);

  if (!isOpen) return null;

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-6 w-6 rounded bg-accent" />
        <span className="font-mono text-sm font-bold tracking-tight">
          luca-observer
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-mono text-xs opacity-60">{item.icon}</span>
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
