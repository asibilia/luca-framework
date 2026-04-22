'use client'

import { Badge } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelRoutingDisplayProps = {
    /** The agent's model routing configuration, if available. */
    routingPreset?: string
    /** Additional CSS class names for the outer wrapper. */
    className?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Complexity levels used in the routing display.
 *
 * Matches the five-level system from the complexity gating rule.
 */
const COMPLEXITY_LEVELS = [
    'TRIVIAL',
    'SIMPLE',
    'MODERATE',
    'COMPLEX',
    'CRITICAL',
] as const

/**
 * Named routing presets and their tier assignments per complexity level.
 *
 * Mirrors the MODEL_ROUTING_TABLE from the complexity system.
 */
const ROUTING_PRESETS: Record<string, Record<string, string>> = {
    ALWAYS_FAST: {
        TRIVIAL: 'fast',
        SIMPLE: 'fast',
        MODERATE: 'fast',
        COMPLEX: 'fast',
        CRITICAL: 'fast',
    },
    FAST_PROMOTED: {
        TRIVIAL: 'fast',
        SIMPLE: 'fast',
        MODERATE: 'fast',
        COMPLEX: 'fast',
        CRITICAL: 'balanced',
    },
    ROUTER: {
        TRIVIAL: 'fast',
        SIMPLE: 'fast',
        MODERATE: 'balanced',
        COMPLEX: 'balanced',
        CRITICAL: 'balanced',
    },
    ORCHESTRATOR: {
        TRIVIAL: 'fast',
        SIMPLE: 'balanced',
        MODERATE: 'balanced',
        COMPLEX: 'capable',
        CRITICAL: 'capable',
    },
    DEEP_ANALYSIS: {
        TRIVIAL: 'fast',
        SIMPLE: 'balanced',
        MODERATE: 'capable',
        COMPLEX: 'capable',
        CRITICAL: 'capable',
    },
    DEBUGGER_PRESET: {
        TRIVIAL: 'balanced',
        SIMPLE: 'balanced',
        MODERATE: 'capable',
        COMPLEX: 'capable',
        CRITICAL: 'capable',
    },
    ALWAYS_CAPABLE: {
        TRIVIAL: 'capable',
        SIMPLE: 'capable',
        MODERATE: 'capable',
        COMPLEX: 'capable',
        CRITICAL: 'capable',
    },
}

/**
 * Color mapping for model tiers.
 */
const TIER_COLORS: Record<string, string> = {
    fast: 'bg-green-500/10 text-green-700 dark:text-green-400',
    balanced: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    capable: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Read-only display of an agent's model routing configuration.
 *
 * Shows a table grid mapping complexity levels to model tiers based on the
 * agent's routing preset. Displays the preset name as a header badge and
 * renders each complexity/tier pair with appropriate color coding.
 *
 * @param routingPreset - Name of the routing preset (e.g. "ORCHESTRATOR").
 * @param className - Additional CSS classes.
 *
 * @example
 * ```tsx
 * <ModelRoutingDisplay routingPreset="ORCHESTRATOR" />
 * ```
 */
export function ModelRoutingDisplay({
    routingPreset,
    className,
}: ModelRoutingDisplayProps) {
    const preset = routingPreset
        ? ROUTING_PRESETS[routingPreset.toUpperCase()]
        : null

    if (!preset) {
        return (
            <div
                className={cn(
                    'rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground',
                    className
                )}
            >
                {routingPreset
                    ? `Unknown routing preset: ${routingPreset}`
                    : 'No routing preset configured'}
            </div>
        )
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Preset:</span>
                <Badge variant="outline" className="font-mono text-xs">
                    {routingPreset}
                </Badge>
            </div>
            <div className="grid grid-cols-5 gap-1">
                {COMPLEXITY_LEVELS.map((level) => {
                    const tier = preset[level] ?? 'unknown'
                    const colorClass =
                        TIER_COLORS[tier] ?? 'bg-muted text-muted-foreground'
                    return (
                        <div
                            key={level}
                            className="flex flex-col items-center gap-0.5"
                        >
                            <span className="text-[10px] font-medium text-muted-foreground">
                                {level.slice(0, 4)}
                            </span>
                            <span
                                className={cn(
                                    'w-full rounded px-1.5 py-0.5 text-center text-[11px] font-medium',
                                    colorClass
                                )}
                            >
                                {tier}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
