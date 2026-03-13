/**
 * Static workflow topology data for the Luca autopilot pipeline.
 *
 * Curates the autopilot pipeline spine (classify → discuss → plan → execute →
 * verify → learn) with agent/skill nodes branching off each stage.
 *
 * This is design-time data, not runtime — the topology represents the
 * workflow architecture, not live execution state.
 */
import filter from "lodash/filter";

import type {
  TopologyEdge,
  TopologyNode,
  WorkflowStage,
} from "~/lib/workflow-types";

// -- Layout constants ---------------------------------------------------------

const SPINE_X = 400;
const SPINE_Y_START = 0;
const SPINE_Y_GAP = 200;
const AGENT_X_OFFSET = 250;
const AGENT_Y_GAP = 80;

// -- Pipeline spine nodes -----------------------------------------------------

const STAGES: WorkflowStage[] = [
  "classify",
  "discuss",
  "plan",
  "execute",
  "verify",
  "learn",
];

const spineNodes: TopologyNode[] = STAGES.map((stage, i) => ({
  id: `stage-${stage}`,
  position: { x: SPINE_X, y: SPINE_Y_START + i * SPINE_Y_GAP },
  type: "default",
  data: {
    node_type: "step" as const,
    label: stage.charAt(0).toUpperCase() + stage.slice(1),
    description: STAGE_DESCRIPTIONS[stage],
    stage,
    purpose: "pipeline-stage",
    color: "",
  },
}));

const STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  classify: "Route task complexity via lu-router",
  discuss: "Gather context and resolve gray areas",
  plan: "Generate PLAN.md with atomic tasks",
  execute: "Implement code changes via lu-executor",
  verify: "Verify results via harness and lu-verifier",
  learn: "Capture patterns, decisions, pitfalls",
};

// -- Agent/skill nodes --------------------------------------------------------

interface AgentDef {
  id: string;
  label: string;
  stage: WorkflowStage;
  description: string;
  model_tier: "fast" | "balanced" | "capable";
  complexity_min?: string;
  node_type: "agent" | "skill" | "gate";
  purpose: string;
}

const AGENTS: AgentDef[] = [
  // Classify stage
  {
    id: "lu-cognition",
    label: "lu-cognition",
    stage: "classify",
    description: "Cognitive pre-flight: load project identity, recall patterns",
    model_tier: "fast",
    node_type: "agent",
    purpose: "pre-flight",
  },
  {
    id: "lu-router",
    label: "lu-router",
    stage: "classify",
    description: "Classify task complexity (TRIVIAL → CRITICAL)",
    model_tier: "balanced",
    complexity_min: "MODERATE",
    node_type: "agent",
    purpose: "classifier",
  },
  {
    id: "lu-router-fast",
    label: "lu-router-fast",
    stage: "classify",
    description: "Fast-tier classifier for TRIVIAL/SIMPLE tasks",
    model_tier: "fast",
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
    node_type: "agent",
    purpose: "researcher",
  },
  {
    id: "lu-premortem",
    label: "lu-premortem",
    stage: "discuss",
    description: "Generate failure scenarios and risk brief",
    model_tier: "balanced",
    complexity_min: "MODERATE",
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
    node_type: "agent",
    purpose: "planner",
  },
  {
    id: "lu-plan-checker",
    label: "lu-plan-checker",
    stage: "plan",
    description: "Verify plan achieves phase goal before execution",
    model_tier: "balanced",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "lu-phase-researcher",
    label: "lu-phase-researcher",
    stage: "plan",
    description: "Research implementation approach before planning",
    model_tier: "balanced",
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
    node_type: "agent",
    purpose: "executor",
  },
  {
    id: "lu-executor-capable",
    label: "lu-executor-capable",
    stage: "execute",
    description: "Capable-tier executor for COMPLEX/CRITICAL tasks",
    model_tier: "capable",
    complexity_min: "COMPLEX",
    node_type: "agent",
    purpose: "executor",
  },
  {
    id: "lu-test-writer",
    label: "lu-test-writer",
    stage: "execute",
    description: "Generate test files from plan verification criteria",
    model_tier: "balanced",
    node_type: "agent",
    purpose: "testing",
  },

  // Verify stage
  {
    id: "lu-verifier",
    label: "lu-verifier",
    stage: "verify",
    description: "Goal-backward verification of phase achievement",
    model_tier: "balanced",
    complexity_min: "MODERATE",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "lu-verifier-fast",
    label: "lu-verifier-fast",
    stage: "verify",
    description: "Fast-tier verifier for TRIVIAL/SIMPLE tasks",
    model_tier: "fast",
    node_type: "agent",
    purpose: "verifier",
  },
  {
    id: "code-architect",
    label: "code-architect",
    stage: "verify",
    description: "Verify code scaffolding and system architecture",
    model_tier: "balanced",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "security-auditor",
    label: "security-auditor",
    stage: "verify",
    description: "Review code for security vulnerabilities",
    model_tier: "balanced",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "dx-advocate",
    label: "dx-advocate",
    stage: "verify",
    description: "Enforce code standards and developer experience",
    model_tier: "balanced",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "performance-auditor",
    label: "performance-auditor",
    stage: "verify",
    description: "Identify performance bottlenecks",
    model_tier: "balanced",
    node_type: "agent",
    purpose: "reviewer",
  },
  {
    id: "code-simplifier",
    label: "code-simplifier",
    stage: "verify",
    description: "Simplify code to reduce complexity",
    model_tier: "balanced",
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
    node_type: "agent",
    purpose: "learning",
  },
];

