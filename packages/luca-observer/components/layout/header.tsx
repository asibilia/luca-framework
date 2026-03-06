"use client";

import { useAtom } from "jotai";
import { useSpacetimeDB } from "spacetimedb/react";

import { sidebarOpenAtom } from "~/stores/sidebar";
import { themeAtom } from "~/stores/theme";
import { StatusIndicator } from "~/components/shared/status-indicator";

/**
 * Top header bar with sidebar toggle, theme toggle, and connection status.
 */
export function Header() {
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const { isActive, connectionError } = useSpacetimeDB();

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const connectionLabel = connectionError
    ? "Disconnected"
    : isActive
      ? "SpacetimeDB"
      : "Connecting...";

  const dotColor = connectionError
    ? "bg-destructive"
    : isActive
      ? "bg-success"
      : "bg-warning";

  return (
    <header
      className="flex h-12 items-center justify-between border-b border-border bg-card px-2 md:px-4"
      role="banner"
    >
      <div className="flex items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          aria-label="Toggle sidebar"
          aria-expanded={isOpen}
        >
          <span className="font-mono text-sm">{isOpen ? "<<" : ">>"}</span>
        </button>
        <StatusIndicator />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded p-1 font-mono text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-pressed={theme === "dark"}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
          {connectionLabel}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${dotColor}`}
          aria-hidden="true"
        />
      </div>
    </header>
  );
}
