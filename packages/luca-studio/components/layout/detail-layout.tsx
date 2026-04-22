import type { ReactNode } from 'react'

/**
 * Two-column detail view with main content and sidebar.
 */
export function DetailLayout({
    main,
    sidebar,
}: {
    main: ReactNode
    sidebar: ReactNode
}) {
    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">{main}</div>
            <div className="flex flex-col gap-6">{sidebar}</div>
        </div>
    )
}
