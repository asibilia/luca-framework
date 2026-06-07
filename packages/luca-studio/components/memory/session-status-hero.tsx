'use client'

import { EmptyState } from '~/components/shared/empty-state'
import { Card, CardContent } from '~/components/ui/card'
import type { CheckpointData } from '~/hooks/use-checkpoint'
import { zoneColor, formatAge } from '~/lib/format'

/**
 * Resolve zone to a human-readable label.
 */
function zoneLabel(zone: string): string {
    switch (zone) {
        case 'peak':
            return 'Peak'
        case 'good':
            return 'Good'
        case 'degrading':
            return 'Degrading'
        case 'stop':
            return 'Critical'
        default:
            return zone
    }
}

/**
 * Session Status Hero section for the memory page.
 *
 * Shows real-time context gauge with zone color, observation count,
 * and checkpoint age. Consumes CheckpointData from useCheckpoint.
 *
 * @param data - CheckpointData from the useCheckpoint hook
 */
export function SessionStatusHero({ data }: { data: CheckpointData }) {
    if (!data.zone && data.usage_percent === null) {
        return (
            <EmptyState
                title="No Active Session"
                message="No checkpoint data available. Start a Luca workflow to see session status."
            />
        )
    }

    const color = data.zone ? zoneColor(data.zone) : 'muted-foreground'
    const label = data.zone ? zoneLabel(data.zone) : 'Unknown'
    const percent = data.usage_percent ?? 0

    return (
        <Card role="region" aria-label="Session status">
            <CardContent>
                <div className="flex items-center justify-between">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Session Status
                    </p>
                    {/* Zone badge */}
                    <span
                        className="rounded-sm px-2 py-0.5 font-mono text-xs font-medium"
                        style={{
                            color: `var(--color-${color})`,
                            backgroundColor: `color-mix(in oklab, var(--color-${color}) 15%, transparent)`,
                        }}
                    >
                        {label}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${Math.min(percent, 100)}%`,
                                backgroundColor: `var(--color-${color})`,
                            }}
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Context usage: ${percent}%`}
                        />
                    </div>
                    <div className="mt-1 flex justify-between">
                        <span className="font-mono text-xs text-muted-foreground">
                            0%
                        </span>
                        <span
                            className="font-mono text-xs font-medium"
                            style={{ color: `var(--color-${color})` }}
                        >
                            {percent}%
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                            100%
                        </span>
                    </div>
                </div>

                {/* Stat chips */}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: `var(--color-${color})` }}
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                            Zone
                        </span>
                        <span className="font-mono text-xs font-medium text-foreground">
                            {label}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <div
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: 'var(--color-info)' }}
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                            Observations
                        </span>
                        <span className="font-mono text-xs font-medium text-foreground">
                            {data.observation_count}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <div
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: 'var(--color-chart-2)' }}
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                            Checkpoint
                        </span>
                        <span className="font-mono text-xs font-medium text-foreground">
                            {formatAge(data.checkpoint_age_seconds)}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
