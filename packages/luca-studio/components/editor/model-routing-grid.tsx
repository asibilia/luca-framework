'use client'

import { useMemo } from 'react'

import { Check, ChevronDown } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'

import { COMPLEXITY_LEVELS } from '~/lib/constants'
import { cn } from '~/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Model tier values used in the routing table. */
export type ModelTier = 'fast' | 'balanced' | 'capable'

/** Complexity level keys. */
export type ComplexityLevel = keyof typeof COMPLEXITY_LEVELS

/** The value shape: a record of complexity level to model tier. */
export type RoutingValue = Record<ComplexityLevel, ModelTier>

/** Props for the ModelRoutingGrid component. */
export type ModelRoutingGridProps = {
    /** Current routing values per complexity level. */
    value: RoutingValue
    /** Called when a tier value changes. */
    onChange?: (value: RoutingValue) => void
    /** When true, renders static text instead of dropdowns. */
    readOnly?: boolean
    /** Additional CSS class names for the outer wrapper. */
    className?: string
}

// ---------------------------------------------------------------------------
// Named Routing Presets
//
// Defined inline since luca-studio is a separate package and cannot import
// from src/complexity/__helpers/model-routing.ts. These values mirror the
// canonical MODEL_ROUTING_TABLE presets.
// ---------------------------------------------------------------------------

const ROUTING_PRESETS: Record<string, RoutingValue> = {
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

/** All available model tiers with display metadata. */
const MODEL_TIERS: { value: ModelTier; label: string }[] = [
    { value: 'fast', label: 'Fast' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'capable', label: 'Capable' },
]

/** Complexity level keys in display order. */
const COMPLEXITY_KEYS: ComplexityLevel[] = [
    'TRIVIAL',
    'SIMPLE',
    'MODERATE',
    'COMPLEX',
    'CRITICAL',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the CSS background class for a given model tier.
 *
 * - fast: muted/gray
 * - balanced: blue/info
 * - capable: amber/warning
 */
function tierBgClass(tier: ModelTier): string {
    switch (tier) {
        case 'fast':
            return 'bg-muted text-muted-foreground'
        case 'balanced':
            return 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
        case 'capable':
            return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    }
}

/**
 * Detect if the current value matches a named routing preset.
 *
 * Returns the preset name if found, otherwise null.
 */
function detectPreset(value: RoutingValue): string | null {
    for (const [name, preset] of Object.entries(ROUTING_PRESETS)) {
        const matches = COMPLEXITY_KEYS.every(
            (key) => preset[key] === value[key]
        )
        if (matches) return name
    }
    return null
}

// ---------------------------------------------------------------------------
// Internal: TierSelect
// ---------------------------------------------------------------------------

/**
 * Compact select dropdown for a single model tier cell.
 */
function TierSelect({
    value,
    onValueChange,
    className,
}: {
    value: ModelTier
    onValueChange: (tier: ModelTier) => void
    className?: string
}) {
    return (
        <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
            <SelectPrimitive.Trigger
                className={cn(
                    'inline-flex h-7 w-20 items-center justify-between rounded-md border border-border px-2 text-xs font-medium outline-none transition-colors',
                    'focus:ring-2 focus:ring-ring/50',
                    tierBgClass(value),
                    className
                )}
            >
                <SelectPrimitive.Value />
                <SelectPrimitive.Icon>
                    <ChevronDown className="size-3 opacity-50" />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                    position="popper"
                    sideOffset={4}
                    className={cn(
                        'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                        'data-[side=bottom]:slide-in-from-top-2'
                    )}
                >
                    <SelectPrimitive.Viewport>
                        {MODEL_TIERS.map((tier) => (
                            <SelectPrimitive.Item
                                key={tier.value}
                                value={tier.value}
                                className={cn(
                                    'relative flex h-7 cursor-pointer select-none items-center rounded-sm pl-7 pr-2 text-xs outline-none',
                                    'focus:bg-accent focus:text-accent-foreground',
                                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
                                )}
                            >
                                <SelectPrimitive.ItemIndicator className="absolute left-1.5 flex size-4 items-center justify-center">
                                    <Check className="size-3" />
                                </SelectPrimitive.ItemIndicator>
                                <SelectPrimitive.ItemText>
                                    {tier.label}
                                </SelectPrimitive.ItemText>
                            </SelectPrimitive.Item>
                        ))}
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact 5-column editable grid for model tier routing per complexity level.
 *
 * Displays TRIVIAL through CRITICAL columns with color-coded tier dropdowns.
 * When the current combination matches a known routing preset, the preset
 * name is shown above the grid.
 *
 * @example
 * ```tsx
 * <ModelRoutingGrid
 *   value={{ TRIVIAL: "fast", SIMPLE: "balanced", MODERATE: "balanced", COMPLEX: "capable", CRITICAL: "capable" }}
 *   onChange={setRouting}
 * />
 * ```
 */
export function ModelRoutingGrid({
    value,
    onChange,
    readOnly = false,
    className,
}: ModelRoutingGridProps) {
    const presetName = useMemo(() => detectPreset(value), [value])

    const handleTierChange = (level: ComplexityLevel, tier: ModelTier) => {
        onChange?.({ ...value, [level]: tier })
    }

    return (
        <div className={cn('inline-flex flex-col gap-1.5', className)}>
            {/* Preset indicator */}
            {presetName && (
                <span className="text-xs font-medium text-muted-foreground">
                    Preset:{' '}
                    <span className="text-foreground">{presetName}</span>
                </span>
            )}

            {/* Grid */}
            <div className="inline-grid grid-cols-5 gap-1.5">
                {/* Column headers */}
                {COMPLEXITY_KEYS.map((level) => (
                    <div
                        key={level}
                        className="flex w-20 items-center justify-center text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                        {COMPLEXITY_LEVELS[level].label}
                    </div>
                ))}

                {/* Tier cells */}
                {COMPLEXITY_KEYS.map((level) =>
                    readOnly ? (
                        <div
                            key={level}
                            className={cn(
                                'flex h-7 w-20 items-center justify-center rounded-md text-xs font-medium',
                                tierBgClass(value[level])
                            )}
                        >
                            {value[level]}
                        </div>
                    ) : (
                        <TierSelect
                            key={level}
                            value={value[level]}
                            onValueChange={(tier) =>
                                handleTierChange(level, tier)
                            }
                        />
                    )
                )}
            </div>
        </div>
    )
}
