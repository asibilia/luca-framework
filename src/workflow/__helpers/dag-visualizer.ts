/**
 * Transform a WorkflowDAG into the WorkflowTopologyResponse format
 * consumed by luca-observer's React Flow workflow editor.
 *
 * Maps DAG steps to TopologyNode/TopologyEdge structures, preserving
 * the stage-group container pattern used by the existing editor.
 *
 * @see packages/luca-observer/lib/workflow-types.ts — target schema
 * @see packages/luca-observer/lib/workflow-topology.ts — reference impl
 * @see docs/runtime-architecture/dag-workflow-engine.md — DAG design
 */

import type {
  WorkflowDAG,
  WorkflowStep,
  StepCategory,
} from "../__schemas/workflow.schemas.ts";

// ─── Types (matching luca-observer's WorkflowTopologyResponse) ──────────────

/**
 * Topology node in the format luca-observer expects.
 *
 * NOTE: These types mirror luca-observer/lib/workflow-types.ts but are defined
 * here to avoid a cross-package import. They are structurally compatible —
 * the observer validates via Zod at the API boundary.
 */
interface TopologyNode {
  id: string;
  position: { x: number; y: number };
  data: {
    node_type: "stage-group" | "agent" | "skill" | "gate";
    label: string;
    description: string;
    stage?: string;
    model_tier?: string;
    routing_preset?: string;
    purpose: string;
    color: string;
  };
  type: string;
  parent_id?: string;
  extent?: "parent";
  style?: Record<string, string | number>;
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    edge_type: "spawns" | "gates" | "data-flow";
    label: string;
    condition?: string;
  };
}

