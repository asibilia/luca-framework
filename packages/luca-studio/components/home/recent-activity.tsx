'use client'

import { useMemo } from 'react'

import { Badge } from '~/components/ui/badge'
import type { LedgerEntry } from '~/hooks/use-home-data'
import { EVENT_TYPES } from '~/lib/constants'
import type { EventTypeName } from '~/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecentActivityProps = {
    /** Ledger entries to display (most-recent-first). */
    entries: LedgerEntry[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a timestamp string into a human-readable relative or absolute time.
 *
 * @param ts - ISO 8601 timestamp string
 * @returns Formatted time string
 */
function formatTimestamp(ts: string): string {
    if (!ts) return ''
    try {
        const date = new Date(ts)
        if (Number.isNaN(date.getTime())) return ts
        return date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return ts
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shows the most recent session-ledger entries as an activity feed.
 *
 * Each entry displays an event type badge, timestamp, and summary line.
 * When no entries are available, shows a "No recent activity" placeholder.
 *
 * @param entries - Array of ledger entries from useHomeData.
 *
 * @example
 * ```tsx
 * <RecentActivity entries={ledgerEntries} />
 * ```
 */
export function RecentActivity({ entries }: RecentActivityProps) {
    const rows = useMemo(() => {
        return entries.map((entry, idx) => {
            const eventMeta = EVENT_TYPES[entry.event as EventTypeName] ?? null
            const label = eventMeta?.label ?? entry.event
            const summary = (entry.summary as string) ?? ''
            const time = formatTimestamp(entry.timestamp)

            return { key: `${entry.timestamp}-${idx}`, label, summary, time }
        })
    }, [entries])

    if (rows.length === 0) {
        return (
            <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                    Recent Activity
                </h3>
                <p className="text-sm text-muted-foreground/60">
                    No recent activity
                </p>
            </div>
        )
    }

    return (
        <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Recent Activity
            </h3>
            <div className="space-y-2">
                {rows.map((row) => (
                    <div
                        key={row.key}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                        <Badge variant="secondary" className="shrink-0 text-xs">
                            {row.label}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">
                            {row.summary}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {row.time}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
