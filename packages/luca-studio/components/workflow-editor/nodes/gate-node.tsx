"use client";

import type { NodeProps } from "@xyflow/react";

import { WorkflowNodeDataSchema } from "~/lib/workflow-types";
import { NodeCard } from "~/components/workflow-editor/nodes/node-card";

/**
 * Custom React Flow node for complexity gates (decision points).
 *
 * Renders as an amber-accented card. Shows the gate name and description
 * in a compact format matching agent cards.
 *
 * Gate handles intentionally use the same shared style as other card nodes
 * (via NodeCard). The amber accent is expressed through the border and
 * header background, not through handle coloring.
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
    <NodeCard
      borderClass="border-amber-400/40"
      headerBg="bg-amber-500/10"
      header={
        <>
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400 shrink-0" />
          <span className="font-mono text-xs font-semibold text-amber-400 truncate">
            {nodeData.label}
          </span>
          <span className="text-[10px] text-amber-400/60 ml-auto shrink-0">
            gate
          </span>
        </>
      }
      body={
        nodeData.description ? (
          <div className="text-[10px] leading-snug text-muted-foreground/80 line-clamp-2">
            {nodeData.description}
          </div>
        ) : undefined
      }
    />
  );
}
