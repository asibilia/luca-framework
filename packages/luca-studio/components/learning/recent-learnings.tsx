'use client'

import { useState } from 'react'

import { EmptyState } from '~/components/shared/empty-state'
import { Badge } from '~/components/ui/badge'
import {
    Card,
    CardHeader,
    CardTitle,
    CardAction,
    CardContent,
} from '~/components/ui/card'
import { relativeTime } from '~/lib/format'
import type { MuninnEngram } from '~/lib/muninn-types'

/**
 * Known categories with display metadata for badge rendering.
 *
 * Mirrors the CATEGORY_DISPLAY convention used across the observer.
 */
const KNOWN_CATEGORIES = new Set([
    'pattern',
    'decision',
    'pitfall',
    'preference',
])

const CATEGORY_DISPLAY: Record<string, { label: string; color: string }> = {
    pattern: { label: 'Pattern', color: 'success' },
    decision: { label: 'Decision', color: 'info' },
    pitfall: { label: 'Pitfall', color: 'warning' },
    preference: { label: 'Preference', color: 'chart-2' },
    uncategorized: { label: 'Other', color: 'muted-foreground' },
}

/**
 * Resolve engram category using the hybrid mapping strategy.
 */
function resolveCategory(engram: MuninnEngram): string {
    if (engram.memory_type && KNOWN_CATEGORIES.has(engram.memory_type)) {
        return engram.memory_type
    }

    const colonIndex = engram.concept.indexOf(':')
    if (colonIndex > 0) {
        const prefix = engram.concept.slice(0, colonIndex).toLowerCase().trim()
        if (KNOWN_CATEGORIES.has(prefix)) {
            return prefix
        }
    }

    return 'uncategorized'
}

/**
 * Strip the category prefix from a concept name for display.
 */
function displayConcept(concept: string, category: string): string {
    const colonIndex = concept.indexOf(':')
    if (colonIndex > 0) {
        const prefix = concept.slice(0, colonIndex).toLowerCase().trim()
        if (prefix === category) {
            return concept.slice(colonIndex + 1).trim()
        }
    }
    return concept
}

/**
 * Recent learnings engram list.
 *
 * Renders the 20 most recent learning engrams in a compact list format.
 * Each item shows concept name, category badge, truncated content (~120 chars),
 * and relative timestamp. Items expand on click to show full content.
 *
 * @param engrams - Array of MuninnEngram objects (pre-sorted, max 20)
 */
export function RecentLearnings({ engrams }: { engrams: MuninnEngram[] }) {
    if (engrams.length === 0) {
        return (
            <Card>
                <CardHeader className="border-b">
                    <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Recent Learnings
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <EmptyState message="No recent learnings available." />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="flex flex-col">
            <CardHeader className="border-b">
                <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Recent Learnings
                </CardTitle>
                <CardAction>
                    <Badge variant="outline" className="font-mono text-xs">
                        {engrams.length}{' '}
                        {engrams.length === 1 ? 'engram' : 'engrams'}
                    </Badge>
                </CardAction>
            </CardHeader>

            <div className="max-h-[36rem] overflow-y-auto">
                {engrams.map((engram) => (
                    <EngramItem key={engram.id} engram={engram} />
                ))}
            </div>
        </Card>
    )
}

/**
 * Single engram item with expand-on-click behavior.
 */
function EngramItem({ engram }: { engram: MuninnEngram }) {
    const [expanded, setExpanded] = useState(false)

    const category = resolveCategory(engram)
    const conceptLabel = displayConcept(engram.concept, category)
    const display = CATEGORY_DISPLAY[category] ?? {
        label: 'Other',
        color: 'muted-foreground',
    }
    const truncatedContent =
        engram.content.length > 120
            ? `${engram.content.slice(0, 120)}...`
            : engram.content
    const timestamp = relativeTime(engram.updated_at ?? engram.created_at)

    return (
        <div className="border-b border-border/50 last:border-b-0">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="w-full px-4 py-2.5 text-left hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="font-mono text-xs font-semibold text-foreground">
                                {conceptLabel}
                            </p>
                            {/* Category badge */}
                            <span
                                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-medium"
                                style={{
                                    color: `var(--color-${display.color})`,
                                    backgroundColor: `color-mix(in oklab, var(--color-${display.color}) 15%, transparent)`,
                                }}
                            >
                                {display.label}
                            </span>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground line-clamp-2">
                            {truncatedContent}
                        </p>
                    </div>
                    {timestamp && (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground/60">
                            {timestamp}
                        </span>
                    )}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-border/30 px-4 py-2.5">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                        {engram.content}
                    </pre>
                    <div className="mt-2 flex items-center gap-3 font-mono text-xs text-muted-foreground/60">
                        <span>ID: {engram.id.slice(0, 8)}</span>
                        {engram.state && <span>State: {engram.state}</span>}
                        <span>
                            Confidence: {Math.round(engram.confidence * 100)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
