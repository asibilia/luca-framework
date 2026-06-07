'use client'

import { Badge } from '~/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '~/components/ui/card'
import { relativeTime } from '~/lib/format'
import type { MuninnEngram } from '~/lib/muninn-types'

/**
 * Category colors and labels for engram badges.
 */
const CATEGORY_MAP: Record<
    string,
    {
        label: string
        variant: 'default' | 'secondary' | 'outline' | 'destructive'
    }
> = {
    pattern: { label: 'Pattern', variant: 'default' },
    decision: { label: 'Decision', variant: 'secondary' },
    pitfall: { label: 'Pitfall', variant: 'destructive' },
    preference: { label: 'Preference', variant: 'outline' },
}

function resolveCategory(engram: MuninnEngram): string {
    if (engram.memory_type && CATEGORY_MAP[engram.memory_type]) {
        return engram.memory_type
    }
    const colonIndex = engram.concept.indexOf(':')
    if (colonIndex > 0) {
        const prefix = engram.concept.slice(0, colonIndex).toLowerCase().trim()
        if (CATEGORY_MAP[prefix]) return prefix
    }
    return 'other'
}

/**
 * Truncate content to a max character length, appending ellipsis.
 */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen).trimEnd() + '...'
}

/**
 * Recent engrams card for the dashboard.
 *
 * Shows the 5 most recent memories with concept, category badge,
 * truncated content preview, and relative timestamp.
 */
export function RecentEngrams({ engrams }: { engrams: MuninnEngram[] }) {
    if (engrams.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="font-mono text-sm">
                        Recent Memories
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="font-mono text-xs text-muted-foreground">
                        No memories yet. Memories will appear here as MuninnDB
                        stores engrams.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-mono text-sm">
                    Recent Memories
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {engrams.map((engram) => {
                    const category = resolveCategory(engram)
                    const catInfo = CATEGORY_MAP[category]
                    const ts =
                        engram.created_at < 1e12
                            ? engram.created_at * 1000
                            : engram.created_at

                    return (
                        <div
                            key={engram.id}
                            className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-mono text-xs font-medium text-foreground">
                                    {engram.concept}
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                    {catInfo && (
                                        <Badge variant={catInfo.variant}>
                                            {catInfo.label}
                                        </Badge>
                                    )}
                                    <span className="font-mono text-[10px] text-muted-foreground/60">
                                        {relativeTime(ts)}
                                    </span>
                                </div>
                            </div>
                            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                                {truncate(engram.content, 120)}
                            </p>
                        </div>
                    )
                })}
            </CardContent>
        </Card>
    )
}
