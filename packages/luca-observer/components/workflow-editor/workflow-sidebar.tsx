"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { TIER_DISPLAY_CONFIG } from "~/lib/workflow-constants";
import { resolveTierAtComplexity } from "~/lib/workflow-topology";
import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Types --------------------------------------------------------------------

interface WorkflowSidebarProps {
  selectedNode: { id: string; data: WorkflowNodeData } | null;
  onClose: () => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  "stage-group": "Pipeline Stage",
  agent: "Agent",
  skill: "Skill",
  gate: "Complexity Gate",
};

// -- Section component --------------------------------------------------------

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {title}
      </div>
      {children}
    </div>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <span className="text-[10px] text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="text-xs text-foreground/80 text-right">{children}</span>
    </div>
  );
}

// -- Type-specific renderers --------------------------------------------------

function StageGroupDetails({ data }: { data: WorkflowNodeData }) {
  return (
    <div className="space-y-4">
      <SidebarSection title="Stage">
        <PropertyRow label="Name">{data.label}</PropertyRow>
        {data.stage && <PropertyRow label="Stage">{data.stage}</PropertyRow>}
      </SidebarSection>

      <Separator />

      {data.description && (
        <SidebarSection title="Description">
          <p className="text-xs leading-relaxed text-foreground/80">
            {data.description}
          </p>
        </SidebarSection>
      )}
    </div>
  );
}

function AgentDetails({ id, data }: { id: string; data: WorkflowNodeData }) {
  // Dynamic tier resolution: use routing preset + selected complexity when
  // available, otherwise fall back to the default model_tier.
  const resolvedTier =
    data.selected_complexity && data.routing_preset
      ? resolveTierAtComplexity(data.routing_preset, data.selected_complexity)
      : (data.model_tier ?? null);

  const tierConfig = resolvedTier
    ? (TIER_DISPLAY_CONFIG[resolvedTier] ?? TIER_DISPLAY_CONFIG["fast"])
    : null;

  return (
    <div className="space-y-4">
      <SidebarSection title="Identity">
        <PropertyRow label="Name">
          <span className="font-mono">{data.label}</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="font-mono text-[10px] text-muted-foreground">
            {id}
          </span>
        </PropertyRow>
        {data.stage && <PropertyRow label="Stage">{data.stage}</PropertyRow>}
      </SidebarSection>

      <Separator />

      {data.description && (
        <SidebarSection title="Description">
          <p className="text-xs leading-relaxed text-foreground/80">
            {data.description}
          </p>
        </SidebarSection>
      )}

      <Separator />

      <SidebarSection title="Configuration">
        {data.purpose && (
          <PropertyRow label="Purpose">{data.purpose}</PropertyRow>
        )}
        {data.routing_preset && (
          <PropertyRow label="Routing Preset">
            <span
              className={
                tierConfig?.dotColor.replace("bg-", "text-") ??
                "text-muted-foreground"
              }
            >
              {data.routing_preset}
            </span>
          </PropertyRow>
        )}
      </SidebarSection>

      {tierConfig && (
        <>
          <Separator />
          <SidebarSection title="Routing">
            <div className="space-y-1.5">
              <Badge variant={tierConfig.variant} className="text-[10px]">
                {tierConfig.label}
              </Badge>
              <p className="text-[10px] text-muted-foreground/70">
                {tierConfig.description}
              </p>
            </div>
          </SidebarSection>
        </>
      )}
    </div>
  );
}

function GateDetails({ id, data }: { id: string; data: WorkflowNodeData }) {
  return (
    <div className="space-y-4">
      <SidebarSection title="Identity">
        <PropertyRow label="Name">
          <span className="font-mono">{data.label}</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="font-mono text-[10px] text-muted-foreground">
            {id}
          </span>
        </PropertyRow>
        {data.stage && <PropertyRow label="Stage">{data.stage}</PropertyRow>}
      </SidebarSection>

      <Separator />

      {data.description && (
        <SidebarSection title="Description">
          <p className="text-xs leading-relaxed text-foreground/80">
            {data.description}
          </p>
        </SidebarSection>
      )}

      <Separator />

      <SidebarSection title="Gate Info">
        <p className="text-[10px] text-muted-foreground/70">
          Determines model tiers for downstream agents based on task complexity
          classification.
        </p>
      </SidebarSection>
    </div>
  );
}

function SkillDetails({ id, data }: { id: string; data: WorkflowNodeData }) {
  return (
    <div className="space-y-4">
      <SidebarSection title="Identity">
        <PropertyRow label="Name">
          <span className="font-mono">/{data.label}</span>
        </PropertyRow>
        <PropertyRow label="ID">
          <span className="font-mono text-[10px] text-muted-foreground">
            {id}
          </span>
        </PropertyRow>
        {data.stage && <PropertyRow label="Stage">{data.stage}</PropertyRow>}
      </SidebarSection>

      <Separator />

      {data.description && (
        <SidebarSection title="Description">
          <p className="text-xs leading-relaxed text-foreground/80">
            {data.description}
          </p>
        </SidebarSection>
      )}

      {data.purpose && (
        <>
          <Separator />
          <SidebarSection title="Purpose">
            <p className="text-xs text-foreground/80">{data.purpose}</p>
          </SidebarSection>
        </>
      )}
    </div>
  );
}

// -- Main component -----------------------------------------------------------

/**
 * Inspection sidebar for the workflow editor.
 *
 * Displays type-aware details about the selected node. Different node types
 * get different field layouts:
 * - **stage-group**: Stage name, description, children summary
 * - **agent**: Identity, description, configuration, routing (tier)
 * - **gate**: Identity, description, gate info
 * - **skill**: Identity, description, purpose
 *
 * @param selectedNode - Currently selected node data, or null if none selected
 * @param onClose - Callback to close the sidebar (Escape key or close button)
 */
export function WorkflowSidebar({
  selectedNode,
  onClose,
}: WorkflowSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus the close button when a node is selected; restore focus on close
  useEffect(() => {
    if (selectedNode) {
      previousFocusRef.current = document.activeElement;
      // Small delay to allow React to render the button before focusing
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    } else if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [selectedNode]);

  if (!selectedNode) return null;

  const { id, data } = selectedNode;
  const nodeTypeLabel = NODE_TYPE_LABELS[data.node_type] ?? "Node";

  return (
    <div
      className="absolute right-0 top-0 z-10 flex h-full w-72 flex-col border-l border-border/30 bg-card/95 backdrop-blur-sm"
      aria-label="Node details"
      role="complementary"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {nodeTypeLabel}
          </Badge>
          <h3 className="text-sm font-semibold text-foreground truncate">
            {data.label}
          </h3>
        </div>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close sidebar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content — type-specific */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {data.node_type === "stage-group" && <StageGroupDetails data={data} />}
        {data.node_type === "agent" && <AgentDetails id={id} data={data} />}
        {data.node_type === "gate" && <GateDetails id={id} data={data} />}
        {data.node_type === "skill" && <SkillDetails id={id} data={data} />}
      </div>

      {/* Footer hint */}
      <div className="border-t border-border/30 px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          Press Escape to close
        </p>
      </div>
    </div>
  );
}
