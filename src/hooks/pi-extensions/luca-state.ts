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

export default function lucaState(pi: any) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");
  const stateMdPath = join(planningDir, "STATE.md");

  /**
   * Parse STATE.md into a structured object.
   * Extracts key-value pairs from the markdown format.
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
      if (match) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
        state[key] = match[2].trim();
      }
      // Also match "Key: Value" format (without bold)
      const simpleMatch = line.match(/^([A-Z][a-z ]+):\s*(.+)$/);
      if (simpleMatch && !match) {
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

  // Show state in footer on session start
  pi.on("session_start", async (_event: any, ctx: any) => {
    const state = readStateMd();
    const phase = state["current_phase"] ?? "?";
    const complexity = state["task_complexity"] ?? "?";
    const milestone = state["current_milestone"] ?? "?";
    if (ctx?.ui?.setStatus) {
      ctx.ui.setStatus("luca", `${milestone} | Phase ${phase} | ${complexity}`);
    }
  });
}
