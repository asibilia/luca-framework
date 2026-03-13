"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { WorkflowNodeData } from "~/lib/workflow-types";

/**
 * Custom React Flow node for complexity gates (decision points).
 *
 * Renders as a diamond-shaped node with a warning-colored border.
 * Gates determine model tier routing based on complexity level and
 * conditionally enable/disable downstream agent nodes.
 */
export function GateNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData;

  return (
    <div className="flex items-center justify-center">
      <Handle type="target" position={Position.Left} className="!bg-warning" />
      <div className="rotate-45 rounded-sm border-2 border-warning bg-warning/10 p-3 shadow-md">
        <div className="-rotate-45 whitespace-nowrap text-center">
          <div className="text-[10px] font-semibold text-warning">
            {nodeData.label}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-warning" />
    </div>
  );
}
