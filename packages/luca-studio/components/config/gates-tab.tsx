'use client'

import { useCallback, useMemo } from 'react'

import { useAtom, useSetAtom } from 'jotai'
import get from 'lodash/get'

import { Badge } from '~/components/ui/badge'
import { Switch } from '~/components/ui/switch'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip'
import { configDraftAtom } from '~/stores/config-atoms'
import { markDirtyAtom } from '~/stores/dirty-tracking'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Description metadata for known gates. */
const GATE_DESCRIPTIONS: Record<string, string> = {
    confirm_project: 'Require confirmation before modifying project settings',
    confirm_phases: 'Require confirmation before phase transitions',
    confirm_roadmap: 'Require confirmation before roadmap changes',
    confirm_breakdown: 'Require confirmation before work breakdown',
    confirm_plan: 'Require confirmation before plan execution',
    execute_next_plan: 'Auto-advance to next plan after completion',
    issues_review: 'Review GitHub issues before execution',
    confirm_transition: 'Require confirmation for state transitions',
    premortem: 'Run pre-mortem risk analysis before execution',
    process_data: 'Enable process data collection and metrics',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Gates tab displaying toggle controls for each workflow gate.
 *
 * Each gate is shown as a row with its name, description, on/off Switch,
 * and a fail-closed semantics badge. Writes to `configDraftAtom` and marks
 * the "config" dirty key on every toggle.
 *
 * @example
 * ```tsx
 * <GatesTab />
 * ```
 */
export function GatesTab() {
    const [config, setConfig] = useAtom(configDraftAtom)
    const markDirty = useSetAtom(markDirtyAtom)

    const gates = useMemo(() => {
        return get(config, 'gates', {}) as Record<string, boolean>
    }, [config])

    const toggleGate = useCallback(
        (name: string, checked: boolean) => {
            setConfig((prev) => {
                const current = { ...(prev ?? {}) }
                const currentGates = {
                    ...(get(current, 'gates', {}) as Record<string, boolean>),
                }
                currentGates[name] = checked
                current.gates = currentGates
                return current
            })
            markDirty('config')
        },
        [setConfig, markDirty]
    )

    const gateEntries = Object.entries(gates)

    if (gateEntries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground/60">
                No gates configured. Add gates to .planning/config.json to
                manage them here.
            </p>
        )
    }

    return (
        <div className="space-y-1">
            {gateEntries.map(([name, enabled]) => (
                <div
                    key={name}
                    className="flex items-center justify-between gap-4 rounded-md px-3 py-2.5 hover:bg-muted/50"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{name}</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] cursor-help"
                                    >
                                        fail-closed
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    When disabled, the gate is skipped — not
                                    auto-approved. Missing flags are treated as
                                    &quot;skip&quot; for safety.
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {GATE_DESCRIPTIONS[name] ?? 'Custom gate'}
                        </p>
                    </div>
                    <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => toggleGate(name, checked)}
                    />
                </div>
            ))}
        </div>
    )
}
