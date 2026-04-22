'use client'

import { useState } from 'react'

import { ChevronDown } from 'lucide-react'

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/collapsible'
import { COMPLEXITY_LEVELS } from '~/lib/constants'
import { cn } from '~/lib/utils'
import { TIER_DISPLAY_CONFIG } from '~/lib/workflow-constants'
import type { WorkflowNodeData } from '~/lib/workflow-types'

// -- Types --------------------------------------------------------------------

interface StepRoutingSectionProps {
    /** Current node data snapshot. */
    nodeData: WorkflowNodeData
}

// -- Constants ----------------------------------------------------------------

const COMPLEXITY_KEYS = Object.keys(COMPLEXITY_LEVELS) as Array<
    keyof typeof COMPLEXITY_LEVELS
>

// -- Component ----------------------------------------------------------------

/**
 * Model routing section of the step configuration panel.
 *
 * Displays a read-only table showing the step's model tier per complexity
 * level. Uses `TIER_DISPLAY_CONFIG` for color coding and `COMPLEXITY_LEVELS`
 * for the row labels.
 *
 * If the node has a `routing_preset` in its data, it is shown. Otherwise
 * the `model_tier` field provides a single-tier fallback.
 */
export function StepRoutingSection({ nodeData }: StepRoutingSectionProps) {
    const [open, setOpen] = useState(false)

    // Fall back to the node's single model_tier for all levels if no preset routing
    const defaultTier = nodeData.model_tier ?? 'balanced'

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-muted/50">
                <span>Model Routing</span>
                <ChevronDown
                    className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        open && 'rotate-180'
                    )}
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-3">
                {nodeData.routing_preset && (
                    <p className="mb-2 text-xs text-muted-foreground">
                        Preset:{' '}
                        <span className="font-mono text-foreground">
                            {nodeData.routing_preset}
                        </span>
                    </p>
                )}

                <div className="rounded-md border">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b">
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                                    Complexity
                                </th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                                    Tier
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPLEXITY_KEYS.map((level) => {
                                const meta = COMPLEXITY_LEVELS[level]
                                const tier = defaultTier
                                const tierConfig = TIER_DISPLAY_CONFIG[tier]

                                return (
                                    <tr
                                        key={level}
                                        className="border-b last:border-0"
                                    >
                                        <td className="px-2 py-1.5 text-muted-foreground">
                                            {meta.label}
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <span className="flex items-center gap-1.5">
                                                {tierConfig && (
                                                    <span
                                                        className={cn(
                                                            'h-2 w-2 rounded-full',
                                                            tierConfig.dotColor
                                                        )}
                                                    />
                                                )}
                                                <span className="text-foreground">
                                                    {tierConfig?.label ?? tier}
                                                </span>
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
