'use client'

import { useState } from 'react'

import { ChevronDown, ExternalLink } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '~/components/ui/badge'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '~/components/ui/collapsible'
import { cn } from '~/lib/utils'
import type { WorkflowNodeData } from '~/lib/workflow-types'

// -- Types --------------------------------------------------------------------

interface StepAgentsSectionProps {
    /** Current node data snapshot. */
    nodeData: WorkflowNodeData
}

// -- Component ----------------------------------------------------------------

/**
 * Agents section of the step configuration panel.
 *
 * Displays a list of agents assigned to this pipeline step as clickable
 * links that navigate to `/agents?selected={name}`. Shows an agent count
 * badge in the section header.
 *
 * Currently reads from the node's label as a proxy for agent association
 * (the full agent registry integration will come with config API wiring).
 */
export function StepAgentsSection({ nodeData }: StepAgentsSectionProps) {
    const [open, setOpen] = useState(false)

    // Derive agent name from node data. The node label typically matches
    // an agent name in the registry (e.g., "lu-router", "lu-executor").
    const agentName = nodeData.label
    const isAgentNode = nodeData.node_type === 'agent'
    const agents = isAgentNode ? [agentName] : []

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-muted/50">
                <span className="flex items-center gap-2">
                    Agents
                    {agents.length > 0 && (
                        <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                        >
                            {agents.length}
                        </Badge>
                    )}
                </span>
                <ChevronDown
                    className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        open && 'rotate-180'
                    )}
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-3">
                {agents.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                        No agents assigned to this step.
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {agents.map((name) => (
                            <li key={name}>
                                <Link
                                    href={`/agents?selected=${encodeURIComponent(name)}`}
                                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
                                >
                                    <span className="font-mono">{name}</span>
                                    <ExternalLink className="size-3 text-muted-foreground" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </CollapsibleContent>
        </Collapsible>
    )
}
