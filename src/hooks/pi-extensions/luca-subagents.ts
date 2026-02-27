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
import { spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { sanitizeName } from "./__helpers/sanitize";

/** Maximum output characters retained per subagent. */
const MAX_OUTPUT_CHARS = 8192;

/** Maximum concurrent subagents. */
const MAX_SUBAGENTS = 8;

/** Subagent status lifecycle. */
type SubagentStatus = "running" | "completed" | "failed" | "aborted";

/** Tracked state for a running or completed subagent. */
interface SubagentState {
  id: string;
  agent: string;
  task: string;
  status: SubagentStatus;
  /** Captured output (last MAX_OUTPUT_CHARS) */
  output: string;
  /** Captured stderr */
  stderr: string;
  /** Process exit code (-1 while running) */
  exitCode: number;
  /** Accumulated usage stats */
  usage: {
    turns: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  /** Model used by subagent */
  model: string | undefined;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when completed */
  completedAt: number | undefined;
  /** Reference to the child process (not serialized) */
  process: ChildProcess | undefined;
}

/**
 * Pi extension: Background subagent spawning and management.
 *
 * Registers tools for creating, listing, checking results, and
 * removing background subagent processes. Each subagent runs
 * as an isolated `pi` subprocess with JSON mode output capture.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaSubagents(pi: any) {
  const cwd = process.cwd();
  const subagents = createRegistry<SubagentState>("subagents");
  let idCounter = 0;

  /**
   * Write a system prompt to a temp file for --append-system-prompt.
   * Returns the file path. Caller must clean up.
   */
  function writePromptFile(agentName: string, prompt: string): string {
    const dir = mkdtempSync(join(tmpdir(), "luca-subagent-"));
    const safeName = sanitizeName(agentName);
    const filePath = join(dir, `prompt-${safeName}.md`);
    writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
    return filePath;
  }

  /**
   * Read agent definition from .pi/agents/ directory.
   */
  function readAgentDef(agentName: string): {
    systemPrompt: string;
    model?: string;
    tools?: string[];
  } | null {
    const safeName = sanitizeName(agentName);
    const filePath = join(cwd, ".pi", "agents", `${safeName}.md`);
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch?.[1]) return { systemPrompt: content };

    const fm = fmMatch[1];
    const model = fm.match(/^model:\s*(.+)$/m)?.[1]?.trim();
    const toolsMatch = fm.match(/^tools:\s*(.+)$/m)?.[1]?.trim();
    const tools = toolsMatch ? toolsMatch.split(",").map((t) => t.trim()) : undefined;
    const bodyStart = content.indexOf("---", 4);
    const systemPrompt = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : "";

    return { systemPrompt, model, tools };
  }

  /**
   * Spawn a subagent process and track its lifecycle.
   */
  function spawnSubagent(
    id: string,
    agentName: string,
    task: string,
    model?: string,
    tools?: string[],
    systemPrompt?: string,
  ): SubagentState {
    const state: SubagentState = {
      id,
      agent: agentName,
      task,
      status: "running",
      output: "",
      stderr: "",
      exitCode: -1,
      usage: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      model,
      createdAt: Date.now(),
      completedAt: undefined,
      process: undefined,
    };

    const args: string[] = ["--mode", "json", "-p", "--no-session"];
    if (model) args.push("--model", model);
    if (tools && tools.length > 0) args.push("--tools", tools.join(","));

    let promptFile: string | undefined;
    if (systemPrompt) {
      promptFile = writePromptFile(agentName, systemPrompt);
      args.push("--append-system-prompt", promptFile);
    }

    args.push(`Task: ${task}`);

    const proc = spawn("pi", args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    state.process = proc;

    let buffer = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.type === "message_end" && event.message) {
          const msg = event.message;
          if (msg.role === "assistant") {
            state.usage.turns++;
            if (msg.usage) {
              state.usage.inputTokens += msg.usage.input ?? 0;
              state.usage.outputTokens += msg.usage.output ?? 0;
              state.usage.cost += msg.usage.cost?.total ?? 0;
            }
            if (!state.model && msg.model) state.model = msg.model;

            // Capture final text output
            for (const part of msg.content ?? []) {
              if (part.type === "text") {
                state.output = part.text.slice(-MAX_OUTPUT_CHARS);
              }
            }
          }
        }
      } catch {
        // Non-JSON line, ignore
      }
    };

    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      state.stderr += data.toString();
      // Truncate stderr
      if (state.stderr.length > MAX_OUTPUT_CHARS) {
        state.stderr = state.stderr.slice(-MAX_OUTPUT_CHARS);
      }
    });

    proc.on("close", (code) => {
      if (buffer.trim()) processLine(buffer);
      state.exitCode = code ?? 1;
      state.status = code === 0 ? "completed" : "failed";
      state.completedAt = Date.now();
      state.process = undefined;

      // Clean up temp prompt file
      if (promptFile) {
        try {
          unlinkSync(promptFile);
          rmdirSync(join(promptFile, ".."));
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    proc.on("error", () => {
      state.exitCode = 1;
      state.status = "failed";
      state.completedAt = Date.now();
      state.process = undefined;
    });

    return state;
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
          description: "Agent name from .pi/agents/ (e.g., 'lu-executor', 'scout')",
        },
        task: {
          type: "string",
          description: "Task description to delegate to the subagent",
        },
        model: {
          type: "string",
          description: "Override model for this subagent (optional, uses agent default)",
        },
      },
      required: ["agent", "task"],
    },
    async execute(
      _toolCallId: string,
      params: { agent: string; task: string; model?: string },
    ) {
      // Check max subagents
      const running = subagents.values().filter((s) => s.status === "running");
      if (running.length >= MAX_SUBAGENTS) {
        return createTextResponse(
          `Maximum ${MAX_SUBAGENTS} concurrent subagents reached. Remove or wait for existing ones to complete.`,
        );
      }

      // Read agent definition
      const agentDef = readAgentDef(params.agent);
      if (!agentDef) {
        const agentsDir = join(cwd, ".pi", "agents");
        return createTextResponse(
          `Agent "${params.agent}" not found in ${agentsDir}/. ` +
          `Available agents can be listed with luca_list_roles.`,
        );
      }

      // Generate unique ID
      idCounter++;
      const id = `sub-${idCounter}-${sanitizeName(params.agent)}`;

      // Spawn the subagent
      const state = spawnSubagent(
        id,
        params.agent,
        params.task,
        params.model ?? agentDef.model,
        agentDef.tools,
        agentDef.systemPrompt,
      );

      subagents.set(id, state);

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
    description: "List all tracked subagent processes with their current status.",
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
    async execute(
      _toolCallId: string,
      params: { status?: string },
    ) {
      let agents = subagents.values();
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
        created: new Date(s.createdAt).toISOString(),
        completed: s.completedAt
          ? new Date(s.completedAt).toISOString()
          : null,
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
          description: "Subagent ID (from luca_subagent_create or luca_subagent_list)",
        },
      },
      required: ["id"],
    },
    async execute(_toolCallId: string, params: { id: string }) {
      const state = subagents.get(params.id);
      if (!state) {
        return createTextResponse(
          `Subagent "${params.id}" not found. Use luca_subagent_list to see available subagents.`,
        );
      }

      return createJsonResponse({
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
      });
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
      const state = subagents.get(params.id);
      if (!state) {
        return createTextResponse(
          `Subagent "${params.id}" not found.`,
        );
      }

      // Kill if still running
      if (state.process && state.status === "running") {
        state.process.kill("SIGTERM");
        state.status = "aborted";
        state.completedAt = Date.now();
        // Give process time to clean up
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (state.process && !state.process.killed) {
          state.process.kill("SIGKILL");
        }
      }

      subagents.delete(params.id);

      return createTextResponse(
        `Subagent "${params.id}" (${state.agent}) removed. ` +
        `Final status: ${state.status}.`,
      );
    },
  });

  // ─── Cleanup on session end ────────────────────────────

  pi.on("session_start", async () => {
    // Clean up any stale subagents from previous sessions
    for (const state of subagents.values()) {
      if (state.process && state.status === "running") {
        state.process.kill("SIGTERM");
      }
    }
    subagents.clear();
    idCounter = 0;
  });
}
