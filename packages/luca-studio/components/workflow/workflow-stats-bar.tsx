'use client'

import type { Node, Edge } from '@xyflow/react'
import countBy from 'lodash/countBy'

import {
    NODE_TYPE_COLORS,
    NODE_TYPE_COLOR_DEFAULT,
} from '~/lib/workflow-constants'
import type { WorkflowNodeData } from '~/lib/workflow-types'

/** Safely resolve a node type's Tailwind dot class. */
function dotClass(nodeType: string): string {
    return (
        NODE_TYPE_COLORS[nodeType]?.tailwind ?? NODE_TYPE_COLOR_DEFAULT.tailwind
    )
}

// -- Types --------------------------------------------------------------------

interface WorkflowStatsBarProps {
    nodes: Node<WorkflowNodeData>[]
    edges: Edge[]
}

// -- Component ----------------------------------------------------------------

/**
 * Compact statistics legend for the workflow editor.
 *
 * Displays counts with colored dots for stages, agents, gates, and edges.
 * Rendered inside a React Flow `<Panel position="top-left">` by the canvas.
 */
export function WorkflowStatsBar({ nodes, edges }: WorkflowStatsBarProps) {
    const counts = countBy(
        nodes,
        (n) => (n.data as WorkflowNodeData)?.node_type
    )
    const stages = counts['stage-group'] ?? 0
    const agents = counts['agent'] ?? 0
    const skills = counts['skill'] ?? 0
    const gates = counts['gate'] ?? 0
    const edgeCount = edges.length

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg shadow-black/20 backdrop-blur-sm">
            <span className="flex items-center gap-1.5">
                <span
                    className={`h-2 w-2 rounded-full ${dotClass('stage-group')}`}
                />
                <strong className="text-foreground">{stages}</strong> stages
            </span>
            <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dotClass('agent')}`} />
                <strong className="text-foreground">{agents}</strong> agents
            </span>
            {skills > 0 && (
                <span className="flex items-center gap-1.5">
                    <span
                        className={`h-2 w-2 rounded-full ${dotClass('skill')}`}
                    />
                    <strong className="text-foreground">{skills}</strong> skills
                </span>
            )}
            {gates > 0 && (
                <span className="flex items-center gap-1.5">
                    <span
                        className={`h-2 w-2 rounded-full ${dotClass('gate')}`}
                    />
                    <strong className="text-foreground">{gates}</strong> gates
                </span>
            )}
            <span className="flex items-center gap-1.5">
                <strong className="text-foreground">{edgeCount}</strong> edges
            </span>
        </div>
    )
}
