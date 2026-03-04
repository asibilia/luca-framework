import type { ReactNode } from "react";

/**
 * Reusable page wrapper with title and optional actions.
 *
 * @param title - Page title displayed in the header
 * @param subtitle - Optional subtitle/description
 * @param actions - Optional action buttons rendered in the header
 * @param children - Page content
 */
export function PageContainer({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
