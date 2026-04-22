'use client'

import { useCallback, useState } from 'react'

import { useAtom } from 'jotai'
import get from 'lodash/get'
import { ChevronDown, Minus, Plus } from 'lucide-react'

import { Button } from '~/components/ui/button'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/collapsible'
import { Label } from '~/components/ui/label'
import { cn } from '~/lib/utils'
import { configDraftAtom } from '~/stores/config-atoms'
import { markDirtyAtom } from '~/stores/dirty-tracking'

// -- Types --------------------------------------------------------------------

interface StepBudgetsSectionProps {
    /** React Flow node ID (used as key context, not currently needed for budget edits). */
    nodeId: string
}

/** Budget field descriptor. */
interface BudgetField {
    key: string
    label: string
    description: string
}

// -- Constants ----------------------------------------------------------------

const BUDGET_FIELDS: BudgetField[] = [
    {
        key: 'planVerificationIterations',
        label: 'Plan Verification',
        description: 'Plan checker retry budget',
    },
    {
        key: 'checksFixIterations',
        label: 'Checks Fix',
        description: 'Mechanical fix loop budget',
    },
    {
        key: 'verifyFixIterations',
        label: 'Verify Fix',
        description: 'Semantic fix loop budget',
    },
]

const MIN_BUDGET = 1
const MAX_BUDGET = 5

// -- Component ----------------------------------------------------------------

/**
 * Loop budgets section of the step configuration panel.
 *
 * Provides numeric inputs with +/- controls for iteration caps:
 * - Plan verification iterations
 * - Checks fix iterations
 * - Verify fix iterations
 *
 * Reads from / writes to `configDraftAtom` under the
 * `complexity.matrix.MODERATE` path (using MODERATE as the default
 * editing context). Changes mark config as dirty.
 */
export function StepBudgetsSection({ nodeId }: StepBudgetsSectionProps) {
    const [open, setOpen] = useState(false)
    const [configDraft, setConfigDraft] = useAtom(configDraftAtom)
    const [, markDirty] = useAtom(markDirtyAtom)

    // Read budget values from the MODERATE complexity level
    const getFieldValue = useCallback(
        (fieldKey: string): number => {
            const value = get(
                configDraft,
                `complexity.matrix.MODERATE.${fieldKey}`,
                2
            )
            return typeof value === 'number' ? value : 2
        },
        [configDraft]
    )

    const updateField = useCallback(
        (fieldKey: string, newValue: number) => {
            const clamped = Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, newValue))
            if (!configDraft) return

            // Deep clone and update
            const draft = JSON.parse(JSON.stringify(configDraft)) as Record<
                string,
                unknown
            >

            // Ensure nested path exists
            if (!draft.complexity) draft.complexity = {}
            const complexity = draft.complexity as Record<string, unknown>
            if (!complexity.matrix) complexity.matrix = {}
            const matrix = complexity.matrix as Record<string, unknown>
            if (!matrix.MODERATE) matrix.MODERATE = {}
            const moderate = matrix.MODERATE as Record<string, unknown>

            moderate[fieldKey] = clamped
            setConfigDraft(draft)
            markDirty('config')
        },
        [configDraft, setConfigDraft, markDirty]
    )

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-muted/50">
                <span>Loop Budgets</span>
                <ChevronDown
                    className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        open && 'rotate-180'
                    )}
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 px-2 pb-3">
                <p className="text-[10px] text-muted-foreground">
                    Iteration caps for the MODERATE complexity level. Values
                    clamped to 1-5.
                </p>

                {BUDGET_FIELDS.map((field) => {
                    const value = getFieldValue(field.key)
                    return (
                        <div key={field.key} className="space-y-1">
                            <Label
                                htmlFor={`budget-${nodeId}-${field.key}`}
                                className="text-xs"
                            >
                                {field.label}
                            </Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-7"
                                    onClick={() =>
                                        updateField(field.key, value - 1)
                                    }
                                    disabled={value <= MIN_BUDGET}
                                    aria-label={`Decrease ${field.label}`}
                                >
                                    <Minus className="size-3" />
                                </Button>
                                <span
                                    id={`budget-${nodeId}-${field.key}`}
                                    className="w-8 text-center text-sm font-medium tabular-nums"
                                >
                                    {value}
                                </span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-7"
                                    onClick={() =>
                                        updateField(field.key, value + 1)
                                    }
                                    disabled={value >= MAX_BUDGET}
                                    aria-label={`Increase ${field.label}`}
                                >
                                    <Plus className="size-3" />
                                </Button>
                                <span className="text-[10px] text-muted-foreground">
                                    {field.description}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </CollapsibleContent>
        </Collapsible>
    )
}
