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
import { existsSync } from "fs";
import { join } from "path";

import {
  createJsonResponse,
  createJsonResponseWithDetails,
  createTextResponse,
} from "./__helpers/response";
import {
  readStateAsMap,
  readField,
  writeField,
} from "./__helpers/state-bridge";
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

  /**
   * Read workflow state as a flat key-value map.
   *
   * Primary: reads from state.json via the state bridge
   * Fallback: parses STATE.md key-value pairs
   *
   * @returns Record of normalized key-value pairs
   */
  function readState(): Record<string, string> {
    return readStateAsMap(cwd);
  }

  // Tool: Read current workflow state
  pi.registerTool({
    name: "luca_read_state",
    label: "Read Luca State",
    description:
      "Read the current Luca workflow state including phase, complexity, milestone, status, and runtime context (model, cwd, headless mode) from .planning/STATE.md",
    parameters: {},
    async execute() {
      const state = readState();
      return createJsonResponseWithDetails(
        {
          ...state,
          runtime: {
            cwd: runtimeContext.cwd,
            model: runtimeContext.model,
            hasUI: runtimeContext.hasUI,
            turn: turnCount,
          },
        },
        {
          current_phase: state["current_phase"] ?? null,
          current_milestone: state["current_milestone"] ?? null,
          current_plan: state["current_plan"] ?? state["plan"] ?? null,
          task_complexity: state["task_complexity"] ?? null,
          oversight: state["oversight"] ?? null,
          status: state["status"] ?? null,
          turn: turnCount,
          has_ui: runtimeContext.hasUI,
          model: runtimeContext.model,
        },
      );
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
      // Try state.json first via bridge, then fall back to flat map
      const bridgeValue = readField(cwd, params.field);
      if (bridgeValue !== undefined) {
        return createTextResponse(
          typeof bridgeValue === "string"
            ? bridgeValue
            : JSON.stringify(bridgeValue),
        );
      }
      const state = readState();
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
      // Validate field length to prevent abuse
      if (params.field.length > 100) {
        return createTextResponse(
          "Error: field name exceeds maximum length of 100 characters",
        );
      }

      // Map display field labels to state.json context field names
      const fieldMap: Record<string, string> = {
        "task complexity": "complexity",
        "current phase": "current_phase",
        "current milestone": "current_milestone",
        oversight: "oversight",
        status: "status",
      };

      // Normalize: try direct field name, then mapped label
      const normalizedField =
        fieldMap[params.field.toLowerCase()] ?? params.field;

      // Parse value: try JSON first, fall back to raw string
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(params.value);
      } catch {
        parsedValue = params.value;
      }

      // Write via state bridge (state.json + STATE.md snapshot)
      const result = await writeField(cwd, normalizedField, parsedValue);

      if (!result.success) {
        return createTextResponse(`Error: ${result.error}`);
      }

      return createTextResponse(
        `Updated "${normalizedField}" to "${params.value}"`,
      );
    },
  });

  /**
   * Runtime context captured on session_start.
   *
   * Stores introspection values from the Pi context object (ctx.cwd,
   * ctx.model, ctx.hasUI) for use in state reporting and conditional
   * behavior (e.g., skipping widgets in headless mode).
   */
  let runtimeContext: {
    cwd: string | null;
    model: string | null;
    hasUI: boolean;
  } = { cwd: null, model: null, hasUI: true };

  /**
   * Session turn counter, incremented on turn_start.
   *
   * NOTE: luca-widgets.ts also tracks turnCount independently for widget
   * rendering. Both are intentional — state drives the footer, widgets
   * drives the dashboard. Keep in sync when changing event handlers.
   */
  let turnCount = 0;

  /**
   * Currently active luca tool (for footer display).
   *
   * NOTE: luca-widgets.ts also tracks activeTool independently for widget
   * rendering. Both are intentional — see turnCount comment above.
   */
  let activeTool: string | null = null;

  /**
   * Build the state status string from current STATE.md and .planning/ files.
   *
   * Called at session_start and can be refreshed by tool_call events.
   * Returns a single-line status string (used by setStatus fallback).
   */
  function buildStateStatus(ctx: any): string {
    const state = readState();
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
    const state = stateOverride ?? readState();

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

  // Capture runtime context and show consolidated state on session start
  pi.on("session_start", async (_event: any, ctx: any) => {
    // Introspect Pi context for runtime properties
    runtimeContext = {
      cwd: ctx?.cwd ?? process.cwd(),
      model: ctx?.model ?? null,
      hasUI: ctx?.hasUI !== false,
    };

    // Only set up footer/status in UI mode
    if (runtimeContext.hasUI) {
      updateFooter(ctx);
    }
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

  // Reset turn counter and active tool on new agent session
  pi.on("agent_start", async () => {
    turnCount = 0;
    activeTool = null;
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
      const freshState = readState();

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

  // Log compaction event for audit trail
  pi.on("session_compact", async () => {
    if (pi.appendEntry) {
      pi.appendEntry("luca-session-event", {
        event: "session_compact",
        timestamp: new Date().toISOString(),
        turn: turnCount,
      });
    }
  });

  // Log shutdown event and capture final state snapshot
  pi.on("session_shutdown", async () => {
    if (pi.appendEntry) {
      const finalState = readState();
      pi.appendEntry("luca-session-event", {
        event: "session_shutdown",
        timestamp: new Date().toISOString(),
        turn: turnCount,
        state: {
          phase: finalState["current_phase"],
          plan: finalState["current_plan"] ?? finalState["plan"],
          complexity: finalState["task_complexity"],
        },
      });
    }
  });
}
