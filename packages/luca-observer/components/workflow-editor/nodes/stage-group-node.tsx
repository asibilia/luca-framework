"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cn } from "~/lib/utils";
import {
  WorkflowNodeDataSchema,
  type WorkflowNodeData,
} from "~/lib/workflow-types";

// -- Stage color palette (hex for SVG reliability) ----------------------------

const STAGE_COLORS: Record<
  string,
  { border: string; bg: string; text: string; accent: string }
> = {
  entry: {
    border: "border-yellow-400/40",
    bg: "bg-yellow-500/5",
    text: "text-yellow-400",
    accent: "bg-yellow-400",
  },
  classify: {
    border: "border-blue-400/40",
    bg: "bg-blue-500/5",
    text: "text-blue-400",
    accent: "bg-blue-400",
  },
  discuss: {
    border: "border-violet-400/40",
    bg: "bg-violet-500/5",
    text: "text-violet-400",
    accent: "bg-violet-400",
  },
  plan: {
    border: "border-emerald-400/40",
    bg: "bg-emerald-500/5",
    text: "text-emerald-400",
    accent: "bg-emerald-400",
  },
  execute: {
    border: "border-orange-400/40",
    bg: "bg-orange-500/5",
    text: "text-orange-400",
    accent: "bg-orange-400",
  },
  verify: {
    border: "border-cyan-400/40",
    bg: "bg-cyan-500/5",
    text: "text-cyan-400",
    accent: "bg-cyan-400",
  },
  learn: {
    border: "border-pink-400/40",
    bg: "bg-pink-500/5",
    text: "text-pink-400",
    accent: "bg-pink-400",
  },
};

const DEFAULT_COLORS = {
  border: "border-primary/40",
  bg: "bg-primary/5",
  text: "text-primary",
  accent: "bg-primary",
};

/**
 * Stage group container node for the workflow editor.
 *
 * Renders as a container with a colored header bar. React Flow places
 * child nodes inside automatically via parentId. The header shows the
 * stage name with a colored left accent bar and a description.
 */
export function StageGroupNode({ data, id }: NodeProps) {
  const parseResult = WorkflowNodeDataSchema.safeParse(data);

  if (!parseResult.success) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-card/95 p-4">
        <span className="font-mono text-[10px] text-destructive">
          {id ?? "unknown"}: Invalid data
        </span>
      </div>
    );
  }

  const nodeData = parseResult.data;
  const colors = STAGE_COLORS[nodeData.stage ?? ""] ?? DEFAULT_COLORS;

  return (
    <div
      className={cn(
        "rounded-xl border shadow-lg shadow-black/10 h-full w-full",
        colors.border,
        colors.bg,
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-white/60 !w-3 !h-3 !border-2 !border-white/30"
      />
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn("h-5 w-1 rounded-full", colors.accent)} />
        <div className={cn("text-sm font-bold tracking-wide", colors.text)}>
          {nodeData.label}
        </div>
        <div className="ml-auto text-[10px] text-muted-foreground/60">
          {nodeData.description}
        </div>
      </div>
      {/* Body is empty — React Flow renders children here via parentId */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-white/60 !w-3 !h-3 !border-2 !border-white/30"
      />
    </div>
  );
}
