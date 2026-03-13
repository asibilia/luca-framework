"use client";

import { Badge } from "~/components/ui/badge";
import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Types --------------------------------------------------------------------

interface WorkflowSidebarProps {
  selectedNode: { id: string; data: WorkflowNodeData } | null;
  onClose: () => void;
}

// -- Model tier display config ------------------------------------------------

const TIER_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  fast: { label: "Fast (Haiku)", variant: "outline" },
  balanced: { label: "Balanced (Sonnet)", variant: "secondary" },
  capable: { label: "Capable (Opus)", variant: "default" },
};

const NODE_TYPE_LABELS: Record<string, string> = {
  step: "Pipeline Stage",
  agent: "Agent",
  skill: "Skill",
  gate: "Complexity Gate",
};

// -- Component ----------------------------------------------------------------

/**
 * Inspection sidebar for the workflow editor.
 *
 * Displays details about the selected node including its type, description,
 * model tier, complexity requirements, and purpose. Slides in from the right
 * when a node is clicked.
 *
 * @param selectedNode - Currently selected node data, or null if none selected
 * @param onClose - Callback to close the sidebar (Escape key or close button)
 */
export function WorkflowSidebar({
  selectedNode,
  onClose,
}: WorkflowSidebarProps) {
  if (!selectedNode) return null;

  const { id, data } = selectedNode;
  const tierConfig = data.model_tier
    ? (TIER_LABELS[data.model_tier] ?? TIER_LABELS["fast"])
    : null;
  const nodeTypeLabel =
    NODE_TYPE_LABELS[data.node_type] ?? NODE_TYPE_LABELS["agent"];

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full w-72 flex-col border-l border-border/30 bg-card/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Node Details</h3>
        <button
          onClick={onClose}
          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Name & Type */}
        <div className="mb-4">
          <div className="font-mono text-sm text-foreground">{data.label}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{id}</div>
        </div>

        {/* Badges row */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[9px]">
            {nodeTypeLabel}
          </Badge>
          {data.stage && (
            <Badge variant="secondary" className="text-[9px]">
              {data.stage}
            </Badge>
          )}
          {tierConfig && (
            <Badge variant={tierConfig.variant} className="text-[9px]">
              {tierConfig.label}
            </Badge>
          )}
        </div>

        {/* Description */}
        {data.description && (
          <div className="mb-4">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">
              {data.description}
            </p>
          </div>
        )}

        {/* Properties */}
        <div className="space-y-2">
          {data.purpose && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Purpose
              </div>
              <div className="text-xs text-foreground/80">{data.purpose}</div>
            </div>
          )}
          {data.complexity_min && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Min. Complexity
              </div>
              <div className="text-xs text-foreground/80">
                {data.complexity_min}+
              </div>
            </div>
          )}
          {data.model_tier && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Model Tier
              </div>
              <div className="text-xs text-foreground/80">
                {data.model_tier}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="border-t border-border/30 px-4 py-2">
        <p className="text-[9px] text-muted-foreground">
          Press Escape to close
        </p>
      </div>
    </div>
  );
}
