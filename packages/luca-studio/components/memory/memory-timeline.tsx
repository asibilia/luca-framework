'use client'

import orderBy from 'lodash/orderBy'

import { EmptyState } from '~/components/shared/empty-state'
import { Badge } from '~/components/ui/badge'
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '~/components/ui/card'
import type { CheckpointData } from '~/hooks/use-checkpoint'
import type { ObservationsData } from '~/hooks/use-observations'
import { relativeTime, zoneColor } from '~/lib/format'

/**
 * Resolve observation concept prefix to a color.
 */
function observationColor(concept: string): string {
    if (concept.includes('session:')) return 'info'
    if (concept.includes('metric:')) return 'success'
    if (concept.includes('pattern:')) return 'accent'
    if (concept.includes('pitfall:')) return 'warning'
    return 'muted-foreground'
}

/** Unified timeline event for display. */
interface TimelineEvent {
    id: string
    type: 'observation' | 'zone'
    timestamp: number
    label: string
    color: string
    zone?: string
}

/**
 * Merge observations and zone history into a single timeline.
 */
function buildTimeline(
    observations: ObservationsData,
    checkpoint: CheckpointData,
    maxEvents: number
): TimelineEvent[] {
    const events: TimelineEvent[] = []

    // Add observation events
    for (const obs of observations.observations) {
        const ts =
            typeof obs.created_at === 'number'
                ? obs.created_at < 1e12
                    ? obs.created_at * 1000
                    : obs.created_at
                : new Date(obs.created_at).getTime()

        events.push({
            id: obs.id,
            type: 'observation',
            timestamp: ts,
            label: obs.concept,
            color: observationColor(obs.concept),
        })
    }

    // Add zone transition events
    for (const entry of checkpoint.zone_history) {
        const ts = new Date(entry.checked_at).getTime()
        events.push({
            id: `zone-${entry.checked_at}`,
            type: 'zone',
            timestamp: ts,
            label: `Zone: ${entry.zone} (${entry.usage_percent}%)`,
            color: zoneColor(entry.zone),
            zone: entry.zone,
        })
    }

    // Sort by timestamp descending (most recent first) and limit
    return orderBy(events, 'timestamp', 'desc').slice(0, maxEvents)
}

/**
 * Memory Timeline section for the memory page.
 *
 * Observation chronology with zone markers and checkpoint events.
 * Consumes both ObservationsData and CheckpointData props.
 *
 * @param observations - ObservationsData from useObservations
 * @param checkpoint - CheckpointData from useCheckpoint
 */
export function MemoryTimeline({
    observations,
    checkpoint,
}: {
    observations: ObservationsData
    checkpoint: CheckpointData
}) {
    const events = buildTimeline(observations, checkpoint, 30)

    if (events.length === 0) {
        return (
            <EmptyState
                title="No Timeline Data"
                message="No observations or zone transitions recorded yet."
            />
        )
    }

    return (
        <Card role="region" aria-label="Memory timeline">
            <CardHeader className="border-b">
                <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Memory Timeline
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                    Recent observations and zone transitions
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="max-h-96 overflow-y-auto">
                    <div className="border-l-2 border-border ml-2">
                        {events.map((event) => (
                            <TimelineRow key={event.id} event={event} />
                        ))}
                    </div>
                </div>
                <div className="mt-2 text-right">
                    <Badge variant="outline" className="font-mono text-xs">
                        {events.length} events
                    </Badge>
                </div>
            </CardContent>
        </Card>
    )
}

/**
 * Single timeline row with colored dot and timestamp.
 */
function TimelineRow({ event }: { event: TimelineEvent }) {
    const isZone = event.type === 'zone'

    return (
        <div className="relative flex items-start gap-3 py-1.5 pl-4">
            {/* Colored dot positioned on the border line */}
            <div
                className="absolute -left-[5px] top-2.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--color-${event.color})` }}
            />

            {/* Timestamp */}
            <span className="shrink-0 font-mono text-xs text-muted-foreground/60">
                {relativeTime(event.timestamp)}
            </span>

            {/* Event label */}
            {isZone ? (
                <span
                    className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
                    style={{
                        color: `var(--color-${event.color})`,
                        backgroundColor: `color-mix(in oklab, var(--color-${event.color}) 15%, transparent)`,
                    }}
                >
                    {event.label}
                </span>
            ) : (
                <span className="truncate font-mono text-xs text-foreground">
                    {event.label}
                </span>
            )}
        </div>
    )
}
