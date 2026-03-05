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

import { createTextResponse } from "./__helpers/response";
import { isWithinDirectory } from "./__helpers/sanitize";

import type { PiExtensionAPI, PiExtensionContext } from "./__types/pi-context";

/**
 * Pi extension: Cognitive memory system.
 *
 * Registers tools for reading BRAIN.md (project identity), MEMORY.md
 * (long-term learnings), and WORKING.md (session context), plus
 * appending to WORKING.md sections during active sessions.
 *
 * JSON-first: Reads .planning/*.json as primary source of truth,
 * falling back to .planning/*.md for backward compatibility.
 * Writes to BOTH JSON and MD to maintain dual-write guarantee.
 *
 * NOTE: This file uses node:fs (not Bun APIs) because Pi runs on Node.js.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaMemory(pi: PiExtensionAPI) {
  const cwd = process.cwd();
  const planningDir = join(cwd, ".planning");
  const brainPath = join(planningDir, "BRAIN.md");
  const brainJsonPath = join(planningDir, "brain.json");
  const memoryPath = join(planningDir, "MEMORY.md");
  const memoryJsonPath = join(planningDir, "memory.json");
  const workingPath = join(planningDir, "WORKING.md");
  const workingJsonPath = join(planningDir, "working.json");

  /**
   * Read a planning file safely with path traversal protection.
   *
   * Validates that the file path is within the planning directory
   * before reading, preventing access to files outside .planning/.
   *
   * @param filePath - Absolute path to the planning file
   * @param label - Human-readable file label for error messages (e.g., "BRAIN.md")
   * @returns File content as string, or an error message if file missing or path invalid
   */
  function readPlanningFile(filePath: string, label: string): string {
    if (!isWithinDirectory(filePath, planningDir)) {
      return `${label} path escapes planning directory — access denied`;
    }
    if (!existsSync(filePath)) {
      return `${label} not found at ${filePath}`;
    }
    return readFileSync(filePath, "utf-8");
  }

  /**
   * Read JSON file as primary source, falling back to MD.
   *
   * Follows the JSON-first pattern established by state-bridge.ts.
   * Returns parsed JSON string if available, otherwise reads the MD file.
   *
   * @param jsonPath - Path to the JSON source of truth
   * @param mdPath - Path to the MD fallback
   * @param mdLabel - Label for error messages
   * @returns File content as string
   */
  function readJsonFirst(
    jsonPath: string,
    mdPath: string,
    mdLabel: string,
  ): string {
    if (existsSync(jsonPath)) {
      try {
        return readFileSync(jsonPath, "utf-8");
      } catch {
        /* fall through to MD */
      }
    }
    return readPlanningFile(mdPath, mdLabel);
  }

  // Tool: Read BRAIN.md (project identity)
  pi.registerTool({
    name: "luca_read_brain",
    label: "Read Project Brain",
    description:
      "Read BRAIN.md — the project identity file containing stack, architecture, conventions, and preferences. Load this at session start for full project context.",
    parameters: {},
    async execute() {
      const content = readJsonFirst(brainJsonPath, brainPath, "BRAIN.md");
      return createTextResponse(content);
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
      // JSON-primary: try memory.json first for structured data
      if (existsSync(memoryJsonPath)) {
        try {
          const raw = readFileSync(memoryJsonPath, "utf-8");
          const entries = JSON.parse(raw) as Array<{
            category?: string;
            title?: string;
            content?: string;
            tags?: string[];
            confidence?: string;
          }>;

          if (Array.isArray(entries)) {
            // Filter by category if specified
            const filtered = params.category
              ? entries.filter(
                  (e) =>
                    e.category?.toLowerCase() ===
                    params.category!.toLowerCase(),
                )
              : entries;

            if (filtered.length === 0 && params.category) {
              return createTextResponse(
                `No "${params.category}" entries found in memory`,
              );
            }

            return createTextResponse(JSON.stringify(filtered, null, 2));
          }
        } catch {
          /* fall through to MD */
        }
      }

      // Fallback: read MEMORY.md
      const content = readPlanningFile(memoryPath, "MEMORY.md");
      if (content.startsWith("MEMORY.md not found")) {
        return createTextResponse(content);
      }

      // If category filter specified, extract only that section
      if (params.category) {
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
          return createTextResponse(
            `No "${params.category}" section found in MEMORY.md`,
          );
        }
        return createTextResponse(sectionLines.join("\n"));
      }

      return createTextResponse(content);
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
      const content = readJsonFirst(workingJsonPath, workingPath, "WORKING.md");
      return createTextResponse(content);
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
        return createTextResponse(
          `Unknown section "${params.section}". Valid: ${Object.keys(sectionHeaders).join(", ")}`,
        );
      }

      // Guard: ensure write path is within the planning directory
      if (!isWithinDirectory(workingPath, planningDir)) {
        return createTextResponse(
          `Write path escapes planning directory — access denied`,
        );
      }

      // Ensure .planning/ directory exists
      if (!existsSync(planningDir)) {
        mkdirSync(planningDir, { recursive: true });
      }

      let existing = "";
      if (existsSync(workingPath)) {
        existing = readFileSync(workingPath, "utf-8");
      }

      // Dual-write: update working.json if it exists
      if (existsSync(workingJsonPath)) {
        try {
          const raw = readFileSync(workingJsonPath, "utf-8");
          const workingJson = JSON.parse(raw) as {
            sections: Array<{
              name: string;
              content: string;
              token_estimate: number;
              last_updated_at?: string;
            }>;
          };

          if (Array.isArray(workingJson.sections)) {
            const section = workingJson.sections.find(
              (s) => s.name === params.section,
            );
            if (section) {
              section.content = section.content
                ? `${section.content}\n${params.content}`
                : params.content;
              section.token_estimate = Math.ceil(
                section.content.split(/\s+/).length * 1.3,
              );
              section.last_updated_at = new Date().toISOString();
            } else {
              workingJson.sections.push({
                name: params.section,
                content: params.content,
                token_estimate: Math.ceil(
                  params.content.split(/\s+/).length * 1.3,
                ),
                last_updated_at: new Date().toISOString(),
              });
            }
            writeFileSync(
              workingJsonPath,
              JSON.stringify(workingJson, null, 2),
              "utf-8",
            );
          }
        } catch {
          /* non-fatal — continue with MD write */
        }
      }

      // Write to WORKING.md (always, for backward compatibility)
      // Find section and append, or create section if missing
      if (existing.includes(header)) {
        // Find the end of the section (next ## header or EOF)
        const lines = existing.split("\n");
        const headerIdx = lines.findIndex((l) => l.startsWith(header));
        let insertIdx = lines.length;

        for (let i = headerIdx + 1; i < lines.length; i++) {
          if (lines[i]?.startsWith("## ")) {
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

      return createTextResponse(
        `Appended to "${params.section}" in WORKING.md`,
      );
    },
  });

  /**
   * Inject BRAIN.md into session context if available.
   *
   * Reads BRAIN.md and injects it via ctx.addSystemContext so the LLM
   * has project identity loaded. Uses a fixed ID ("luca-brain") so
   * repeated calls replace rather than duplicate the injection.
   *
   * @param ctx - Pi event context
   */
  function injectBrain(ctx: PiExtensionContext): void {
    // JSON-primary: try brain.json first, fall back to BRAIN.md
    const brain = readJsonFirst(brainJsonPath, brainPath, "BRAIN.md");
    if (
      brain.startsWith("BRAIN.md not found") ||
      brain.startsWith("BRAIN.md path escapes")
    )
      return;
    if (ctx?.addSystemContext) ctx.addSystemContext("luca-brain", brain);
  }

  // Inject BRAIN.md context at session start
  pi.on("session_start", async (_event: any, ctx: PiExtensionContext) => {
    injectBrain(ctx);
  });

  // Re-inject BRAIN.md before every agent turn (survives context compaction).
  // Uses the same ID ("luca-brain") so addSystemContext replaces the
  // previous injection rather than duplicating it.
  pi.on("before_agent_start", async (_event: any, ctx: PiExtensionContext) => {
    injectBrain(ctx);
  });

  /**
   * Extract candidate learnings from WORKING.md and persist to MEMORY.md.
   *
   * Finds the "## Candidate Learnings" section, extracts its content,
   * and appends it to MEMORY.md as a timestamped snapshot. Returns true
   * if learnings were extracted and persisted.
   *
   * @param label - Snapshot label (e.g., "Compaction", "Shutdown")
   */
  function extractAndPersistLearnings(label: string): boolean {
    if (!existsSync(workingPath)) return false;

    try {
      const working = readFileSync(workingPath, "utf-8");

      // Extract candidate learnings section
      const lines = working.split("\n");
      const learnings: string[] = [];
      let inLearnings = false;
      for (const line of lines) {
        if (line.startsWith("## Candidate Learnings")) {
          inLearnings = true;
          continue;
        }
        if (inLearnings && line.startsWith("## ")) break;
        if (inLearnings && line.trim()) learnings.push(line);
      }

      if (learnings.length === 0) return false;

      const timestamp = new Date().toISOString().slice(0, 10);

      // Dual-write: append to memory.json if it exists
      if (existsSync(memoryJsonPath)) {
        try {
          const raw = readFileSync(memoryJsonPath, "utf-8");
          const entries = JSON.parse(raw) as Array<Record<string, any>>;
          if (Array.isArray(entries)) {
            entries.push({
              id: `snapshot-${label.toLowerCase()}-${timestamp}`,
              category: "pattern",
              title: `${label} Snapshot`,
              content: learnings.join("\n"),
              tags: ["auto-extracted", label.toLowerCase()],
              confidence: "low",
              added_at: timestamp,
              recall_count: 0,
              token_estimate: Math.ceil(
                learnings.join("\n").split(/\s+/).length * 1.3,
              ),
            });
            writeFileSync(
              memoryJsonPath,
              JSON.stringify(entries, null, 2),
              "utf-8",
            );
          }
        } catch {
          /* non-fatal */
        }
      }

      // Always write to MEMORY.md for backward compatibility
      const snapshot = `\n## ${label} Snapshot (${timestamp})\n\n${learnings.join("\n")}\n`;

      let existing = "";
      if (existsSync(memoryPath)) {
        existing = readFileSync(memoryPath, "utf-8");
      }
      writeFileSync(memoryPath, existing + snapshot, "utf-8");
      return true;
    } catch {
      /* non-fatal — WORKING.md may be malformed */
      return false;
    }
  }

  // On session_compact: persist WORKING.md candidate learnings snapshot
  pi.on("session_compact", async () => {
    extractAndPersistLearnings("Compaction");
  });

  // On session_shutdown: extract learnings and add shutdown marker
  pi.on("session_shutdown", async () => {
    // Extract and persist any remaining candidate learnings
    extractAndPersistLearnings("Shutdown");

    // Write a shutdown marker to WORKING.md
    if (!existsSync(workingPath)) return;
    try {
      const working = readFileSync(workingPath, "utf-8");
      if (working.trim().length === 0) return;

      const marker = `\n---\n_Session ended: ${new Date().toISOString()}_\n`;
      writeFileSync(workingPath, working + marker, "utf-8");
    } catch {
      /* non-fatal */
    }
  });
}
