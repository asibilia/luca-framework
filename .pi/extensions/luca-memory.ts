/**
 * Luca Memory Bridge Extension for Pi
 *
 * Exposes Luca's cognitive memory system (BRAIN.md, MEMORY.md, WORKING.md)
 * to Pi's LLM via registered tools. Injects BRAIN.md context at session
 * start so the LLM begins each session with project identity loaded.
 *
 * Source: src/hooks/pi-extensions/luca-memory.ts
 * Deployed to: .pi/extensions/luca-memory.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export default function lucaMemory(pi: any) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");
  const brainPath = join(planningDir, "BRAIN.md");
  const memoryPath = join(planningDir, "MEMORY.md");
  const workingPath = join(planningDir, "WORKING.md");

  /**
   * Read a planning file safely.
   * Returns the file content or an error message.
   */
  function readPlanningFile(filePath: string, label: string): string {
    if (!existsSync(filePath)) {
      return `${label} not found at ${filePath}`;
    }
    return readFileSync(filePath, "utf-8");
  }

  // Tool: Read BRAIN.md (project identity)
  pi.registerTool({
    name: "luca_read_brain",
    label: "Read Project Brain",
    description:
      "Read BRAIN.md — the project identity file containing stack, architecture, conventions, and preferences. Load this at session start for full project context.",
    parameters: {},
    async execute() {
      const content = readPlanningFile(brainPath, "BRAIN.md");
      return {
        content: [{ type: "text", text: content }],
      };
    },
  });

  // Tool: Read MEMORY.md (long-term learning)
  pi.registerTool({
    name: "luca_read_memory",
    label: "Read Long-Term Memory",
    description:
      "Read MEMORY.md — persistent learning across sessions. Contains patterns, decisions, pitfalls, and preferences organized by category. Optionally filter by category (pattern, decision, pitfall, preference).",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Optional category filter: pattern, decision, pitfall, or preference. Omit to read all.",
        },
      },
    },
    async execute(_toolCallId: string, params: { category?: string }) {
      const content = readPlanningFile(memoryPath, "MEMORY.md");
      if (content.startsWith("MEMORY.md not found")) {
        return { content: [{ type: "text", text: content }] };
      }

      // If category filter specified, extract only that section
      if (params.category) {
        const sectionHeader = `## ${params.category.charAt(0).toUpperCase() + params.category.slice(1)}`;
        const lines = content.split("\n");
        const sectionLines: string[] = [];
        let inSection = false;

        for (const line of lines) {
          if (line.startsWith("## ")) {
            if (inSection) break;
            if (line.toLowerCase().includes(params.category.toLowerCase())) {
              inSection = true;
            }
          }
          if (inSection) {
            sectionLines.push(line);
          }
        }

        if (sectionLines.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No "${params.category}" section found in MEMORY.md`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: sectionLines.join("\n") }],
        };
      }

      return { content: [{ type: "text", text: content }] };
    },
  });

  // Tool: Read WORKING.md (session memory)
  pi.registerTool({
    name: "luca_read_working",
    label: "Read Working Memory",
    description:
      "Read WORKING.md — the active session memory containing current task context, findings, hypotheses, and candidate learnings.",
    parameters: {},
    async execute() {
      const content = readPlanningFile(workingPath, "WORKING.md");
      return {
        content: [{ type: "text", text: content }],
      };
    },
  });

  // Tool: Append to WORKING.md section
  pi.registerTool({
    name: "luca_append_working",
    label: "Append to Working Memory",
    description:
      "Append content to a specific section of WORKING.md. Sections: session_info, memory_recall, planning_notes, findings, hypotheses, candidate_learnings.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description:
            "Section name: session_info, memory_recall, planning_notes, findings, hypotheses, or candidate_learnings",
        },
        content: {
          type: "string",
          description: "Content to append to the section",
        },
      },
      required: ["section", "content"],
    },
    async execute(
      _toolCallId: string,
      params: { section: string; content: string },
    ) {
      // Map section names to markdown headers
      const sectionHeaders: Record<string, string> = {
        session_info: "## Session Info",
        memory_recall: "## Memory Recall",
        planning_notes: "## Planning Notes",
        findings: "## Findings",
        hypotheses: "## Hypotheses",
        candidate_learnings: "## Candidate Learnings",
      };

      const header = sectionHeaders[params.section];
      if (!header) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown section "${params.section}". Valid: ${Object.keys(sectionHeaders).join(", ")}`,
            },
          ],
        };
      }

      // Ensure .planning/ directory exists
      if (!existsSync(planningDir)) {
        mkdirSync(planningDir, { recursive: true });
      }

      let existing = "";
      if (existsSync(workingPath)) {
        existing = readFileSync(workingPath, "utf-8");
      }

      // Find section and append, or create section if missing
      if (existing.includes(header)) {
        // Find the end of the section (next ## header or EOF)
        const lines = existing.split("\n");
        const headerIdx = lines.findIndex((l) => l.startsWith(header));
        let insertIdx = lines.length;

        for (let i = headerIdx + 1; i < lines.length; i++) {
          if (lines[i].startsWith("## ")) {
            insertIdx = i;
            break;
          }
        }

        // Insert content before next section
        lines.splice(insertIdx, 0, `\n${params.content}\n`);
        writeFileSync(workingPath, lines.join("\n"), "utf-8");
      } else {
        // Append new section at end
        const newSection = `\n${header}\n\n${params.content}\n`;
        writeFileSync(workingPath, existing + newSection, "utf-8");
      }

      return {
        content: [
          {
            type: "text",
            text: `Appended to "${params.section}" in WORKING.md`,
          },
        ],
      };
    },
  });

  // Inject BRAIN.md context at session start
  pi.on("session_start", async (_event: any, ctx: any) => {
    if (!existsSync(brainPath)) return;

    const brain = readFileSync(brainPath, "utf-8");

    // Inject BRAIN.md into session context if Pi supports it
    if (ctx?.addSystemContext) {
      ctx.addSystemContext("luca-brain", brain);
    }

    // Show memory status in footer
    const memoryExists = existsSync(memoryPath);
    const workingExists = existsSync(workingPath);
    const status = [
      "BRAIN loaded",
      memoryExists ? "MEMORY available" : "no MEMORY",
      workingExists ? "WORKING active" : "no WORKING",
    ].join(" | ");

    if (ctx?.ui?.setStatus) {
      ctx.ui.setStatus("luca-memory", status);
    }
  });
}
