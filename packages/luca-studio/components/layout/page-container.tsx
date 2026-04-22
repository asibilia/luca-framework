import type { ReactNode } from 'react'

/**
 * Reusable page wrapper matching shadcn dashboard-01 content area.
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
    title: string
    subtitle?: string
    actions?: ReactNode
    children: ReactNode
}) {
    return (
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="flex items-start justify-between px-4 lg:px-6">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="mt-1 text-sm text-muted-foreground">
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && (
                    <div className="flex items-center gap-2">{actions}</div>
                )}
            </div>
            <div className="px-4 lg:px-6">{children}</div>
        </div>
    )
}
