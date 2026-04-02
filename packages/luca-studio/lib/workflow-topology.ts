/**
 * Static workflow topology data for the Luca autopilot pipeline.
 *
 * Produces **stage-group** container nodes (one per pipeline stage) with
 * agent/skill/gate children nested via React Flow's `parentId` mechanism.
 * The old spine "step" nodes and "invokes" edges are replaced — containment
 * expresses the stage→agent relationship, and thin data-flow edges connect
 * the group containers.
 *
 * This is design-time data, not runtime — the topology represents the
 * workflow architecture, not live execution state.
 */
import filter from "lodash/filter";

import type {
  ModelTier,
  TopologyEdge,
  TopologyNode,
  WorkflowStage,
} from "~/lib/workflow-types";

// -- Container sizing constants -----------------------------------------------

const HEADER_HEIGHT = 50;
const CHILD_PADDING_TOP = 10;
const CHILD_PADDING_SIDES = 20;
const COLUMN_WIDTH = 260;
const COLUMN_GAP = 16;
const ROW_HEIGHT = 95;
const BOTTOM_PADDING = 16;

// -- Pipeline stages ----------------------------------------------------------

const STAGES: WorkflowStage[] = [
  "entry",
  "classify",
  "discuss",
  "plan",
  "execute",
  "verify",
  "learn",
];

const STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  entry: "Entry point skills for workflow invocation",
  classify: "Route task complexity via lu-router",
  discuss: "Gather context and resolve gray areas",
  plan: "Generate PLAN.md with atomic tasks",
  execute: "Implement code changes via lu-executor",
  verify: "Verify results via harness and lu-verifier",
  learn: "Capture patterns, decisions, pitfalls",
};

// -- Routing presets ----------------------------------------------------------

// DUPLICATION NOTE: This is a read-only mirror of MODEL_ROUTING_TABLE
// from src/complexity/__helpers/model-routing.ts.
// Canonical source: src/complexity/__helpers/model-routing.ts
// These cannot be imported directly (Next.js build boundary).
// Keep in sync manually when routing presets change.

/**
 * Model routing presets map complexity levels to model tiers.
 *
 * Each preset defines which model tier (fast/balanced/capable) an agent
 * receives at each complexity level (TRIVIAL through CRITICAL).
 * Mirrors the canonical MODEL_ROUTING_TABLE in src/complexity/.
 */
