"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { TIER_DISPLAY_CONFIG } from "~/lib/workflow-constants";
import { resolveTierAtComplexity } from "~/lib/workflow-topology";
import {
  WorkflowNodeDataSchema,
  type WorkflowNodeData,
} from "~/lib/workflow-types";

/**
 * Custom React Flow node for agent instances (lu-router, lu-executor, etc.).
 *
 * Header/body card layout with model tier accent color. Header shows agent
 * name with tier dot and badge. Body shows description and property badges.
 */
export function AgentNode({ data, id }: NodeProps) {
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

  // Dynamic tier resolution: if a complexity level is selected and the agent
  // has a routing preset, resolve the tier at that complexity. Otherwise fall
  // back to the default model_tier (MODERATE tier from topology data).
  const resolvedTier =
    nodeData.selected_complexity && nodeData.routing_preset
      ? resolveTierAtComplexity(
          nodeData.routing_preset,
          nodeData.selected_complexity,
        )
      : (nodeData.model_tier ?? "fast");

  const tier = TIER_DISPLAY_CONFIG[resolvedTier] ?? TIER_DISPLAY_CONFIG["fast"];
  if (!tier) return null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/95 shadow-md shadow-black/10 w-[250px] overflow-hidden",
        tier.borderClass,
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-white/50 !w-2 !h-2 !border !border-white/20"
      />
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2", tier.headerBg)}>
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full shrink-0",
            tier.dotColor,
          )}
        />
        <span className="font-mono text-xs font-semibold text-foreground truncate">
          {nodeData.label}
        </span>
        <Badge
          variant={tier.variant}
          className="text-[9px] ml-auto shrink-0 py-0 px-1.5"
        >
          {tier.label}
        </Badge>
      </div>
      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {nodeData.description && (
          <div className="text-[10px] leading-snug text-muted-foreground/80 line-clamp-2">
            {nodeData.description}
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {nodeData.purpose && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-muted/50 text-muted-foreground">
              {nodeData.purpose}
            </span>
          )}
          {nodeData.routing_preset && (
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                tier.headerBg,
                tier.dotColor.replace("bg-", "text-"),
              )}
            >
              {nodeData.routing_preset}
            </span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-white/50 !w-2 !h-2 !border !border-white/20"
      />
    </div>
  );
}
