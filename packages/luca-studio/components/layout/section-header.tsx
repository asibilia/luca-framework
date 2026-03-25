import type { ReactNode } from "react";

/**
 * Section title with optional action buttons.
 */
export function SectionHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