// -- Build agent nodes with positions -----------------------------------------

function buildAgentNodes(): TopologyNode[] {
  const stageAgentCounts: Record<string, number> = {};

  return AGENTS.map((agent) => {
    const stageIndex = STAGES.indexOf(agent.stage);
    const count = stageAgentCounts[agent.stage] ?? 0;
    stageAgentCounts[agent.stage] = count + 1;

    // Alternate left/right of spine
    const side = count % 2 === 0 ? 1 : -1;
    const row = Math.floor(count / 2);

    return {
      id: agent.id,
      position: {
        x: SPINE_X + side * AGENT_X_OFFSET,
        y: SPINE_Y_START + stageIndex * SPINE_Y_GAP + row * AGENT_Y_GAP - 40,
      },
      type: "default",
      data: {
        node_type: agent.node_type,
        label: agent.label,
        description: agent.description,
        stage: agent.stage,
        model_tier: agent.model_tier,
        complexity_min: agent.complexity_min,
        purpose: agent.purpose,
        color: "",
      },
    };
  });
}

// -- Edges --------------------------------------------------------------------

function buildEdges(): TopologyEdge[] {
  const edges: TopologyEdge[] = [];

  // Spine connections: classify → discuss → plan → execute → verify → learn
  for (let i = 0; i < STAGES.length - 1; i++) {
    edges.push({
      id: `spine-${STAGES[i]}-${STAGES[i + 1]}`,
      source: `stage-${STAGES[i]}`,
      target: `stage-${STAGES[i + 1]}`,
      data: {
        edge_type: "data-flow",
        label: "",
      },
    });
  }

  // Learn → classify (cyclic)
  edges.push({
    id: "spine-learn-classify",
    source: "stage-learn",
    target: "stage-classify",
    data: {
      edge_type: "data-flow",
      label: "next phase",
    },
  });

  // Stage → agent invocations
  for (const agent of AGENTS) {
    edges.push({
      id: `invoke-${agent.stage}-${agent.id}`,
      source: `stage-${agent.stage}`,
      target: agent.id,
      data: {
        edge_type: agent.node_type === "gate" ? "gates" : "invokes",
        label: "",
        condition: agent.complexity_min,
      },
    });
  }

  // Spawning relationships
  const spawns: Array<[string, string, string?]> = [
    ["lu-executor", "lu-test-writer"],
    ["lu-router", "lu-router-fast", "TRIVIAL"],
    ["lu-verifier", "lu-verifier-fast", "TRIVIAL"],
  ];

  for (const [source, target, condition] of spawns) {
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

  return edges;
}

// -- Public API ---------------------------------------------------------------

/**
 * Returns the complete workflow topology, optionally filtered by complexity.
 *
 * When `complexity` is provided, agent nodes that have a `complexity_min`
 * higher than the requested level are excluded (along with their edges).
 *
 * @param complexity - Optional complexity level to filter agents
 * @returns Topology with nodes, edges, and ordered stage list
 */
export function getTopology(complexity?: string): {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  stages: WorkflowStage[];
} {
  const allAgentNodes = buildAgentNodes();
  let agentNodes = allAgentNodes;

  // Filter by complexity if provided
  if (complexity) {
    const order = ["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"];
    const requestedIndex = order.indexOf(complexity.toUpperCase());

    if (requestedIndex >= 0) {
      agentNodes = filter(allAgentNodes, (node) => {
        const minComplexity = node.data.complexity_min;
        if (!minComplexity) return true; // No minimum = always shown
        const minIndex = order.indexOf(minComplexity);
        return minIndex <= requestedIndex;
      });
    }
  }

  const nodes = [...spineNodes, ...agentNodes];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Filter edges to only include those connecting visible nodes
  const allEdges = buildEdges();
  const edges = filter(
    allEdges,
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return { nodes, edges, stages: [...STAGES] };
}
