/**
 * Luca Subagent Extension for Pi
 *
 * Provides background subagent spawning with process isolation.
 * Each subagent runs as a separate `pi` subprocess with JSON mode
 * output, enabling fire-and-forget async task delegation.
 *
 * Integrates with luca-teams.ts for team-based dispatch patterns.
 *
 * @security This extension spawns child processes via `spawn("pi", [...])`.
 *   Commands are constructed from validated parameters, not raw user input.
 *   See .pi/SECURITY-MODEL.md.
 *
 * Source: src/hooks/pi-extensions/luca-subagents.ts
 * Deployed to: .pi/extensions/luca-subagents.ts
 */
import { existsSync } from "fs";
import { join } from "path";

import { sendFollowUp } from "./__helpers/follow-up";
import { notifySafe } from "./__helpers/notify";
import {
  createJsonResponse,
  createJsonResponseWithDetails,
  createTextResponse,
} from "./__helpers/response";
import { sanitizeName } from "./__helpers/sanitize";
import {
  readAgentDef,
  cleanupSessionDir,
  spawnPiSubprocess,
} from "./__helpers/spawn";
import type { SpawnCompletionInfo } from "./__helpers/spawn";
import {
  subagentRegistry,
  nextSubagentId,
  resetSubagentRegistry,
} from "./__helpers/subagent-registry";
import type { SubagentEntry } from "./__helpers/subagent-registry";
import type { PiExtensionAPI, PiExtensionContext } from "./__types/pi-context";

// MAX_SUBAGENTS limit is enforced globally in __helpers/spawn.ts

/** Grace period (ms) for SIGTERM before escalating to SIGKILL. */
const SIGTERM_GRACE_MS = 500;

/**
 * Gracefully kill a subagent process: SIGTERM → grace period → SIGKILL.
 *
 * Sends SIGTERM first to allow cleanup, then escalates to SIGKILL
 * after SIGTERM_GRACE_MS if the process is still alive. Updates
 * the subagent state to "aborted" with a completion timestamp.
 *
 * @param state - Subagent registry entry with process handle
 */
async function killWithEscalation(state: SubagentEntry): Promise<void> {
  if (!state.process || state.status !== "running") return;

  state.process.kill("SIGTERM");
  state.status = "aborted";
  state.completedAt = Date.now();

  await new Promise((resolve) => setTimeout(resolve, SIGTERM_GRACE_MS));
  if (state.process && !state.process.killed) {
    state.process.kill("SIGKILL");
  }
}

