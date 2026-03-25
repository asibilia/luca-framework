"use client";

/**
 * Static status indicator placeholder.
 *
 * Displays "Idle" until rebuilt with MuninnDB data in Phase 04+.
 */
export function StatusIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      Idle
    </span>
  );
}
