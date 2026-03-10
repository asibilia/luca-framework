"use client";

import { useAtom } from "jotai";
import { PanelLeftClose, PanelLeftOpen, Sun, Moon } from "lucide-react";

import { sidebarOpenAtom } from "~/stores/sidebar";
import { themeAtom } from "~/stores/theme";

/**
 * Top header bar with sidebar toggle and theme toggle.
 */
export function Header() {
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);
  const [theme, setTheme] = useAtom(themeAtom);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <header
      className="flex h-12 items-center justify-between border-b border-border bg-card px-2 md:px-4"
      role="banner"
    >
      <div className="flex items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Toggle sidebar"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded p-1 font-mono text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-pressed={theme === "dark"}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
}