interface TopologyResponse {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  stages: string[];
  selected_complexity?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Category-to-stage mapping.
 *
 * StepCategory from WorkflowStepSchema maps to WorkflowStage from
 * luca-observer. "gate" is not a stage — gate steps inherit the stage
 * of their first dependency.
 */
const CATEGORY_TO_STAGE: Record<string, string> = {
  classify: "classify",
  discuss: "discuss",
  plan: "plan",
  execute: "execute",
  verify: "verify",
  learn: "learn",
  commit: "learn", // commit is part of the learn/wrap-up stage
  gate: "", // resolved from dependencies
};

/**
 * Category-to-node_type mapping.
 *
 * Most DAG steps become "agent" nodes. "gate" category steps become
 * "gate" nodes. Steps with handler names matching known skills become
 * "skill" nodes.
 */
const KNOWN_SKILL_HANDLERS = new Set([
  "phase-discuss",
  "phase-plan",
  "phase-execute",
  "phase-research",
  "verify",
  "lu",
  "autopilot",
  "debug",
  "quick",
  "git-commit",
]);

// ─── Container sizing (mirrors luca-observer/lib/workflow-topology.ts) ──────

const HEADER_HEIGHT = 50;
const CHILD_PADDING_TOP = 10;
const CHILD_PADDING_SIDES = 20;
const COLUMN_WIDTH = 260;
const COLUMN_GAP = 16;
const ROW_HEIGHT = 95;
const BOTTOM_PADDING = 16;
const GROUP_Y_GAP = 40;

function computeContainerSize(childCount: number): {
  width: number;
  height: number;
} {
  const cols =
    childCount >= 8 ? Math.min(childCount, 3) : Math.min(childCount, 2);
  const rows = Math.ceil(childCount / Math.max(cols, 1));
  const width =
    CHILD_PADDING_SIDES * 2 +
    cols * COLUMN_WIDTH +
    (cols > 1 ? (cols - 1) * COLUMN_GAP : 0);
  const height =
    HEADER_HEIGHT + CHILD_PADDING_TOP + rows * ROW_HEIGHT + BOTTOM_PADDING;
  return { width, height };
}

function childPosition(
  index: number,
  colCount: number,
): { x: number; y: number } {
  const col = index % colCount;
  const row = Math.floor(index / colCount);
  return {
    x: CHILD_PADDING_SIDES + col * (COLUMN_WIDTH + COLUMN_GAP),
    y: HEADER_HEIGHT + CHILD_PADDING_TOP + row * ROW_HEIGHT,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the stage for a step based on its category.
 * Gate steps inherit the stage from their first dependency.
 */
function resolveStage(
  step: WorkflowStep,
  stepsById: Map<string, WorkflowStep>,
): string {
  const category = step.metadata?.category;
  if (!category) return "execute"; // fallback

  if (category !== "gate") {
    return CATEGORY_TO_STAGE[category] ?? "execute";
  }

  // Gate: inherit stage from first dependency
  for (const depId of step.dependsOn) {
    const dep = stepsById.get(depId);
    if (dep) {
      return resolveStage(dep, stepsById);
    }
  }
  return "classify"; // fallback for root gates
}

/**
 * Resolve the node_type for a step.
 */
function resolveNodeType(step: WorkflowStep): "agent" | "skill" | "gate" {
  if (step.metadata?.category === "gate") return "gate";
  if (KNOWN_SKILL_HANDLERS.has(step.handler)) return "skill";
  return "agent";
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Transform a WorkflowDAG into luca-observer's topology format.
 *
 * Creates stage-group container nodes (one per unique stage in the DAG),
 * nests step nodes inside them via parent_id, and generates data-flow
 * edges from dependsOn relationships.
 *
 * The output is structurally compatible with the WorkflowTopologyResponseSchema
 * in packages/luca-observer/lib/workflow-types.ts and can be served from an
 * API endpoint or passed directly to the observer's useWorkflowGraph hook.
 *
 * @param dag - The WorkflowDAG to transform
 * @param complexity - Optional complexity level for downstream tier resolution
 * @returns TopologyResponse compatible with luca-observer's React Flow editor
 *
 * @example
 * ```typescript
 * import { dagToTopology } from "~/workflow";
 * import { phasePipelineDAG } from "~/workflow";
 *
 * const topology = dagToTopology(phasePipelineDAG);
 * // topology.nodes: stage-group containers + step nodes with parent_id
 * // topology.edges: data-flow edges from dependsOn relationships
 * // topology.stages: ordered list of unique stages
 * ```
 */
export function dagToTopology(
  dag: WorkflowDAG,
  complexity?: string,
): TopologyResponse {
  const stepsById = new Map<string, WorkflowStep>();
  for (const step of dag.steps) {
    stepsById.set(step.id, step);
  }

  // Resolve stage for each step
  const stepStages = new Map<string, string>();
  for (const step of dag.steps) {
    stepStages.set(step.id, resolveStage(step, stepsById));
  }

  // Collect unique stages in pipeline order
  const STAGE_ORDER = [
    "entry",
    "classify",
    "discuss",
    "plan",
    "execute",
    "verify",
    "learn",
  ];
  const usedStages = new Set(stepStages.values());
  const orderedStages = STAGE_ORDER.filter((s) => usedStages.has(s));

  // Group steps by stage
  const stepsByStage = new Map<string, WorkflowStep[]>();
  for (const stage of orderedStages) {
    stepsByStage.set(stage, []);
  }
  for (const step of dag.steps) {
    const stage = stepStages.get(step.id)!;
    const group = stepsByStage.get(stage);
    if (group) {
      group.push(step);
    }
  }

  // Stage descriptions (subset of luca-observer's STAGE_DESCRIPTIONS)
  const STAGE_DESCRIPTIONS: Record<string, string> = {
    entry: "Entry point for workflow invocation",
    classify: "Route task complexity via lu-router",
    discuss: "Gather context and resolve gray areas",
    plan: "Generate PLAN.md with atomic tasks",
    execute: "Implement code changes via lu-executor",
    verify: "Verify results via harness and lu-verifier",
    learn: "Capture patterns, decisions, pitfalls",
  };

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  // Build stage-group container nodes
  let currentY = 0;
  for (const stage of orderedStages) {
    const children = stepsByStage.get(stage) ?? [];
    const { width, height } = computeContainerSize(
      Math.max(children.length, 1),
    );
    const groupId = `group-${stage}`;

    nodes.push({
      id: groupId,
      position: { x: 0, y: currentY },
      type: "default",
      data: {
        node_type: "stage-group",
        label: stage.charAt(0).toUpperCase() + stage.slice(1),
        description: STAGE_DESCRIPTIONS[stage] ?? "",
        stage,
        purpose: "pipeline-stage",
        color: "",
      },
      style: { width, height },
    });

    currentY += height + GROUP_Y_GAP;
  }

  // Build child nodes nested inside stage-group containers
  for (const stage of orderedStages) {
    const children = stepsByStage.get(stage) ?? [];
    const groupId = `group-${stage}`;
    const colCount = children.length >= 8 ? 3 : 2;

    children.forEach((step, i) => {
      const pos = childPosition(i, colCount);
      const nodeType = resolveNodeType(step);

      nodes.push({
        id: step.id,
        position: pos,
        type: "default",
        data: {
          node_type: nodeType,
          label: step.name,
          description: step.metadata?.description ?? "",
          stage,
          purpose: step.handler,
          color: "",
        },
        parent_id: groupId,
        extent: "parent",
      });
    });
  }

  // Build spine edges between stage-group containers
  for (let i = 0; i < orderedStages.length - 1; i++) {
    edges.push({
      id: `spine-${orderedStages[i]}-${orderedStages[i + 1]}`,
      source: `group-${orderedStages[i]}`,
      target: `group-${orderedStages[i + 1]}`,
      data: {
        edge_type: "data-flow",
        label: "",
      },
    });
  }

  // Build dependency edges between step nodes
  for (const step of dag.steps) {
    for (const depId of step.dependsOn) {
      edges.push({
        id: `dep-${depId}-${step.id}`,
        source: depId,
        target: step.id,
        data: {
          edge_type: "data-flow",
          label: "",
        },
      });
    }
  }

  return {
    nodes,
    edges,
    stages: orderedStages,
    selected_complexity: complexity,
  };
}