export const ROUTING_PRESETS: Record<string, Record<string, ModelTier>> = {
  ALWAYS_FAST: {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "fast",
    COMPLEX: "fast",
    CRITICAL: "fast",
  },
  FAST_PROMOTED: {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "fast",
    COMPLEX: "fast",
    CRITICAL: "balanced",
  },
  ROUTER: {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "balanced",
    COMPLEX: "balanced",
    CRITICAL: "balanced",
  },
  ORCHESTRATOR: {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  DEEP_ANALYSIS: {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  DEBUGGER_PRESET: {
    TRIVIAL: "balanced",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  ALWAYS_CAPABLE: {
    TRIVIAL: "capable",
    SIMPLE: "capable",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
};

/**
 * Resolves the model tier for a given routing preset and complexity level.
 *
 * @param preset - Routing preset name (e.g. "ORCHESTRATOR")
 * @param complexity - Complexity level (e.g. "MODERATE")
 * @returns The model tier, defaulting to "balanced" if preset or level not found
 */
export function resolveTierAtComplexity(
  preset: string,
  complexity: string,
): ModelTier {
  const row = ROUTING_PRESETS[preset];
  if (!row) return "balanced";
  return (row[complexity.toUpperCase()] as ModelTier) ?? "balanced";
}

// -- Agent/skill/gate definitions ---------------------------------------------

interface AgentDef {
  id: string;
  label: string;
  stage: WorkflowStage;
  description: string;
  model_tier: "fast" | "balanced" | "capable";
  routing_preset?: string;
  node_type: "agent" | "skill" | "gate";
  purpose: string;
}

// DUPLICATION NOTE: Agent definitions mirrored from src/agents/ and src/skills/.
// Canonical sources: src/agents/*/*.agent.ts, src/skills/*/*.skill.ts
// Update when agents/skills are added, removed, or change stages.

const AGENTS: AgentDef[] = [
  // Classify stage
  {
    id: "lu-cognition",
    label: "lu-cognition",
    stage: "classify",
    description: "Cognitive pre-flight: load project identity, recall patterns",
    model_tier: "fast",
    routing_preset: "ALWAYS_FAST",
    node_type: "agent",
    purpose: "pre-flight",
  },
  {
    id: "lu-router",
    label: "lu-router",
    stage: "classify",
    description: "Classify task complexity (TRIVIAL to CRITICAL)",
    model_tier: "balanced",
    routing_preset: "ROUTER",
    node_type: "agent",
    purpose: "classifier",
  },
  {
    id: "lu-router-fast",
    label: "lu-router-fast",
    stage: "classify",
    description: "Fast-tier classifier for TRIVIAL/SIMPLE tasks",
    model_tier: "fast",
    routing_preset: "FAST_PROMOTED",
    node_type: "agent",
    purpose: "classifier",
  },
  {
    id: "complexity-gate",
    label: "Complexity Gate",
    stage: "classify",
    description: "Determines model tiers for downstream agents",
    model_tier: "fast",
    node_type: "gate",
    purpose: "gate",
  },

  // Discuss stage
  {
    id: "lu-discuss-researcher",
    label: "lu-discuss-researcher",
    stage: "discuss",
    description: "Research gray area questions with citations",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "researcher",
  },
  {
    id: "lu-premortem",
    label: "lu-premortem",
    stage: "discuss",
    description: "Generate failure scenarios and risk brief",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "risk-analysis",
  },

  // Plan stage
  {
    id: "lu-planner",
    label: "lu-planner",
    stage: "plan",
    description: "Create execution plan with goal-backward analysis",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "planner",
  },
  {
    id: "lu-plan-checker",
    label: "lu-plan-checker",
    stage: "plan",
    description: "Verify plan achieves phase goal before execution",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "lu-phase-researcher",
    label: "lu-phase-researcher",
    stage: "plan",
    description: "Research implementation approach before planning",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "researcher",
  },

  // Execute stage
  {
    id: "lu-executor",
    label: "lu-executor",
    stage: "execute",
    description: "Execute plans with atomic commits and deviation handling",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "executor",
  },
  {
    id: "lu-executor-capable",
    label: "lu-executor-capable",
    stage: "execute",
    description: "Capable-tier executor for COMPLEX/CRITICAL tasks",
    model_tier: "capable",
    routing_preset: "ALWAYS_CAPABLE",
    node_type: "agent",
    purpose: "executor",
  },
  {
    id: "lu-test-writer",
    label: "lu-test-writer",
    stage: "execute",
    description: "Generate test files from plan verification criteria",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "testing",
  },

  // Verify stage
  {
    id: "lu-verifier",
    label: "lu-verifier",
    stage: "verify",
    description: "Goal-backward verification of phase achievement",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "lu-verifier-fast",
    label: "lu-verifier-fast",
    stage: "verify",
    description: "Fast-tier verifier for TRIVIAL/SIMPLE tasks",
    model_tier: "fast",
    routing_preset: "FAST_PROMOTED",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "code-architect",
    label: "code-architect",
    stage: "verify",
    description: "Verify code scaffolding and system architecture",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "security-auditor",
    label: "security-auditor",
    stage: "verify",
    description: "Review code for security vulnerabilities",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "dx-advocate",
    label: "dx-advocate",
    stage: "verify",
    description: "Enforce code standards and developer experience",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "performance-auditor",
    label: "performance-auditor",
    stage: "verify",
    description: "Identify performance bottlenecks",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "code-simplifier",
    label: "code-simplifier",
    stage: "verify",
    description: "Simplify code to reduce complexity",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },

  // Discuss stage — additional agents
  {
    id: "product",
    label: "product",
    stage: "discuss",
    description: "Feature request analysis and product perspective",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "product",
  },

  // Plan stage — additional agents
  {
    id: "lu-repo-mapper",
    label: "lu-repo-mapper",
    stage: "plan",
    description: "Explore codebase and write structured analysis",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "mapper",
  },
  {
    id: "lu-pm-planner",
    label: "lu-pm-planner",
    stage: "plan",
    description: "Usage-aware sprint planner with WSJF scoring",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "planner",
  },
  {
    id: "lu-project-researcher",
    label: "lu-project-researcher",
    stage: "plan",
    description: "Research domain ecosystem before roadmap creation",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "researcher",
  },
  {
    id: "lu-research-synthesizer",
    label: "lu-research-synthesizer",
    stage: "plan",
    description: "Synthesize research outputs from parallel researchers",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "synthesizer",
  },
  {
    id: "lu-roadmap-architect",
    label: "lu-roadmap-architect",
    stage: "plan",
    description: "Assess dependency ordering and architectural impact",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "architect",
  },
  {
    id: "lu-roadmap-prioritizer",
    label: "lu-roadmap-prioritizer",
    stage: "plan",
    description: "WSJF scoring and milestone scoping for roadmap",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "prioritizer",
  },
  {
    id: "lu-roadmap-synthesizer",
    label: "lu-roadmap-synthesizer",
    stage: "plan",
    description: "Merge specialist analyses into unified proposal",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "synthesizer",
  },
  {
    id: "lu-roadmapper",
    label: "lu-roadmapper",
    stage: "plan",
    description: "Create project roadmaps with phase breakdown",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "planner",
  },

  // Execute stage — additional agents
  {
    id: "code-developer",
    label: "code-developer",
    stage: "execute",
    description: "Implementation partner writing production-quality code",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "developer",
  },
  {
    id: "lu-debugger",
    label: "lu-debugger",
    stage: "execute",
    description: "Investigate bugs using scientific method",
    model_tier: "capable",
    routing_preset: "DEBUGGER_PRESET",
    node_type: "agent",
    purpose: "debugger",
  },

  // Verify stage — additional agents
  {
    id: "lu-integration-checker",
    label: "lu-integration-checker",
    stage: "verify",
    description: "Verify cross-phase integration and E2E flows",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "lu-pr-reviewer",
    label: "lu-pr-reviewer",
    stage: "verify",
    description: "Coordinate PR comment review workflow",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "lu-repo-architect",
    label: "lu-repo-architect",
    stage: "verify",
    description: "Audit repository structure and naming conventions",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "lu-roadmap-qa",
    label: "lu-roadmap-qa",
    stage: "verify",
    description: "Testing gap analysis and QA impact assessment",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "qa",
  },
  {
    id: "qa-plan-generator",
    label: "qa-plan-generator",
    stage: "verify",
    description: "Generate QA testing plans for pull requests",
    model_tier: "balanced",
    routing_preset: "ORCHESTRATOR",
    node_type: "agent",
    purpose: "qa",
  },
  {
    id: "ui",
    label: "ui",
    stage: "verify",
    description: "Review visual design and design system consistency",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "ux",
    label: "ux",
    stage: "verify",
    description: "Review user flows and accessibility patterns",
    model_tier: "capable",
    routing_preset: "DEEP_ANALYSIS",
    node_type: "agent",
    purpose: "reviewer",
  },

  // Learn stage
  {
    id: "lu-learner",
    label: "lu-learner",
    stage: "learn",
    description: "Extract validated learnings and write to MuninnDB",
    model_tier: "fast",
    routing_preset: "FAST_PROMOTED",
    node_type: "agent",
    purpose: "learning",
  },
  {
    id: "lu-process-data",
    label: "lu-process-data",
    stage: "learn",
    description: "Compute process metrics from execution data",
    model_tier: "fast",
    routing_preset: "FAST_PROMOTED",
    node_type: "agent",
    purpose: "metrics",
  },

  // -- Skills (no model_tier or routing_preset) --------------------------------

  // Entry stage skills
  {
    id: "lu",
    label: "lu",
    stage: "entry",
    description: "Unified entry point with intelligent routing",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "entry-point",
  },
  {
    id: "autopilot",
    label: "autopilot",
    stage: "entry",
    description: "Autonomous multi-phase orchestrator",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "orchestrator",
  },
  {
    id: "debug",
    label: "debug",
    stage: "entry",
    description: "Debug workflow entry point",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "entry-point",
  },
  {
    id: "quick",
    label: "quick",
    stage: "entry",
    description: "Quick task handler for trivial work",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "entry-point",
  },

  // Discuss stage skill
  {
    id: "phase-discuss",
    label: "phase-discuss",
    stage: "discuss",
    description: "Orchestrate discussion phase with research",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "orchestrator",
  },

  // Plan stage skills
  {
    id: "phase-plan",
    label: "phase-plan",
    stage: "plan",
    description: "Orchestrate planning phase with plan generation",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "orchestrator",
  },
  {
    id: "phase-research",
    label: "phase-research",
    stage: "plan",
    description: "Pre-planning research for implementation approach",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "researcher",
  },

  // Execute stage skill
  {
    id: "phase-execute",
    label: "phase-execute",
    stage: "execute",
    description: "Orchestrate execution, spawn agents per plan",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "orchestrator",
  },

  // Verify stage skill
  {
    id: "verify",
    label: "verify",
    stage: "verify",
    description: "Ad-hoc verification outside phase boundary",
    model_tier: "balanced",
    node_type: "skill",
    purpose: "verifier",
  },
];

// -- Container sizing ---------------------------------------------------------

/**
 * Computes the width and height of a group container based on child count.
 *
 * Children are arranged in a 2- or 3-column grid inside the container.
 * Stages with 8+ children use 3 columns to avoid excessive vertical height.
 */
function computeContainerSize(childCount: number): {
  width: number;
  height: number;
} {
  const cols =
    childCount >= 8 ? Math.min(childCount, 3) : Math.min(childCount, 2);
  const rows = Math.ceil(childCount / cols);
  const width =
    CHILD_PADDING_SIDES * 2 +
    cols * COLUMN_WIDTH +
    (cols > 1 ? (cols - 1) * COLUMN_GAP : 0);
  const height =
    HEADER_HEIGHT + CHILD_PADDING_TOP + rows * ROW_HEIGHT + BOTTOM_PADDING;
  return { width, height };
}

/**
 * Computes the position of a child node within its group container.
 *
 * Uses a variable-column grid layout. Positions are relative to the parent.
 *
 * @param index - Zero-based child index
 * @param colCount - Number of columns in the grid
 */
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

// -- Build topology -----------------------------------------------------------

/**
 * Returns the complete workflow topology with all agents and skills visible.
 *
 * Produces stage-group container nodes with children nested via parentId.
 * "invokes" edges are eliminated — containment replaces them. Data-flow
 * spine edges connect group containers. Spawns edges connect children
 * across groups.
 *
 * The optional complexity parameter is passed through as `selectedComplexity`
 * for downstream tier resolution — it does NOT filter agents out.
 *
 * @param complexity - Optional complexity level for downstream tier resolution
 * @returns Topology with nodes, edges, ordered stage list, and selected complexity
 */
export function getTopology(complexity?: string): {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  stages: WorkflowStage[];
  selectedComplexity?: string;
} {
  // All agents/skills are always visible — no complexity filtering
  const visibleAgents = AGENTS;

  // Group agents by stage
  const agentsByStage: Record<string, AgentDef[]> = {};
  for (const stage of STAGES) {
    agentsByStage[stage] = filter(visibleAgents, (a) => a.stage === stage);
  }

  const nodes: TopologyNode[] = [];

  // Build group nodes (one per stage) — must come BEFORE children in array
  // so React Flow can resolve parentId references
  let currentY = 0;
  const GROUP_Y_GAP = 40;

  for (const stage of STAGES) {
    const children = agentsByStage[stage] ?? [];
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
        description: STAGE_DESCRIPTIONS[stage],
        stage,
        purpose: "pipeline-stage",
        color: "",
      },
      style: { width, height },
    });

    currentY += height + GROUP_Y_GAP;
  }

  // Build child nodes with parentId and relative positions
  for (const stage of STAGES) {
    const children = agentsByStage[stage] ?? [];
    const groupId = `group-${stage}`;
    const colCount = children.length >= 8 ? 3 : 2;

    children.forEach((agent, i) => {
      const pos = childPosition(i, colCount);

      nodes.push({
        id: agent.id,
        position: pos,
        type: "default",
        data: {
          node_type: agent.node_type,
          label: agent.label,
          description: agent.description,
          stage: agent.stage,
          model_tier: agent.model_tier,
          routing_preset: agent.routing_preset,
          purpose: agent.purpose,
          color: "",
        },
        parent_id: groupId,
        extent: "parent",
      });
    });
  }

  // Build edges
  const edges: TopologyEdge[] = [];

  // Spine connections between group containers
  for (let i = 0; i < STAGES.length - 1; i++) {
    edges.push({
      id: `spine-${STAGES[i]}-${STAGES[i + 1]}`,
      source: `group-${STAGES[i]}`,
      target: `group-${STAGES[i + 1]}`,
      data: {
        edge_type: "data-flow",
        label: "",
      },
    });
  }

  // Learn → classify (cyclic)
  edges.push({
    id: "spine-learn-classify",
    source: "group-learn",
    target: "group-classify",
    data: {
      edge_type: "data-flow",
      label: "next phase",
    },
  });

  // Spawning relationships (cross-group child-to-child and skill-to-skill)
  const spawns: Array<[string, string, string?]> = [
    // Skill -> agent invocations
    ["phase-execute", "lu-executor"],
    ["phase-execute", "code-developer"],
    ["phase-execute", "code-architect"],
    ["phase-execute", "dx-advocate"],
    ["phase-execute", "code-simplifier"],
    ["phase-execute", "security-auditor"],
    ["phase-execute", "performance-auditor"],
    ["phase-plan", "lu-phase-researcher"],
    ["phase-plan", "lu-planner"],
    ["phase-plan", "lu-plan-checker"],
    ["phase-discuss", "lu-discuss-researcher"],
    ["phase-discuss", "lu-premortem"],
    ["phase-research", "lu-phase-researcher"],
    ["verify", "lu-verifier"],
    ["verify", "lu-verifier-fast"],
    ["debug", "lu-debugger"],
    // Skill -> skill chains
    ["lu", "phase-discuss"],
    ["lu", "phase-plan"],
    ["lu", "phase-execute"],
    ["autopilot", "lu"],
    // Agent -> agent spawns
    ["lu-executor", "lu-test-writer"],
    ["lu-router", "lu-router-fast"],
    ["lu-verifier", "lu-verifier-fast"],
  ];

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const [source, target, condition] of spawns) {
    if (nodeIds.has(source) && nodeIds.has(target)) {
      edges.push({
        id: `spawn-${source}-${target}`,
        source,
        target,
        data: {
          edge_type: "spawns",
          label: "",
          condition,
        },
      });
    }
  }

  return { nodes, edges, stages: [...STAGES], selectedComplexity: complexity };
}
