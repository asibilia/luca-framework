/**
 * Luca State Bridge Extension for Pi
 *
 * Exposes the Luca workflow state machine to Pi's LLM via registered tools.
 * Reads/writes .planning/STATE.md and .planning/state.json for workflow
 * state management (phase tracking, complexity, oversight, transitions).
 *
 * Source: src/hooks/pi-extensions/luca-state.ts
 * Deployed to: .pi/extensions/luca-state.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { escapeRegExp } from "./__helpers/sanitize";
import {
  createStatusFormatter,
  SEP,
  COMPLEXITY_TIERS,
} from "./__helpers/status";
import { subagentRegistry } from "./__helpers/subagent-registry";

/**
 * Pi extension: Workflow state management and status display.
 *
 * Registers tools for reading/writing .planning/STATE.md fields and
 * displays a consolidated status bar (phase, complexity, memory
 * indicators) in Pi's footer during sessions.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaState(pi: any) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");
  const stateMdPath = join(planningDir, "STATE.md");

  /**
   * Parse STATE.md into a structured object.
   *
   * Extracts key-value pairs from the markdown format, supporting
   * both bold (`**Key:** value`) and simple (`Key: value`) formats.
   *
   * @returns Record of normalized key-value pairs, or an error object if file missing
   */
  function readStateMd(): Record<string, string> {
    if (!existsSync(stateMdPath)) {
      return { error: "STATE.md not found" };
    }
    const content = readFileSync(stateMdPath, "utf-8");
    const state: Record<string, string> = {};
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
      if (match?.[1] && match[2]) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
        state[key] = match[2].trim();
      }
      // Also match "Key: Value" format (without bold)
      const simpleMatch = line.match(/^([A-Z][a-z ]+):\s*(.+)$/);
      if (simpleMatch?.[1] && simpleMatch[2] && !match) {
        const key = simpleMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
        state[key] = simpleMatch[2].trim();
      }
    }
    return state;
  }

  // Tool: Read current workflow state
  pi.registerTool({
    name: "luca_read_state",
    label: "Read Luca State",
    description:
      "Read the current Luca workflow state including phase, complexity, milestone, and status from .planning/STATE.md",
    parameters: {},
    async execute() {
      const state = readStateMd();
      return createJsonResponse(state);
    },
  });

  // Tool: Read a specific state field
  pi.registerTool({
    name: "luca_read_field",
    label: "Read Luca Field",
    description:
      "Read a specific field from the Luca workflow state (e.g., complexity, phase, milestone)",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "Field name to read (e.g., task_complexity, current_phase, current_milestone, status)",
        },
      },
      required: ["field"],
    },
    async execute(_toolCallId: string, params: { field: string }) {
      const state = readStateMd();
      const value = state[params.field] ?? "Field not found";
      return createTextResponse(value);
    },
  });

  // Tool: Update STATE.md field
  pi.registerTool({
    name: "luca_set_field",
    label: "Set Luca Field",
    description:
      "Update a field in .planning/STATE.md (e.g., set complexity, update phase)",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "Field label as it appears in STATE.md (e.g., Task Complexity, Current Phase)",
        },
        value: {
          type: "string",
          description: "New value for the field",
        },
      },
      required: ["field", "value"],
    },
    async execute(
      _toolCallId: string,
      params: { field: string; value: string },
    ) {
      if (!existsSync(stateMdPath)) {
        return createTextResponse("Error: STATE.md not found");
      }

      // Validate field length to prevent abuse
      if (params.field.length > 100) {
        return createTextResponse(
          "Error: field name exceeds maximum length of 100 characters",
        );
      }

      let content = readFileSync(stateMdPath, "utf-8");
      const escapedField = escapeRegExp(params.field);
      // Try bold format first: **Field:** value
      const boldPattern = new RegExp(
        `(\\*\\*${escapedField}:\\*\\*)\\s*.+`,
        "i",
      );
      if (boldPattern.test(content)) {
        content = content.replace(boldPattern, `$1 ${params.value}`);
      } else {
        // Try simple format: Field: value
        const simplePattern = new RegExp(`(${escapedField}:)\\s*.+`, "i");
        if (simplePattern.test(content)) {
          content = content.replace(simplePattern, `$1 ${params.value}`);
        } else {
          return createTextResponse(
            `Field "${params.field}" not found in STATE.md`,
          );
        }
      }
      writeFileSync(stateMdPath, content, "utf-8");
      return createTextResponse(
        `Updated "${params.field}" to "${params.value}"`,
      );
    },
  });

  /** Session turn counter, incremented on turn_start. */
  let turnCount = 0;

  /** Currently active luca tool (for footer display). */
  let activeTool: string | null = null;

  /**
   * Build the state status string from current STATE.md and .planning/ files.
   *
   * Called at session_start and can be refreshed by tool_call events.
   * Returns a single-line status string (used by setStatus fallback).
   */
  function buildStateStatus(ctx: any): string {
    const state = readStateMd();
    const phase = state["current_phase"];
    const milestone = state["current_milestone"];
    const complexity = (state["task_complexity"] ?? "MODERATE").toUpperCase();
    const tier = COMPLEXITY_TIERS[complexity] ?? "standard";

    // Check memory file existence
    const brainExists = existsSync(join(planningDir, "BRAIN.md"));
    const memoryExists = existsSync(join(planningDir, "MEMORY.md"));
    const workingExists = existsSync(join(planningDir, "WORKING.md"));

    const fmt = createStatusFormatter(ctx);

    // Phase + milestone segment — show "No active phase" when missing
    const hasPhase = phase && phase !== "--" && phase !== "?";
    const hasMilestone = milestone && milestone !== "--" && milestone !== "?";
    const phaseSegment =
      hasPhase || hasMilestone
        ? fmt.accent(`P${phase ?? "?"}${hasMilestone ? ` ${milestone}` : ""}`)
        : fmt.dim("No active phase");

    // Complexity segment — color by tier
    const complexityColor =
      tier === "thorough"
        ? fmt.error
        : tier === "standard"
          ? fmt.warning
          : fmt.muted;
    const complexitySegment = fmt.hasTheme
      ? complexityColor(complexity)
      : `${complexity} (${tier})`;

    // Memory indicators — green if loaded, dim if missing
    const b = brainExists ? fmt.success("B") : fmt.dim("B");
    const m = memoryExists ? fmt.success("M") : fmt.dim("M");
    const w = workingExists ? fmt.success("W") : fmt.dim("W");
    const memorySegment = `${b} ${m} ${w}`;

    // Turn counter segment
    const turnSegment = turnCount > 0 ? fmt.dim(`turn ${turnCount}`) : "";

    const segments = [phaseSegment, complexitySegment, memorySegment];
    if (turnSegment) segments.push(turnSegment);
    return segments.join(SEP);
  }

  /**
   * Update the footer using setFooter (multi-line) with setStatus fallback.
   *
   * setFooter renders a rich multi-line footer showing phase, complexity,
   * subagent count, memory indicators, and active tool. Falls back to
   * single-line setStatus for older Pi versions.
   */
  function updateFooter(
    ctx: any,
    stateOverride?: Record<string, string>,
  ): void {
    const state = stateOverride ?? readStateMd();

    if (ctx?.ui?.setFooter) {
      ctx.ui.setFooter((_theme: any) => {
        const lines: string[] = [];

        // Line 1: Phase and plan
        const phase = state["current_phase"] ?? "?";
        const plan = state["current_plan"] ?? state["plan"] ?? "?";
        lines.push(`Phase ${phase} | Plan ${plan}`);

        // Line 2: Complexity and oversight
        const complexity = (
          state["task_complexity"] ?? "MODERATE"
        ).toUpperCase();
        const tier = COMPLEXITY_TIERS[complexity] ?? "standard";
        lines.push(`${complexity} (${tier}) | turn ${turnCount}`);

        // Line 3: Subagent count (if any running)
        const running = subagentRegistry
          .values()
          .filter((s) => s.status === "running");
        if (running.length > 0) {
          lines.push(`Subagents: ${running.length} running`);
        }

        // Line 4: Active tool (if any)
        if (activeTool) {
          lines.push(`Active: ${activeTool}`);
        }

        return lines.join("\n");
      });
    } else if (ctx?.ui?.setStatus) {
      // Fallback: single-line status for older Pi versions
      const statusLine = activeTool
        ? `${buildStateStatus(ctx)}${SEP}${activeTool}`
        : buildStateStatus(ctx);
      ctx.ui.setStatus("luca-state", statusLine);
    }
  }

  // Show consolidated state in footer on session start
  pi.on("session_start", async (_event: any, ctx: any) => {
    updateFooter(ctx);
  });

  // Track active luca tool calls
  pi.on("tool_call", async (event: any, ctx: any) => {
    const toolName: string = event?.toolName ?? "";
    if (!toolName.startsWith("luca_")) return;

    activeTool = toolName.replace("luca_", "").replace(/_/g, " ");
    updateFooter(ctx);
  });

  // Clear active tool indicator when tool finishes
  pi.on("tool_execution_end", async (event: any, ctx: any) => {
    const toolName: string = event?.toolName ?? "";
    if (!toolName.startsWith("luca_")) return;

    activeTool = null;
    updateFooter(ctx);
  });

  // Increment turn counter and refresh footer
  pi.on("turn_start", async (_event: any, ctx: any) => {
    turnCount++;
    updateFooter(ctx);
  });

  // Reconstruct state when session changes (switch, fork, tree navigation)
  const sessionEvents = [
    "session_switch",
    "session_fork",
    "session_tree",
  ] as const;

  for (const eventName of sessionEvents) {
    pi.on(eventName, async (_event: any, ctx: any) => {
      // Re-read STATE.md (may differ per session branch)
      const freshState = readStateMd();

      // Update footer with fresh state (works even if STATE.md missing)
      updateFooter(ctx, freshState);

      // Log session event for audit trail
      if (pi.appendEntry) {
        pi.appendEntry("luca-session-event", {
          event: eventName,
          timestamp: new Date().toISOString(),
          state: {
            phase: freshState["current_phase"],
            plan: freshState["current_plan"] ?? freshState["plan"],
            complexity: freshState["task_complexity"],
          },
        });
      }
    });
  }
}
