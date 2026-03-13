"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { WorkflowNodeDataSchema } from "~/lib/workflow-types";

/**
 * Custom React Flow node for complexity gates (decision points).
 *
 * Renders as an amber-accented card (no longer a diamond). Shows the
 * gate name and description in a compact format matching agent cards.
 */
export function GateNode({ data, id }: NodeProps) {
  const parseResult = WorkflowNodeDataSchema.safeParse(data);

  if (!parseResult.success) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-card/95 p-3 w-[250px]">
        <span className="font-mono text-[10px] text-destructive">
          {id ?? "unknown"}: Invalid data
        </span>
      </div>
    );
  }

  const nodeData = parseResult.data;

  return (
    <div className="rounded-lg border border-amber-400/40 bg-card/95 shadow-md shadow-black/10 w-[250px] overflow-hidden">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-400/60 !w-2 !h-2"
      />
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10">
        <span className="inline-block h-2 w-2 rounded-sm bg-amber-400 shrink-0" />
        <span className="font-mono text-xs font-semibold text-amber-400 truncate">
          {nodeData.label}
        </span>
        <span className="text-[9px] text-amber-400/60 ml-auto shrink-0">
          gate
        </span>
      </div>
      {/* Body */}
      {nodeData.description && (
        <div className="px-3 py-2">
          <div className="text-[10px] leading-snug text-muted-foreground/80 line-clamp-2">
            {nodeData.description}
          </div>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-amber-400/60 !w-2 !h-2"
      />
    </div>
  );
}
