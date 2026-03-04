"use client";

import { useAtom } from "jotai";

import { sidebarOpenAtom } from "~/stores/sidebar";
import { StatusIndicator } from "~/components/shared/status-indicator";

/**
 * Top header bar with sidebar toggle and session status.
 */
export function Header() {
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <span className="font-mono text-sm">{isOpen ? "<<" : ">>"}</span>
        </button>
        <StatusIndicator />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          SSE Connected
        </span>
        <span className="h-2 w-2 rounded-full bg-success" />
      </div>
    </header>
  );
}
