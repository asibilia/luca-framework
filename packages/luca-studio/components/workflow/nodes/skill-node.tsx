'use client'

import type { NodeProps } from '@xyflow/react'

import { NodeCard } from '~/components/workflow/nodes/node-card'
import { WorkflowNodeDataSchema } from '~/lib/workflow-types'

/**
 * Custom React Flow node for skill instances (phase-discuss, phase-plan, etc.).
 *
 * Renders as a violet-accented card via NodeCard. Shows a "/" trigger prefix
 * in the header and an optional purpose badge in the body.
 *
 * Skill handles use the same shared style as other card nodes (via NodeCard).
 * The violet accent is expressed through the border and header background,
 * not through handle coloring.
 */
export function SkillNode({ data, id }: NodeProps) {
    const parseResult = WorkflowNodeDataSchema.safeParse(data)

    if (!parseResult.success) {
        return (
            <div className="rounded-lg border border-destructive/40 bg-card/95 p-3 w-[250px]">
                <span className="font-mono text-[10px] text-destructive">
                    {id ?? 'unknown'}: Invalid data
                </span>
            </div>
        )
    }

    const nodeData = parseResult.data

    return (
        <NodeCard
            borderClass="border-violet-500/40"
            headerBg="bg-violet-500/10"
            header={
                <>
                    <span className="text-xs font-medium text-violet-400/60">
                        /
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                        {nodeData.label}
                    </span>
                    <span className="text-[10px] text-violet-400/60 ml-auto shrink-0">
                        skill
                    </span>
                </>
            }
            body={
                <>
                    {nodeData.description && (
                        <div className="text-[10px] leading-snug text-muted-foreground/80 line-clamp-2">
                            {nodeData.description}
                        </div>
                    )}
                    {nodeData.purpose && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-400">
                            {nodeData.purpose}
                        </span>
                    )}
                </>
            }
        />
    )
}
