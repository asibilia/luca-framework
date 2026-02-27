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

  // Show consolidated state in footer on session start
  pi.on("session_start", async (_event: any, ctx: any) => {
    if (!ctx?.ui?.setStatus) return;

    const state = readStateMd();
    const phase = state["current_phase"] ?? "--";
    const milestone = state["current_milestone"] ?? "--";
    const complexity = (state["task_complexity"] ?? "MODERATE").toUpperCase();
    const tier = COMPLEXITY_TIERS[complexity] ?? "standard";

    // Check memory file existence
    const brainExists = existsSync(join(planningDir, "BRAIN.md"));
    const memoryExists = existsSync(join(planningDir, "MEMORY.md"));
    const workingExists = existsSync(join(planningDir, "WORKING.md"));

    const fmt = createStatusFormatter(ctx);

    // Phase + milestone segment
    const phaseSegment = fmt.accent(`P${phase} ${milestone}`);

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

    ctx.ui.setStatus(
      "luca-state",
      `${phaseSegment}${SEP}${complexitySegment}${SEP}${memorySegment}`,
    );
  });
}
