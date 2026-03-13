"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Badge } from "~/components/ui/badge";
import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Model tier visual config -------------------------------------------------

const TIER_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline";
    borderClass: string;
  }
> = {
  fast: {
    label: "fast",
    variant: "outline",
    borderClass: "border-muted-foreground/50",
  },
  balanced: {
    label: "balanced",
    variant: "secondary",
    borderClass: "border-info",
  },
  capable: {
    label: "capable",
    variant: "default",
    borderClass: "border-warning",
  },
};

/**
 * Custom React Flow node for agent instances (lu-router, lu-executor, etc.).
 *
 * Displays the agent name with a model tier badge indicating its
 * complexity-dependent routing (fast/balanced/capable). Border color
 * varies by model tier for visual grouping.
 */
export function AgentNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const tier =
    TIER_CONFIG[nodeData.model_tier ?? "fast"] ?? TIER_CONFIG["fast"];
  if (!tier) return null;

  return (
    <div
      className={`rounded-md border bg-card/80 px-3 py-2 shadow-sm ${tier.borderClass}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground"
      />
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground">
          {nodeData.label}
        </span>
        <Badge variant={tier.variant} className="text-[9px]">
          {tier.label}
        </Badge>
      </div>
      {nodeData.complexity_min && (
        <div className="mt-0.5 text-[9px] text-muted-foreground">
          {nodeData.complexity_min}+
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground"
      />
    </div>
  );
}
