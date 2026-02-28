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
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

import { parseFrontmatter } from "./__helpers/frontmatter";
import { sendFollowUp } from "./__helpers/follow-up";
import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { normalizeContext, sanitizeName } from "./__helpers/sanitize";
import { readAgentDef, spawnPiSubprocess } from "./__helpers/spawn";
import {
  subagentRegistry,
  nextSubagentId,
} from "./__helpers/subagent-registry";

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

/**
 * Pi extension: Agent purpose classification and deferred task scheduling.
 *
 * Registers tools for classifying agent purposes, checking execution
 * context eligibility, querying eligible agents, and scheduling
 * deferred background tasks with trigger conditions.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaPurposeGating(pi: any) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Registered agent purposes. */
  const purposes = createRegistry<AgentPurpose>("purposes");

  /** Deferred background tasks. */
  const deferredTasks = createRegistry<DeferredTask>("deferred-tasks");

  /** Task ID counter. */
  let taskIdCounter = 0;

  /**
   * Infer purpose category from an agent's name using keyword matching.
   *
   * Scans the agent name for keywords that map to purpose categories
   * (e.g., "research" -> researcher, "plan" -> planner). Falls back to
   * "general" if no keywords match.
   *
   * @param agentName - Agent identifier to classify
   * @returns Inferred purpose category
   */
  function inferPurpose(agentName: string): PurposeCategory {
    const name = agentName.trim().toLowerCase();
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
   * Auto-discover agents from .pi/agents/ using frontmatter metadata.
   *
   * Reads each agent's compiled .md file, parses YAML frontmatter for
   * explicit `purpose`, `background_spawnable`, and `allowed_contexts`
   * fields. Falls back to name-based inference when metadata is absent.
   * Skips agents that are already registered to avoid overwriting
   * manual registrations.
   */
  function autoDiscoverAgents(): void {
    if (!existsSync(agentsDir)) return;

    // Fallback context map for name-based inference
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

    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const agentName = file.replace(".md", "").trim();
      if (purposes.has(agentName)) continue;

      // Try to read frontmatter metadata
      const filePath = join(agentsDir, file);
      let fm: ReturnType<typeof parseFrontmatter> = null;
      try {
        const content = readFileSync(filePath, "utf-8");
        fm = parseFrontmatter(content);
      } catch {
        // Fall through to inference
      }

      // Prefer explicit metadata, fall back to name-based inference
      const purpose: PurposeCategory =
        (fm?.purpose as PurposeCategory) ?? inferPurpose(agentName);
      const allowed_contexts = fm?.allowed_contexts ?? contextMap[purpose];
      const background_spawnable =
        fm?.background_spawnable ??
        ["researcher", "auditor", "synthesizer"].includes(purpose);

      purposes.set(agentName, {
        agent: agentName,
        purpose,
        allowed_contexts,
        background_spawnable,
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
        return createTextResponse(
          `Invalid purpose "${params.purpose}". Use: ${validPurposes.join(", ")}`,
        );
      }

      const contexts = params.allowed_contexts
        ? params.allowed_contexts
            .split(",")
            .map((c) => normalizeContext(c))
            .filter(Boolean)
        : ["any"];

      purposes.set(params.agent, {
        agent: params.agent,
        purpose: params.purpose as PurposeCategory,
        allowed_contexts: contexts,
        background_spawnable: params.background_spawnable ?? false,
      });

      return createTextResponse(
        `Agent "${params.agent}" registered: purpose=${params.purpose}, contexts=${contexts.join(", ")}, background=${params.background_spawnable ?? false}`,
      );
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
      // Normalize and validate context
      const ctx = normalizeContext(params.context);
      if (!ctx) {
        return createJsonResponse({
          agent: params.agent,
          compatible: false,
          reason:
            "Empty or whitespace-only context provided. Specify a valid execution context.",
        });
      }

      // Auto-discover if not yet populated
      if (purposes.size() === 0) autoDiscoverAgents();

      const agentPurpose = purposes.get(params.agent);
      if (!agentPurpose) {
        return createJsonResponse({
          agent: params.agent,
          compatible: false,
          reason:
            "Agent not registered. Use luca_register_purpose or ensure agent exists in .pi/agents/",
        });
      }

      const compatible =
        agentPurpose.allowed_contexts.includes("any") ||
        agentPurpose.allowed_contexts.includes(ctx);

      // Find alternative agents for this context
      const alternatives = purposes
        .values()
        .filter(
          (p) =>
            p.agent !== params.agent &&
            (p.allowed_contexts.includes("any") ||
              p.allowed_contexts.includes(ctx)),
        )
        .map((p) => ({ agent: p.agent, purpose: p.purpose }));

      return createJsonResponse({
        agent: params.agent,
        context: params.context,
        compatible,
        purpose: agentPurpose.purpose,
        allowed_contexts: agentPurpose.allowed_contexts,
        background_spawnable: agentPurpose.background_spawnable,
        alternatives: compatible ? [] : alternatives.slice(0, 5),
      });
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
      // Normalize and validate context
      const ctx = normalizeContext(params.context);
      if (!ctx) {
        return createJsonResponse({
          context: params.context,
          error:
            "Empty or whitespace-only context provided. Specify a valid execution context.",
          total_eligible: 0,
          by_purpose: {},
        });
      }

      // Auto-discover if not yet populated
      if (purposes.size() === 0) autoDiscoverAgents();

      const eligible = purposes.values().filter((p) => {
        const contextMatch =
          p.allowed_contexts.includes("any") ||
          p.allowed_contexts.includes(ctx);
        const backgroundMatch = params.background_only
          ? p.background_spawnable
          : true;
        return contextMatch && backgroundMatch;
      });

      // Group by purpose
      const grouped: Record<string, string[]> = {};
      for (const agent of eligible) {
        const bucket = grouped[agent.purpose] ?? [];
        bucket.push(agent.agent);
        grouped[agent.purpose] = bucket;
      }

      return createJsonResponse({
        context: params.context,
        background_only: params.background_only ?? false,
        total_eligible: eligible.length,
        by_purpose: grouped,
      });
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
      if (purposes.size() === 0) autoDiscoverAgents();

      const agentPurpose = purposes.get(params.agent);
      if (agentPurpose && !agentPurpose.background_spawnable) {
        return createTextResponse(
          `Agent "${params.agent}" is not marked as background_spawnable. Register with background_spawnable=true first.`,
        );
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

      return createJsonResponse({
        task_id: taskId,
        agent: params.agent,
        trigger: params.trigger,
        status: "pending",
        instructions: `Task deferred. Call luca_trigger_deferred with trigger="${params.trigger}" when the condition is met.`,
      });
    },
  });

  // Tool: Trigger deferred tasks
  pi.registerTool({
    name: "luca_trigger_deferred",
    label: "Trigger Deferred Tasks",
    description:
      "Fire a trigger condition to activate any deferred background tasks waiting on it. " +
      "When auto_spawn is true, spawns background subagents for each triggered task. " +
      "Returns the tasks that were triggered.",
    parameters: {
      type: "object",
      properties: {
        trigger: {
          type: "string",
          description: "Trigger condition to fire (e.g., 'phase_complete')",
        },
        auto_spawn: {
          type: "boolean",
          description:
            "When true, automatically spawn background subagents for each triggered task (default: false)",
        },
      },
      required: ["trigger"],
    },
    async execute(
      _toolCallId: string,
      params: { trigger: string; auto_spawn?: boolean },
    ) {
      const triggered: DeferredTask[] = [];

      for (const task of deferredTasks.values()) {
        if (task.trigger === params.trigger && task.status === "pending") {
          task.status = "triggered";
          task.triggered_at = new Date().toISOString();
          triggered.push(task);
        }
      }

      // Auto-spawn subagents for triggered tasks
      const spawned: Array<{
        task_id: string;
        subagent_id: string;
        agent: string;
      }> = [];
      if (params.auto_spawn && triggered.length > 0) {
        for (const task of triggered) {
          const agentDef = readAgentDef(cwd, task.agent);
          if (!agentDef) continue;

          const subId = nextSubagentId("bg", sanitizeName(task.agent));
          const state = spawnPiSubprocess({
            id: subId,
            agentName: task.agent,
            task: task.context,
            cwd,
            model: agentDef.model,
            tools: agentDef.tools,
            systemPrompt: agentDef.systemPrompt,
            source: "luca-purpose-gating",
            onComplete: (info) => {
              sendFollowUp(pi, {
                customType: "background-result",
                content: `Background agent "${info.agent}" (trigger: ${task.trigger}) ${info.status} (${(info.elapsed / 1000).toFixed(1)}s).`,
                details: {
                  task_id: task.id,
                  trigger: task.trigger,
                  subagent_id: info.id,
                  agent: info.agent,
                  status: info.status,
                  exit_code: info.exitCode,
                  elapsed_ms: info.elapsed,
                },
              });
            },
          });

          subagentRegistry.set(subId, state);
          spawned.push({
            task_id: task.id,
            subagent_id: subId,
            agent: task.agent,
          });
        }
      }

      return createJsonResponse({
        trigger: params.trigger,
        triggered_count: triggered.length,
        auto_spawn: params.auto_spawn ?? false,
        spawned_count: spawned.length,
        tasks: triggered.map((t) => {
          const spawnInfo = spawned.find((s) => s.task_id === t.id);
          return {
            task_id: t.id,
            agent: t.agent,
            context: t.context.slice(0, 500),
            subagent_id: spawnInfo?.subagent_id ?? null,
            instructions: spawnInfo
              ? `Subagent "${spawnInfo.subagent_id}" spawned. Use luca_subagent_result to check output.`
              : `Spawn agent "${t.agent}" with context: ${t.context.slice(0, 200)}`,
          };
        }),
        remaining_pending: deferredTasks
          .values()
          .filter((t) => t.status === "pending").length,
      });
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
      const tasks = deferredTasks.values().map((t) => ({
        task_id: t.id,
        agent: t.agent,
        trigger: t.trigger,
        status: t.status,
        created_at: t.created_at,
        triggered_at: t.triggered_at ?? null,
      }));

      return createJsonResponse({
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        triggered: tasks.filter((t) => t.status === "triggered").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        tasks,
      });
    },
  });

  // Auto-discover agents on session start
  pi.on("session_start", async (_event: any, _ctx: any) => {
    taskIdCounter = 0;
    autoDiscoverAgents();
  });
}
