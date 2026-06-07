'use client'

import { EmptyState } from '~/components/shared/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import type { ObservationsData } from '~/hooks/use-observations'
import { relativeTime, coherenceColor } from '~/lib/format'

/**
 * Recall Effectiveness section for the memory page.
 *
 * Shows hit rate, precision, and recent observation engrams list.
 * Consumes ObservationsData props.
 *
 * @param data - ObservationsData from the useObservations hook
 */
export function RecallEffectiveness({ data }: { data: ObservationsData }) {
    const hasMetrics = data.hit_rate !== null || data.precision !== null
    const hasObservations = data.observations.length > 0

    if (!hasMetrics && !hasObservations) {
        return (
            <EmptyState
                title="No Recall Metrics"
                message="No data yet — metrics are collected during phase execution, not manual memory operations. Run a Luca phase to populate this section."
            />
        )
    }

    return (
        <Card role="region" aria-label="Recall effectiveness">
            <CardHeader className="border-b">
                <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Recall Effectiveness
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                {/* Metric displays */}
                <div className="flex flex-wrap items-center gap-4">
                    <MetricDisplay label="Hit Rate" value={data.hit_rate} />
                    <MetricDisplay label="Precision" value={data.precision} />
                </div>

                {/* Hit rate bar */}
                {data.hit_rate !== null && (
                    <div className="mt-3">
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${Math.min(Math.round(data.hit_rate * 100), 100)}%`,
                                    backgroundColor: `var(--color-${coherenceColor(data.hit_rate)})`,
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Recent observations list */}
                {hasObservations && (
                    <div className="mt-4">
                        <p className="font-mono text-xs text-muted-foreground">
                            Recent Observations (
                            {Math.min(data.observations.length, 10)})
                        </p>
                        <div className="mt-2 max-h-48 overflow-y-auto">
                            {data.observations.slice(0, 10).map((obs) => (
                                <div
                                    key={obs.id}
                                    className="flex items-start gap-2 border-b border-border py-1.5 last:border-b-0"
                                >
                                    <span className="shrink-0 font-mono text-xs text-muted-foreground/60">
                                        {relativeTime(obs.created_at)}
                                    </span>
                                    <span className="truncate font-mono text-xs text-foreground">
                                        {obs.concept}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

/**
 * Single metric display with colored badge.
 */
function MetricDisplay({
    label,
    value,
}: {
    label: string
    value: number | null
}) {
    if (value === null) {
        return (
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">
                    {label}
                </span>
                <span className="font-mono text-xs text-muted-foreground/60">
                    --
                </span>
            </div>
        )
    }

    const percent = Math.round(value * 100)
    const color = coherenceColor(value)

    return (
        <div className="flex items-center gap-1.5">
            <div
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--color-${color})` }}
            />
            <span className="font-mono text-xs text-muted-foreground">
                {label}
            </span>
            <span
                className="rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium"
                style={{
                    color: `var(--color-${color})`,
                    backgroundColor: `color-mix(in oklab, var(--color-${color}) 15%, transparent)`,
                }}
            >
                {percent}%
            </span>
        </div>
    )
}
