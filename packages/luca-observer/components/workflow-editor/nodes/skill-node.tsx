"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { WorkflowNodeData } from "~/lib/workflow-types";

/**
 * Custom React Flow node for skill instances (phase-discuss, phase-plan, etc.).
 *
 * Renders with an accent-colored border and a subtle trigger indicator
 * showing the skill's purpose. Skills are interactive workflow entry points
 * invoked via `/skill-name` commands.
 */
export function SkillNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData;

  return (
    <div className="rounded-md border border-accent bg-accent/5 px-3 py-2 shadow-sm">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-accent-foreground"
      />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-accent-foreground/60">/</span>
        <span className="font-mono text-xs text-foreground">
          {nodeData.label}
        </span>
      </div>
      {nodeData.purpose && (
        <div className="mt-0.5 text-[9px] text-muted-foreground">
          {nodeData.purpose}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-accent-foreground"
      />
    </div>
  );
}
