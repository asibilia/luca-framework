/**
 * Workflow graph type definitions for the Observer workflow editor.
 *
 * Defines Zod schemas for node data, edge data, and the topology API response.
 * React Flow v12 wraps these as `Node<WorkflowNodeData>` and `Edge<WorkflowEdgeData>`.
 *
 * Uses snake_case for API-facing fields per project convention.
 */
import { z } from "zod";

// -- Enums --------------------------------------------------------------------

/** Node type determines visual appearance and layout grouping. */
export const WorkflowNodeTypeSchema = z.enum([
  "stage-group",
  "agent",
  "skill",
  "gate",
]);
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>;

/** Edge type determines stroke style and animation. */
export const WorkflowEdgeTypeSchema = z.enum(["spawns", "gates", "data-flow"]);
export type WorkflowEdgeType = z.infer<typeof WorkflowEdgeTypeSchema>;

/** Model tier for agent routing (complexity-dependent). */
export const ModelTierSchema = z.enum(["fast", "balanced", "capable"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** Pipeline stage that a node belongs to. */
export const WorkflowStageSchema = z.enum([
  "entry",
  "classify",
  "discuss",
  "plan",
  "execute",
  "verify",
  "learn",
]);
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

// -- Node data ----------------------------------------------------------------

/**
 * Custom data payload for workflow graph nodes.
 *
 * This is the `data` property inside React Flow's `Node<WorkflowNodeData>`.
 * Position, id, and type are managed by React Flow at the Node level.
 */
export const WorkflowNodeDataSchema = z.object({
  node_type: WorkflowNodeTypeSchema,
  label: z.string(),
  description: z.string().default(""),
  stage: WorkflowStageSchema.optional(),
  model_tier: ModelTierSchema.optional(),
  routing_preset: z.string().optional(),
  selected_complexity: z.string().optional(),
  purpose: z.string().default(""),
  color: z.string().default(""),
});
export type WorkflowNodeData = z.infer<typeof WorkflowNodeDataSchema>;

// -- Edge data ----------------------------------------------------------------

/**
 * Custom data payload for workflow graph edges.
 *
 * This is the `data` property inside React Flow's `Edge<WorkflowEdgeData>`.
 */
export const WorkflowEdgeDataSchema = z.object({
  edge_type: WorkflowEdgeTypeSchema,
  label: z.string().default(""),
  condition: z.string().optional(),
});
export type WorkflowEdgeData = z.infer<typeof WorkflowEdgeDataSchema>;

// -- API response -------------------------------------------------------------

/**
 * API Response: Topology node shape (flat for serialization).
 *
 * Combines React Flow positioning with custom data.
 * Uses snake_case for API compatibility.
 */
export const TopologyNodeSchema = z.object({
  id: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: WorkflowNodeDataSchema,
  type: z.string().default("default"),
  parent_id: z.string().optional(),
  extent: z.literal("parent").optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
});
export type TopologyNode = z.infer<typeof TopologyNodeSchema>;

/**
 * API Response: Topology edge shape (flat for serialization).
 *
 * Uses snake_case for API compatibility.
 */
export const TopologyEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  data: WorkflowEdgeDataSchema.optional(),
});
export type TopologyEdge = z.infer<typeof TopologyEdgeSchema>;

/**
 * API Response: Full workflow topology.
 *
 * Returned by GET /api/workflow/topology.
 */
export const WorkflowTopologyResponseSchema = z.object({
  nodes: z.array(TopologyNodeSchema),
  edges: z.array(TopologyEdgeSchema),
  stages: z.array(WorkflowStageSchema),
  selected_complexity: z.string().optional(),
});
export type WorkflowTopologyResponse = z.infer<
  typeof WorkflowTopologyResponseSchema
>;
