'use client'

import { EmptyState } from '~/components/shared/empty-state'
import { Card, CardHeader, CardTitle, CardContent } from '~/components/ui/card'
import type { CoherenceEntry } from '~/hooks/use-vault-health'

/**
 * Metric row configuration for coherence display.
 *
 * Maps coherence fields to display labels and format functions.
 * Score uses percentage, ratios use 2-decimal display.
 */
const METRIC_ROWS: Array<{
    label: string
    getValue: (entry: CoherenceEntry) => string
    colorFn?: (entry: CoherenceEntry) => string
}> = [
    {
        label: 'Score',
        getValue: (e) => `${(e.score * 100).toFixed(1)}%`,
        colorFn: (e) => {
            if (e.score >= 0.8) return 'var(--color-success)'
            if (e.score >= 0.5) return 'var(--color-warning)'
            return 'var(--color-destructive)'
        },
    },
    {
        label: 'Orphan Ratio',
        getValue: (e) => `${(e.orphan_ratio * 100).toFixed(1)}%`,
        colorFn: (e) => {
            if (e.orphan_ratio <= 0.1) return 'var(--color-success)'
            if (e.orphan_ratio <= 0.3) return 'var(--color-warning)'
            return 'var(--color-destructive)'
        },
    },
    {
        label: 'Contradiction Density',
        getValue: (e) => e.contradiction_density.toFixed(3),
    },
    {
        label: 'Duplication Pressure',
        getValue: (e) => e.duplication_pressure.toFixed(3),
    },
    {
        label: 'Temporal Variance',
        getValue: (e) => e.temporal_variance.toFixed(3),
    },
    {
        label: 'Engrams',
        getValue: (e) => e.total_engrams.toLocaleString(),
    },
]

/**
 * Coherence metrics card for the Vault Health Dashboard.
 *
 * Displays per-vault coherence scores including overall score,
 * orphan ratio, contradiction density, duplication pressure,
 * and temporal variance. Color-codes score and orphan ratio
 * based on health thresholds.
 *
 * If no coherence data is available (API did not return it),
 * renders an informational EmptyState.
 *
 * @param coherence - Array of coherence entries from useVaultHealth hook
 */
export function CoherenceMetrics({
    coherence,
}: {
    coherence: CoherenceEntry[]
}) {
    if (coherence.length === 0) {
        return (
            <Card>
                <CardHeader className="border-b">
                    <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Coherence Metrics
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <EmptyState message="No coherence data available. Run vault coherence analysis to populate." />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="border-b">
                <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Coherence Metrics
                </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                {coherence.map((entry) => (
                    <div key={entry.vault}>
                        {/* Vault label (only show if multiple vaults) */}
                        {coherence.length > 1 && (
                            <p className="mb-2 font-mono text-xs font-medium text-muted-foreground">
                                Vault: {entry.vault}
                            </p>
                        )}

                        <div className="flex flex-col gap-2">
                            {METRIC_ROWS.map((row) => (
                                <div
                                    key={row.label}
                                    className="flex items-center justify-between"
                                >
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {row.label}
                                    </span>
                                    <span
                                        className="font-mono text-sm font-medium"
                                        style={
                                            row.colorFn
                                                ? { color: row.colorFn(entry) }
                                                : undefined
                                        }
                                    >
                                        {row.getValue(entry)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
