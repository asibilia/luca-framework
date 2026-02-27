/**
 * Luca Purpose Gating Extension for Pi
 *
 * Provides purpose-based agent filtering and background task scheduling.
 * Agents declare their purpose and allowed contexts; the gating system
 * validates compatibility before execution. Background tasks can be
 * deferred until trigger conditions are met.
 *
 * Source: src/hooks/pi-extensions/luca-purpose-gating.ts
 * Deployed to: .pi/extensions/luca-purpose-gating.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

/** Purpose categories for agent classification. */
type PurposeCategory =
  | "researcher"
  | "planner"
  | "executor"
  | "verifier"
  | "reviewer"
  | "synthesizer"
  | "auditor"
  | "general";

/** Agent purpose registration. */
interface AgentPurpose {
  agent: string;
  purpose: PurposeCategory;
  allowed_contexts: string[];
  background_spawnable: boolean;
}

/** A deferred background task. */
interface DeferredTask {
  id: string;
  agent: string;
  trigger: string;
  context: string;
  status: "pending" | "triggered" | "completed";
  created_at: string;
  triggered_at?: string;
}

export default function lucaPurposeGating(pi: any) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Registered agent purposes. */
  const purposes: Map<string, AgentPurpose> = new Map();

  /** Deferred background tasks. */
  const deferredTasks: Map<string, DeferredTask> = new Map();

  /** Task ID counter. */
  let taskIdCounter = 0;

  /**
   * Infer purpose from agent frontmatter description and name.
   */
  function inferPurpose(agentName: string): PurposeCategory {
    const name = agentName.toLowerCase();
    if (name.includes("research") || name.includes("discover"))
      return "researcher";
    if (name.includes("plan") || name.includes("roadmap")) return "planner";
    if (name.includes("execut") || name.includes("develop")) return "executor";
    if (
      name.includes("verif") ||
      name.includes("test") ||
      name.includes("check")
    )
      return "verifier";
    if (name.includes("review") || name.includes("audit")) return "reviewer";
    if (name.includes("synth") || name.includes("learn")) return "synthesizer";
    if (name.includes("security") || name.includes("performance"))
      return "auditor";
    return "general";
  }

  /**
   * Auto-discover agents and infer purposes from .pi/agents/.
   */
  function autoDiscoverAgents(): void {
    if (!existsSync(agentsDir)) return;

    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const agentName = file.replace(".md", "");
      if (purposes.has(agentName)) continue;

      const purpose = inferPurpose(agentName);

      // Infer allowed contexts from purpose
      const contextMap: Record<PurposeCategory, string[]> = {
        researcher: ["research", "discovery", "analysis"],
        planner: ["planning", "roadmap", "estimation"],
        executor: ["execution", "implementation", "coding"],
        verifier: ["verification", "testing", "validation"],
        reviewer: ["review", "audit", "assessment"],
        synthesizer: ["synthesis", "learning", "summarization"],
        auditor: ["audit", "security", "performance"],
        general: ["any"],
      };

      purposes.set(agentName, {
        agent: agentName,
        purpose,
        allowed_contexts: contextMap[purpose],
        background_spawnable: ["researcher", "auditor", "synthesizer"].includes(
          purpose,
        ),
      });
    }
  }

  // Tool: Register agent purpose
  pi.registerTool({
    name: "luca_register_purpose",
    label: "Register Agent Purpose",
    description:
      "Register or update an agent's purpose classification, allowed execution contexts, and background spawn capability.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent name to register",
        },
        purpose: {
          type: "string",
          description:
            "Purpose category: researcher, planner, executor, verifier, reviewer, synthesizer, auditor, general",
        },
        allowed_contexts: {
          type: "string",
          description:
            "Comma-separated contexts where this agent can run (e.g., 'research,analysis,discovery')",
        },
        background_spawnable: {
          type: "boolean",
          description:
            "Whether this agent can be spawned in the background (default: false)",
        },
      },
      required: ["agent", "purpose"],
    },
    async execute(
      _toolCallId: string,
      params: {
        agent: string;
        purpose: string;
        allowed_contexts?: string;
        background_spawnable?: boolean;
      },
    ) {
      const validPurposes: PurposeCategory[] = [
        "researcher",
        "planner",
        "executor",
        "verifier",
        "reviewer",
        "synthesizer",
        "auditor",
        "general",
      ];

      if (!validPurposes.includes(params.purpose as PurposeCategory)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid purpose "${params.purpose}". Use: ${validPurposes.join(", ")}`,
            },
          ],
        };
      }

      const contexts = params.allowed_contexts
        ? params.allowed_contexts
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : ["any"];

      purposes.set(params.agent, {
        agent: params.agent,
        purpose: params.purpose as PurposeCategory,
        allowed_contexts: contexts,
        background_spawnable: params.background_spawnable ?? false,
      });

      return {
        content: [
          {
            type: "text",
            text: `Agent "${params.agent}" registered: purpose=${params.purpose}, contexts=${contexts.join(", ")}, background=${params.background_spawnable ?? false}`,
          },
        ],
      };
    },
  });

  // Tool: Check if agent is eligible for a context
  pi.registerTool({
    name: "luca_check_purpose",
    label: "Check Purpose Compatibility",
    description:
      "Check if an agent is eligible to run in a given execution context. Returns compatibility status and eligible alternatives.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent name to check",
        },
        context: {
          type: "string",
          description:
            "Execution context to check against (e.g., 'research', 'execution', 'review')",
        },
      },
      required: ["agent", "context"],
    },
    async execute(
      _toolCallId: string,
      params: { agent: string; context: string },
    ) {
      // Auto-discover if not yet populated
      if (purposes.size === 0) autoDiscoverAgents();

      const agentPurpose = purposes.get(params.agent);
      if (!agentPurpose) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  agent: params.agent,
                  compatible: false,
                  reason:
                    "Agent not registered. Use luca_register_purpose or ensure agent exists in .pi/agents/",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const compatible =
        agentPurpose.allowed_contexts.includes("any") ||
        agentPurpose.allowed_contexts.includes(params.context.toLowerCase());

      // Find alternative agents for this context
      const alternatives = Array.from(purposes.values())
        .filter(
          (p) =>
            p.agent !== params.agent &&
            (p.allowed_contexts.includes("any") ||
              p.allowed_contexts.includes(params.context.toLowerCase())),
        )
        .map((p) => ({ agent: p.agent, purpose: p.purpose }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                agent: params.agent,
                context: params.context,
                compatible,
                purpose: agentPurpose.purpose,
                allowed_contexts: agentPurpose.allowed_contexts,
                background_spawnable: agentPurpose.background_spawnable,
                alternatives: compatible ? [] : alternatives.slice(0, 5),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Tool: Get eligible agents for a context
  pi.registerTool({
    name: "luca_eligible_agents",
    label: "Get Eligible Agents",
    description:
      "List all agents eligible to run in a given execution context, grouped by purpose category.",
    parameters: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description:
            "Execution context (e.g., 'research', 'review', 'execution')",
        },
        background_only: {
          type: "boolean",
          description:
            "Only show agents that can be spawned in the background (default: false)",
        },
      },
      required: ["context"],
    },
    async execute(
      _toolCallId: string,
      params: { context: string; background_only?: boolean },
    ) {
      // Auto-discover if not yet populated
      if (purposes.size === 0) autoDiscoverAgents();

      const eligible = Array.from(purposes.values()).filter((p) => {
        const contextMatch =
          p.allowed_contexts.includes("any") ||
          p.allowed_contexts.includes(params.context.toLowerCase());
        const backgroundMatch = params.background_only
          ? p.background_spawnable
          : true;
        return contextMatch && backgroundMatch;
      });

      // Group by purpose
      const grouped: Record<string, string[]> = {};
      for (const agent of eligible) {
        if (!grouped[agent.purpose]) grouped[agent.purpose] = [];
        grouped[agent.purpose].push(agent.agent);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                context: params.context,
                background_only: params.background_only ?? false,
                total_eligible: eligible.length,
                by_purpose: grouped,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Tool: Defer a background task
  pi.registerTool({
    name: "luca_defer_task",
    label: "Defer Background Task",
    description:
      "Schedule an agent task to be triggered later when a specific condition is met (e.g., 'phase_complete', 'tests_pass', 'review_done').",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent to spawn when triggered",
        },
        trigger: {
          type: "string",
          description:
            "Trigger condition (e.g., 'phase_complete', 'tests_pass', 'review_done', 'manual')",
        },
        context: {
          type: "string",
          description: "Context to pass to the agent when triggered",
        },
      },
      required: ["agent", "trigger", "context"],
    },
    async execute(
      _toolCallId: string,
      params: { agent: string; trigger: string; context: string },
    ) {
      // Auto-discover if not yet populated
      if (purposes.size === 0) autoDiscoverAgents();

      const agentPurpose = purposes.get(params.agent);
      if (agentPurpose && !agentPurpose.background_spawnable) {
        return {
          content: [
            {
              type: "text",
              text: `Agent "${params.agent}" is not marked as background_spawnable. Register with background_spawnable=true first.`,
            },
          ],
        };
      }

      const taskId = `bg-${++taskIdCounter}`;
      const task: DeferredTask = {
        id: taskId,
        agent: params.agent,
        trigger: params.trigger,
        context: params.context,
        status: "pending",
        created_at: new Date().toISOString(),
      };

      deferredTasks.set(taskId, task);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                task_id: taskId,
                agent: params.agent,
                trigger: params.trigger,
                status: "pending",
                instructions: `Task deferred. Call luca_trigger_deferred with trigger="${params.trigger}" when the condition is met.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Tool: Trigger deferred tasks
  pi.registerTool({
    name: "luca_trigger_deferred",
    label: "Trigger Deferred Tasks",
    description:
      "Fire a trigger condition to activate any deferred background tasks waiting on it. Returns the tasks that were triggered.",
    parameters: {
      type: "object",
      properties: {
        trigger: {
          type: "string",
          description: "Trigger condition to fire (e.g., 'phase_complete')",
        },
      },
      required: ["trigger"],
    },
    async execute(_toolCallId: string, params: { trigger: string }) {
      const triggered: DeferredTask[] = [];

      for (const task of deferredTasks.values()) {
        if (task.trigger === params.trigger && task.status === "pending") {
          task.status = "triggered";
          task.triggered_at = new Date().toISOString();
          triggered.push(task);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                trigger: params.trigger,
                triggered_count: triggered.length,
                tasks: triggered.map((t) => ({
                  task_id: t.id,
                  agent: t.agent,
                  context: t.context.slice(0, 500),
                  instructions: `Spawn agent "${t.agent}" with context: ${t.context.slice(0, 200)}`,
                })),
                remaining_pending: Array.from(deferredTasks.values()).filter(
                  (t) => t.status === "pending",
                ).length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Tool: List deferred tasks
  pi.registerTool({
    name: "luca_deferred_status",
    label: "Deferred Task Status",
    description:
      "List all deferred background tasks and their current status (pending, triggered, completed).",
    parameters: {},
    async execute() {
      const tasks = Array.from(deferredTasks.values()).map((t) => ({
        task_id: t.id,
        agent: t.agent,
        trigger: t.trigger,
        status: t.status,
        created_at: t.created_at,
        triggered_at: t.triggered_at ?? null,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: tasks.length,
                pending: tasks.filter((t) => t.status === "pending").length,
                triggered: tasks.filter((t) => t.status === "triggered").length,
                completed: tasks.filter((t) => t.status === "completed").length,
                tasks,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Auto-discover agents on session start
  pi.on("session_start", async (_event: any, _ctx: any) => {
    autoDiscoverAgents();
  });
}