/**
 * Pi extension: Background subagent spawning and management.
 *
 * Registers tools for creating, listing, checking results, and
 * removing background subagent processes. Each subagent runs
 * as an isolated `pi` subprocess with JSON mode output capture.
 *
 * Uses the shared subagent registry from __helpers/subagent-registry.ts
 * so that subagents spawned by other extensions (purpose-gating, teams)
 * are visible in luca_subagent_list.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaSubagents(pi: PiExtensionAPI) {
  const cwd = process.cwd();

  /**
   * Handle subagent completion: send follow-up message and toast notification.
   *
   * Shared by luca_subagent_create and luca_subagent_continue onComplete
   * callbacks to avoid duplicating the ~20-line notification block.
   */
  function handleSubagentComplete(
    ctx: PiExtensionContext,
    info: SpawnCompletionInfo,
  ): void {
    const summary = [
      `Subagent "${info.id}" (${info.agent}) ${info.status}.`,
      `Duration: ${(info.elapsed / 1000).toFixed(1)}s`,
      info.output
        ? `Output preview: ${info.output.slice(0, 500)}`
        : "(no output)",
    ].join("\n");

    sendFollowUp(pi, {
      customType: "subagent-result",
      content: summary,
      details: {
        subagent_id: info.id,
        agent: info.agent,
        status: info.status,
        exit_code: info.exitCode,
        elapsed_ms: info.elapsed,
      },
    });

    const level = info.status === "completed" ? "info" : "error";
    notifySafe(
      ctx,
      `Subagent "${info.id}" (${info.agent}) ${info.status} in ${(info.elapsed / 1000).toFixed(1)}s`,
      level,
    );
  }

  // ─── Tool: Create Subagent ─────────────────────────────

  pi.registerTool({
    name: "luca_subagent_create",
    label: "Create Subagent",
    description:
      "Spawn a background subagent process to execute a task with isolated context. " +
      "The subagent runs as a separate pi process. Use luca_subagent_result to check output.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Agent name from .pi/agents/ (e.g., 'lu-executor', 'scout')",
        },
        task: {
          type: "string",
          description: "Task description to delegate to the subagent",
        },
        model: {
          type: "string",
          description:
            "Override model for this subagent (optional, uses agent default)",
        },
      },
      required: ["agent", "task"],
    },

    /**
     * Render a human-readable summary of the tool call arguments.
     * Shown in Pi's TUI when the tool is invoked.
     */
    renderCall(args: { agent?: string; task?: string }, _theme: any) {
      const agent = args.agent ?? "unknown";
      const taskPreview = (args.task ?? "").slice(0, 60);
      const text = `Spawning subagent: ${agent} — ${taskPreview}`;
      return {
        render(_width: number): string[] {
          return text.split("\n");
        },
        invalidate() {},
      };
    },

    async execute(
      _toolCallId: string,
      params: { agent: string; task: string; model?: string },
      signal: AbortSignal | undefined,
      _onUpdate: any,
      ctx: PiExtensionContext,
    ) {
      // Check for abort before spawning
      if (signal?.aborted) {
        return createTextResponse("Cancelled by user");
      }

      // Read agent definition
      const agentDef = readAgentDef(cwd, params.agent);
      if (!agentDef) {
        const agentsDir = join(cwd, ".pi", "agents");
        return createTextResponse(
          `Agent "${params.agent}" not found in ${agentsDir}/. ` +
            `Available agents can be listed with luca_list_roles.`,
        );
      }

      // Generate unique ID
      const id = nextSubagentId("sub", sanitizeName(params.agent));

      // Spawn the subagent (limit enforced globally in spawn.ts)
      let state;
      try {
        state = spawnPiSubprocess({
          id,
          agentName: params.agent,
          task: params.task,
          cwd,
          model: params.model,
          tools: agentDef.tools,
          systemPrompt: agentDef.systemPrompt,
          source: "luca-subagents",
          onComplete: (info) => handleSubagentComplete(ctx, info),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        notifySafe(ctx, msg, "warn");
        return createTextResponse(msg);
      }

      subagentRegistry.set(id, state);

      // Kill child process if abort signal fires while subagent is running
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            void killWithEscalation(state);
          },
          { once: true },
        );
      }

      return createJsonResponse({
        id,
        agent: params.agent,
        status: "running",
        message: `Subagent "${id}" spawned. Use luca_subagent_result to check output when complete.`,
      });
    },
  });

  // ─── Tool: List Subagents ──────────────────────────────

  pi.registerTool({
    name: "luca_subagent_list",
    label: "List Subagents",
    description:
      "List all tracked subagent processes with their current status.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Filter by status: running, completed, failed, aborted (optional)",
        },
      },
    },
    async execute(_toolCallId: string, params: { status?: string }) {
      let agents = subagentRegistry.values();
      if (params.status) {
        agents = agents.filter((s) => s.status === params.status);
      }

      const summary = agents.map((s) => ({
        id: s.id,
        agent: s.agent,
        status: s.status,
        task_preview: s.task.slice(0, 100),
        output_preview: s.output ? s.output.slice(0, 200) : null,
        usage: s.usage,
        model: s.model,
        source: s.source ?? "luca-subagents",
        created: new Date(s.createdAt).toISOString(),
        completed: s.completedAt ? new Date(s.completedAt).toISOString() : null,
        duration_ms: s.completedAt
          ? s.completedAt - s.createdAt
          : Date.now() - s.createdAt,
      }));

      return createJsonResponse(summary);
    },
  });

  // ─── Tool: Get Subagent Result ─────────────────────────

  pi.registerTool({
    name: "luca_subagent_result",
    label: "Subagent Result",
    description:
      "Get the full result from a subagent. Returns output, status, usage stats, and errors.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Subagent ID (from luca_subagent_create or luca_subagent_list)",
        },
      },
      required: ["id"],
    },

    /**
     * Render a human-readable summary of the subagent result.
     * Shown in Pi's TUI after the tool completes.
     */
    renderResult(result: any, _opts: any, _theme: any) {
      let text: string;
      try {
        const raw = result.content?.[0]?.text;
        if (!raw) {
          text = "Subagent result";
        } else {
          const data = JSON.parse(raw);
          if (!data.status) {
            text = "Subagent result";
          } else {
            const icon =
              data.status === "completed"
                ? "DONE"
                : data.status === "failed"
                  ? "FAIL"
                  : data.status === "aborted"
                    ? "STOP"
                    : "...";
            const agent = data.agent ?? "unknown";
            const output = data.output ? `\n${data.output.slice(0, 300)}` : "";
            text = `${icon} Subagent "${data.id ?? "?"}" (${agent}) — ${data.status}${output}`;
          }
        }
      } catch {
        text = "Subagent result";
      }
      return {
        render(_width: number): string[] {
          return text.split("\n");
        },
        invalidate() {},
      };
    },

    async execute(_toolCallId: string, params: { id: string }) {
      const state = subagentRegistry.get(params.id);
      if (!state) {
        return createTextResponse(
          `Subagent "${params.id}" not found. Use luca_subagent_list to see available subagents.`,
        );
      }

      return createJsonResponseWithDetails(
        {
          id: state.id,
          agent: state.agent,
          task: state.task,
          status: state.status,
          exitCode: state.exitCode,
          output: state.output || "(no output yet)",
          stderr: state.stderr || null,
          usage: state.usage,
          model: state.model,
          created: new Date(state.createdAt).toISOString(),
          completed: state.completedAt
            ? new Date(state.completedAt).toISOString()
            : null,
          duration_ms: state.completedAt
            ? state.completedAt - state.createdAt
            : Date.now() - state.createdAt,
        },
        {
          subagent_id: state.id,
          agent: state.agent,
          status: state.status,
          model: state.model,
          turns: state.usage?.turns ?? 0,
          input_tokens: state.usage?.inputTokens ?? 0,
          output_tokens: state.usage?.outputTokens ?? 0,
          cost: state.usage?.cost ?? 0,
          duration_ms: state.completedAt
            ? state.completedAt - state.createdAt
            : Date.now() - state.createdAt,
        },
      );
    },
  });

  // ─── Tool: Remove Subagent ─────────────────────────────

  pi.registerTool({
    name: "luca_subagent_remove",
    label: "Remove Subagent",
    description:
      "Remove a subagent from tracking. If still running, kills the process first.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Subagent ID to remove",
        },
      },
      required: ["id"],
    },
    async execute(_toolCallId: string, params: { id: string }) {
      const state = subagentRegistry.get(params.id);
      if (!state) {
        return createTextResponse(`Subagent "${params.id}" not found.`);
      }

      // Kill if still running (SIGTERM → grace → SIGKILL)
      await killWithEscalation(state);

      // Clean up session directory
      if (state.sessionDir) {
        cleanupSessionDir(state.sessionDir);
      }

      subagentRegistry.delete(params.id);

      return createTextResponse(
        `Subagent "${params.id}" (${state.agent}) removed. ` +
          `Final status: ${state.status}.`,
      );
    },
  });

  // ─── Tool: Continue Subagent ────────────────────────────
  //
  // Usage flow:
  //   1. luca_subagent_create → spawns agent, returns { id }
  //   2. luca_subagent_result → poll until status != "running"
  //   3. luca_subagent_continue → send follow-up message, agent resumes
  //   4. luca_subagent_result → poll for continued output
  //   5. luca_subagent_remove → clean up when done
  //

  pi.registerTool({
    name: "luca_subagent_continue",
    label: "Continue Subagent",
    description:
      "Send a follow-up message to a completed subagent, resuming its session. " +
      "The subagent must have completed (not be currently running). " +
      "Returns a new subagent entry with the continued conversation.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Subagent ID to continue (must be completed/failed, not running)",
        },
        message: {
          type: "string",
          description: "Follow-up message to send to the subagent",
        },
      },
      required: ["id", "message"],
    },
    async execute(
      _toolCallId: string,
      params: { id: string; message: string },
      _signal: any,
      _onUpdate: any,
      ctx: PiExtensionContext,
    ) {
      const existing = subagentRegistry.get(params.id);
      if (!existing) {
        return createTextResponse(
          `Subagent "${params.id}" not found. Use luca_subagent_list to see available subagents.`,
        );
      }

      if (existing.status === "running") {
        return createTextResponse(
          `Subagent "${params.id}" is still running. Wait for it to complete before continuing.`,
        );
      }

      if (!existing.sessionDir || !existsSync(existing.sessionDir)) {
        return createTextResponse(
          `Subagent "${params.id}" has no session to continue (session directory missing).`,
        );
      }

      // Read agent definition for model/tools
      const agentDef = readAgentDef(cwd, existing.agent);

      // Spawn continued session (limit + path validation enforced in spawn.ts)
      let continued;
      try {
        continued = spawnPiSubprocess({
          id: existing.id,
          agentName: existing.agent,
          task: params.message,
          cwd,
          model: existing.model,
          tools: agentDef?.tools,
          continueSession: true,
          sessionDir: existing.sessionDir,
          source: "luca-subagents",
          onComplete: (info) => handleSubagentComplete(ctx, info),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        notifySafe(ctx, msg, "warn");
        return createTextResponse(msg);
      }

      // Preserve cumulative usage from prior runs
      continued.usage.turns += existing.usage.turns;
      continued.usage.inputTokens += existing.usage.inputTokens;
      continued.usage.outputTokens += existing.usage.outputTokens;
      continued.usage.cost += existing.usage.cost;
      continued.createdAt = existing.createdAt;

      subagentRegistry.set(existing.id, continued);

      return createJsonResponse({
        id: existing.id,
        agent: existing.agent,
        status: "running",
        continued_from: existing.status,
        message: `Subagent "${existing.id}" continued with new message. Use luca_subagent_result to check output.`,
      });
    },
  });

  // ─── Message Renderer: subagent-result ─────────────────

  if (pi.registerMessageRenderer) {
    pi.registerMessageRenderer(
      "subagent-result",
      (message: {
        content?: string;
        details?: {
          subagent_id?: string;
          agent?: string;
          status?: string;
          exit_code?: number;
          elapsed_ms?: number;
        };
      }) => {
        const d = message.details ?? {};
        const statusIcon =
          d.status === "completed"
            ? "DONE"
            : d.status === "failed"
              ? "FAIL"
              : d.status === "aborted"
                ? "STOP"
                : "...";
        const elapsed = d.elapsed_ms
          ? `${(d.elapsed_ms / 1000).toFixed(1)}s`
          : "?";
        const header = `${statusIcon} Subagent "${d.subagent_id ?? "?"}" (${d.agent ?? "?"}) — ${d.status ?? "unknown"} in ${elapsed}`;

        const lines = [header];
        if (message.content) {
          lines.push("");
          lines.push(message.content.slice(0, 500));
        }
        return {
          render(_width: number): string[] {
            return lines;
          },
          invalidate() {},
        };
      },
    );
  }

  // ─── Cleanup on session end ────────────────────────────

  pi.on("session_start", async (_event: any, ctx: PiExtensionContext) => {
    // Clean up any stale subagents from previous sessions
    for (const state of subagentRegistry.values()) {
      await killWithEscalation(state);
      if (state.sessionDir) {
        cleanupSessionDir(state.sessionDir);
      }
    }
    resetSubagentRegistry();

    // Inject subagent guidance into system prompt
    ctx?.addSystemContext?.(
      "luca-subagents",
      "You have access to background subagents via luca_subagent_create. " +
        "Use subagents for: parallel research tasks, running long tests in the background, " +
        "delegating independent subtasks, or team dispatch via luca_dispatch_team. " +
        "Use luca_subagent_list to check running subagents and luca_subagent_result to get their output.",
    );
  });

  // Kill all running subagents and clean up on session shutdown
  pi.on("session_shutdown", async () => {
    for (const state of subagentRegistry.values()) {
      await killWithEscalation(state);
      if (state.sessionDir) {
        cleanupSessionDir(state.sessionDir);
      }
    }
    resetSubagentRegistry();
  });
}
