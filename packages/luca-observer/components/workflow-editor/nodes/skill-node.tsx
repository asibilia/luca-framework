"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { WorkflowNodeDataSchema } from "~/lib/workflow-types";

/**
 * Custom React Flow node for skill instances (phase-discuss, phase-plan, etc.).
 *
 * Header/body card with violet accent, matching the agent card pattern.
 * Shows a "/" trigger prefix in the header.
 */
export function SkillNode({ data, id }: NodeProps) {
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
    <div className="rounded-lg border border-violet-500/40 bg-card/95 shadow-md shadow-black/10 w-[250px] overflow-hidden">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-white/50 !w-2 !h-2 !border !border-white/20"
      />
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10">
        <span className="text-xs font-medium text-violet-400/60">/</span>
        <span className="font-mono text-xs font-semibold text-foreground truncate">
          {nodeData.label}
        </span>
        <span className="text-[9px] text-violet-400/60 ml-auto shrink-0">
          skill
        </span>
      </div>
      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {nodeData.description && (
          <div className="text-[10px] leading-snug text-muted-foreground/80 line-clamp-2">
            {nodeData.description}
          </div>
        )}
        {nodeData.purpose && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-violet-500/15 text-violet-400">
            {nodeData.purpose}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-white/50 !w-2 !h-2 !border !border-white/20"
      />
    </div>
  );
}
