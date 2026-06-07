'use client'

import { useState } from 'react'

/**
 * Collapsible JSON viewer for event payloads.
 */
export function JsonViewer({
    data,
    collapsed,
}: {
    data: unknown
    collapsed?: boolean
}) {
    const [isCollapsed, setIsCollapsed] = useState(collapsed ?? true)

    if (data === undefined || data === null) return null

    let json: string
    try {
        json = JSON.stringify(data, null, 2)
    } catch {
        return (
            <div className="rounded border border-destructive/50 bg-destructive/10 p-2 font-mono text-xs text-destructive">
                Unable to display JSON (circular reference or non-serializable
                value)
            </div>
        )
    }
    const lines = json.split('\n')
    const isLong = lines.length > 3

    return (
        <div className="overflow-hidden rounded border border-border">
            {isLong && (
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-expanded={!isCollapsed}
                    className="w-full border-b border-border bg-muted px-2 py-1 text-left font-mono text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    {isCollapsed ? 'Expand JSON' : 'Collapse JSON'} (
                    {lines.length} lines)
                </button>
            )}
            <pre className="overflow-x-auto bg-background p-2 font-mono text-xs text-muted-foreground">
                {isCollapsed && isLong
                    ? `${lines.slice(0, 3).join('\n')}\n  ...`
                    : json}
            </pre>
        </div>
    )
}
