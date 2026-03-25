"use client";

import { useAtomValue } from "jotai";

import { StepIdentitySection } from "~/components/workflow/step-identity-section";
import { StepRoutingSection } from "~/components/workflow/step-routing-section";
import { StepBudgetsSection } from "~/components/workflow/step-budgets-section";
import { StepAgentsSection } from "~/components/workflow/step-agents-section";
import { StepGatesSection } from "~/components/workflow/step-gates-section";
import { pipelineNodesAtom } from "~/stores/pipeline-atoms";
import type { WorkflowNodeData } from "~/lib/workflow-types";

// -- Types --------------------------------------------------------------------

interface StepConfigPanelProps {
  /** ID of the pipeline node to configure. */
  nodeId: string;
}

// -- Component ----------------------------------------------------------------

/**
 * Step configuration panel with 5 collapsible sections.
 *
 * Renders inside the DetailPanel when a pipeline node is clicked.
 * Reads the selected node's data from `pipelineNodesAtom` and provides
 * editors for: Identity, Model Routing, Loop Budgets, Agents, and Gates.
 *
 * Configuration changes are applied via two paths:
 * - Some sections (e.g. `StepIdentitySection`) update `pipelineNodesAtom` directly
 *   for fields stored on the node itself.
 * - Other sections write to `configDraftAtom` and trigger `markDirtyAtom("config")`
 *   for draft configuration changes.
 *
 * @param nodeId - The React Flow node ID to configure.
 */
export function StepConfigPanel({ nodeId }: StepConfigPanelProps) {
  const nodes = useAtomValue(pipelineNodesAtom);
  const node = nodes.find((n) => n.id === nodeId);

  if (!node) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-muted-foreground">Node not found</p>
      </div>
    );
  }

  const nodeData = node.data as WorkflowNodeData;

  return (
    <div className="flex flex-col gap-0.5 p-3">
      <StepIdentitySection nodeId={nodeId} nodeData={nodeData} />
      <StepRoutingSection nodeData={nodeData} />
      <StepBudgetsSection nodeId={nodeId} />
      <StepAgentsSection nodeData={nodeData} />
      <StepGatesSection nodeId={nodeId} />
    </div>
  );
}
