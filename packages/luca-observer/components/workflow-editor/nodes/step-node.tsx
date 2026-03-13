"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { WorkflowNodeData } from "~/lib/workflow-types";

/**
 * Custom React Flow node for pipeline stage steps.
 *
 * Renders as a rounded rectangle with the stage name prominently displayed.
 * Uses the primary color for borders and a subtle background fill.
 * These nodes form the pipeline spine: classify → discuss → plan → execute → verify → learn.
 */
export function StepNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData;

  return (
    <div className="rounded-lg border-2 border-primary bg-primary/10 px-6 py-3 text-center shadow-md">
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <div className="text-sm font-semibold text-primary">{nodeData.label}</div>
      {nodeData.description && (
        <div className="mt-1 max-w-[180px] text-[10px] leading-tight text-muted-foreground">
          {nodeData.description}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary"
      />
    </div>
  );
}
