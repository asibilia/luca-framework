'use client'

import { useCallback, useState } from 'react'
import type { ChangeEvent } from 'react'

import { useAtom } from 'jotai'
import { ChevronDown } from 'lucide-react'

import { Badge } from '~/components/ui/badge'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/collapsible'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'
import type { WorkflowNodeData } from '~/lib/workflow-types'
import { markDirtyAtom } from '~/stores/dirty-tracking'
import { pipelineNodesAtom } from '~/stores/pipeline-atoms'

// -- Types --------------------------------------------------------------------

interface StepIdentitySectionProps {
    /** React Flow node ID for updating the atom. */
    nodeId: string
    /** Current node data snapshot. */
    nodeData: WorkflowNodeData
}

// -- Component ----------------------------------------------------------------

/**
 * Identity section of the step configuration panel.
 *
 * Provides editable fields for:
 * - Step name (text input)
 * - Description (textarea)
 * - Step type (read-only badge)
 * - Enabled toggle (switch)
 *
 * Changes update `pipelineNodesAtom` directly and mark config as dirty.
 */
export function StepIdentitySection({
    nodeId,
    nodeData,
}: StepIdentitySectionProps) {
    const [open, setOpen] = useState(true)
    const [, setNodes] = useAtom(pipelineNodesAtom)
    const [, markDirty] = useAtom(markDirtyAtom)

    const updateNodeData = useCallback(
        (updates: Partial<WorkflowNodeData>) => {
            setNodes((prev) =>
                prev.map((n) =>
                    n.id === nodeId
                        ? { ...n, data: { ...n.data, ...updates } }
                        : n
                )
            )
            markDirty('config')
        },
        [nodeId, setNodes, markDirty]
    )

    const handleNameChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            updateNodeData({ label: e.target.value })
        },
        [updateNodeData]
    )

    const handleDescriptionChange = useCallback(
        (e: ChangeEvent<HTMLTextAreaElement>) => {
            updateNodeData({ description: e.target.value })
        },
        [updateNodeData]
    )

    const handleEnabledToggle = useCallback(
        (checked: boolean) => {
            // Store enabled state in the purpose field as a convention
            // (the node_type schema doesn't have an enabled field)
            updateNodeData({
                purpose: checked ? '' : 'disabled',
            })
        },
        [updateNodeData]
    )

    const isEnabled = nodeData.purpose !== 'disabled'

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-muted/50">
                <span>Identity</span>
                <ChevronDown
                    className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        open && 'rotate-180'
                    )}
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 px-2 pb-3">
                {/* Step name */}
                <div className="space-y-1.5">
                    <Label htmlFor={`step-name-${nodeId}`} className="text-xs">
                        Name
                    </Label>
                    <Input
                        id={`step-name-${nodeId}`}
                        value={nodeData.label}
                        onChange={handleNameChange}
                        className="h-8 text-sm"
                        placeholder="Step name"
                    />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                    <Label htmlFor={`step-desc-${nodeId}`} className="text-xs">
                        Description
                    </Label>
                    <Textarea
                        id={`step-desc-${nodeId}`}
                        value={nodeData.description}
                        onChange={handleDescriptionChange}
                        className="min-h-[60px] resize-none text-sm"
                        placeholder="Step description"
                        rows={2}
                    />
                </div>

                {/* Step type badge + enabled toggle */}
                <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs capitalize">
                        {nodeData.node_type}
                    </Badge>
                    <div className="flex items-center gap-2">
                        <Label
                            htmlFor={`step-enabled-${nodeId}`}
                            className="text-xs text-muted-foreground"
                        >
                            Enabled
                        </Label>
                        <Switch
                            id={`step-enabled-${nodeId}`}
                            checked={isEnabled}
                            onCheckedChange={handleEnabledToggle}
                        />
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
