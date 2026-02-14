import type { ProcedureEntry } from "./types.ts";
import { procedureEntrySchema } from "./types.ts";
import type { Result } from "../shared/types.ts";
import { estimateTokens } from "./token-estimator.ts";

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generate a deterministic procedure ID from a title string.
 *
 * Follows the generateEntryId pattern from memory-parser.ts:
 * lowercase, strip punctuation, replace spaces with dashes,
 * prefix with "proc-". Truncated slug to 50 characters.
 *
 * @param title - Procedure title
 * @returns Deterministic ID string in format "proc-<slug>"
 *
 * @example
 * ```typescript
 * generateProcedureId("Add security hardening")
 * // => "proc-add-security-hardening"
 * ```
 */
export function generateProcedureId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove punctuation
    .replace(/\s+/g, "-") // Spaces to dashes
    .replace(/-+/g, "-") // Collapse multiple dashes
    .replace(/^-|-$/g, "") // Trim leading/trailing dashes
    .slice(0, 50);
  return `proc-${slug}`;
}

// ─── File Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a PROCEDURES.md file into structured ProcedureEntry array.
 *
 * Reads the file using Bun.file() and delegates to parseProcedureContent.
 * Returns a Result discriminated union with parsed entries or error.
 *
 * @param filePath - Path to the PROCEDURES.md file
 * @returns Result with parsed procedure entries or error
 *
 * @example
 * ```typescript
 * const result = await parseProcedureFile(".planning/PROCEDURES.md");
 * if (result.success) {
 *   console.log(`Parsed ${result.data.length} procedures`);
 *   for (const proc of result.data) {
 *     console.log(`  [${proc.status}] ${proc.title} (${proc.success_rate})`);
 *   }
 * }
 * ```
 */
export async function parseProcedureFile(
  filePath: string,
): Promise<Result<ProcedureEntry[]>> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    const text = await file.text();
    return parseProcedureContent(text);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Content Parsing ──────────────────────────────────────────────────────────

/**
 * Parse PROCEDURES.md content string into structured ProcedureEntry array.
 *
 * Exported for testing purposes (avoids file I/O in unit tests).
 *
 * Parsing rules:
 * - Split by `## Active Procedures` and `## Retired Procedures` sections
 * - Within each section, split by `### ` headers for individual procedures
 * - Parse metadata lines for trigger, source, tags, success rate, etc.
 * - Parse numbered step lists after `**Steps:**` marker
 * - Steps can have optional `-> output: text` and `[tool: name]`
 * - Invalid entries are skipped with console.warn
 *
 * @param content - Raw markdown content of PROCEDURES.md
 * @returns Result with parsed procedure entries
 */
export function parseProcedureContent(
  content: string,
): Result<ProcedureEntry[]> {
  try {
    if (!content.trim()) {
      return { success: true, data: [] };
    }

    const entries: ProcedureEntry[] = [];

    // Split into Active and Retired sections
    const activeEntries = extractSectionEntries(
      content,
      "Active Procedures",
      "active",
    );
    const retiredEntries = extractSectionEntries(
      content,
      "Retired Procedures",
      "retired",
    );

    entries.push(...activeEntries);
    entries.push(...retiredEntries);

    return { success: true, data: entries };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse procedure content: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Section Extraction ────────────────────────────────────────────────────────

/**
 * Extract procedure entries from a named section.
 *
 * Finds the section by `## <sectionName>` header, then splits individual
 * procedures by `### ` headers within that section.
 *
 * @param content - Full markdown content
 * @param sectionName - Section header (e.g., "Active Procedures")
 * @param status - Status to assign to entries in this section
 * @returns Array of parsed ProcedureEntry objects
 */
function extractSectionEntries(
  content: string,
  sectionName: string,
  status: "active" | "retired",
): ProcedureEntry[] {
  const entries: ProcedureEntry[] = [];

  // Find the section start
  const sectionPattern = new RegExp(
    `^## ${escapeRegex(sectionName)}\\s*$`,
    "m",
  );
  const sectionMatch = content.match(sectionPattern);

  if (!sectionMatch || sectionMatch.index === undefined) {
    return entries;
  }

  const sectionStart = sectionMatch.index + sectionMatch[0].length;

  // Find the section end (next ## header or end of content)
  const nextSectionMatch = content.slice(sectionStart).match(/^## /m);
  const sectionEnd =
    nextSectionMatch?.index !== undefined
      ? sectionStart + nextSectionMatch.index
      : content.length;

  const sectionContent = content.slice(sectionStart, sectionEnd);

  // Split by ### headers within the section
  const procedureBlocks = splitByH3(sectionContent);

  for (const block of procedureBlocks) {
    const entry = parseProcedureBlock(block.title, block.content, status);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Split section content into blocks by ### headers.
 *
 * @param sectionContent - Content of a ## section
 * @returns Array of { title, content } for each ### block
 */
function splitByH3(
  sectionContent: string,
): Array<{ title: string; content: string }> {
  const blocks: Array<{ title: string; content: string }> = [];
  const lines = sectionContent.split("\n");

  let currentTitle = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (currentTitle) {
      blocks.push({
        title: currentTitle,
        content: currentLines.join("\n"),
      });
    }
    currentTitle = "";
    currentLines = [];
  };

  for (const line of lines) {
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      flush();
      currentTitle = h3Match[1]!.trim();
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }

  flush();
  return blocks;
}

// ─── Block Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a single procedure block into a ProcedureEntry.
 *
 * Extracts metadata from `- **Field**: value` lines and steps from
 * numbered lists after `**Steps:**`.
 *
 * @param title - Procedure title from ### header
 * @param content - Block content between ### headers
 * @param status - Entry status (active or retired)
 * @returns Validated ProcedureEntry or null if invalid
 */
function parseProcedureBlock(
  title: string,
  content: string,
  status: "active" | "retired",
): ProcedureEntry | null {
  if (!title.trim()) return null;

  const trigger = extractField(content, "Trigger") ?? "";
  if (!trigger) {
    // Trigger is required for a valid procedure
    console.warn(`Skipping procedure "${title}": missing Trigger field`);
    return null;
  }

  const sourceRaw = extractField(content, "Source") ?? "general";
  const { agent: sourceAgent, phase: sourcePhase } = parseSource(sourceRaw);

  const tagsRaw = extractField(content, "Tags") ?? "";
  const tags = parseTagsBrackets(tagsRaw);

  const successRateRaw = extractField(content, "Success Rate") ?? "";
  const { rate, successCount, executionCount } =
    parseSuccessRate(successRateRaw);

  const lastExecuted = extractField(content, "Last Executed");
  const retirementReason = extractField(content, "Retirement Reason");

  const steps = parseSteps(content);
  const id = generateProcedureId(title);
  const tokenEstimate = estimateTokens(content);

  const raw = {
    id,
    title: title.trim(),
    trigger,
    steps,
    tags,
    source_agent: sourceAgent,
    source_phase: sourcePhase,
    execution_count: executionCount,
    success_count: successCount,
    success_rate: rate,
    added_at: new Date().toISOString(),
    last_executed_at: lastExecuted || undefined,
    token_estimate: tokenEstimate,
    status,
    retirement_reason: retirementReason || undefined,
  };

  const result = procedureEntrySchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      `Skipping invalid procedure "${title}": ${result.error.message}`,
    );
    return null;
  }

  return result.data;
}

// ─── Field Extraction ──────────────────────────────────────────────────────────

/**
 * Extract a metadata field value from procedure block content.
 *
 * Matches patterns like:
 *   - **Trigger**: When doing X
 *   - **Source**: lu-executor (Phase 35)
 *   - **Tags**: [tag1, tag2]
 *
 * @param content - Block content
 * @param fieldName - Name of the field (e.g., "Trigger", "Source")
 * @returns Trimmed field value, or undefined if not found
 */
function extractField(content: string, fieldName: string): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*-\\s+\\*\\*${escapeRegex(fieldName)}\\*\\*:\\s*(.+)`,
    "m",
  );
  const match = content.match(pattern);
  return match?.[1]?.trim();
}

/**
 * Parse source string into agent name and optional phase number.
 *
 * Handles formats:
 *   "lu-executor (Phase 35)" -> { agent: "lu-executor", phase: 35 }
 *   "general" -> { agent: "general", phase: undefined }
 *
 * @param source - Raw source string
 * @returns Parsed agent and phase
 */
function parseSource(source: string): {
  agent: string;
  phase: number | undefined;
} {
  const match = source.match(/^(.+?)\s*\(Phase\s+(\d+)\)$/);
  if (match) {
    return {
      agent: match[1]!.trim(),
      phase: parseInt(match[2]!, 10),
    };
  }
  return { agent: source.trim(), phase: undefined };
}

/**
 * Parse tags from a bracketed string like "[tag1, tag2]".
 *
 * @param text - Text containing bracketed tags
 * @returns Array of tag strings
 */
function parseTagsBrackets(text: string): string[] {
  const match = text.match(/\[([^\]]*)\]/);
  if (!match || !match[1]) return [];

  return match[1]
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Parse success rate from formatted string.
 *
 * Handles format: "0.83 (5/6)" -> { rate: 0.83, successCount: 5, executionCount: 6 }
 * Falls back to: "0.83" -> { rate: 0.83, successCount: 0, executionCount: 0 }
 *
 * @param raw - Raw success rate string
 * @returns Parsed rate, success count, and execution count
 */
function parseSuccessRate(raw: string): {
  rate: number;
  successCount: number;
  executionCount: number;
} {
  if (!raw) {
    return { rate: 0, successCount: 0, executionCount: 0 };
  }

  const match = raw.match(/^([\d.]+)\s*\((\d+)\/(\d+)\)$/);
  if (match) {
    return {
      rate: parseFloat(match[1]!),
      successCount: parseInt(match[2]!, 10),
      executionCount: parseInt(match[3]!, 10),
    };
  }

  // Try plain number
  const plainRate = parseFloat(raw);
  if (!isNaN(plainRate)) {
    return { rate: plainRate, successCount: 0, executionCount: 0 };
  }

  return { rate: 0, successCount: 0, executionCount: 0 };
}

// ─── Step Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse numbered steps from procedure block content.
 *
 * Finds the `**Steps:**` marker and parses numbered list items after it.
 * Each step can optionally include:
 * - `-> output: text` for expected_output
 * - `[tool: name]` for tool
 *
 * @param content - Block content containing steps
 * @returns Array of parsed step objects
 *
 * @example
 * ```
 * **Steps:**
 *
 * 1. First action
 * 2. Second action -> output: some artifact
 * 3. Third action [tool: lu-executor]
 * ```
 */
function parseSteps(
  content: string,
): Array<{
  order: number;
  action: string;
  expected_output?: string;
  tool?: string;
}> {
  const steps: Array<{
    order: number;
    action: string;
    expected_output?: string;
    tool?: string;
  }> = [];

  // Find the **Steps:** marker
  const stepsMarkerIndex = content.indexOf("**Steps:**");
  if (stepsMarkerIndex === -1) return steps;

  const afterSteps = content.slice(stepsMarkerIndex + "**Steps:**".length);
  const lines = afterSteps.split("\n");

  for (const line of lines) {
    // Match numbered list: "1. Action text"
    const stepMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (!stepMatch) continue;

    const order = parseInt(stepMatch[1]!, 10);
    let actionRaw = stepMatch[2]!.trim();

    // Extract optional [tool: name]
    let tool: string | undefined;
    const toolMatch = actionRaw.match(/\[tool:\s*([^\]]+)\]/);
    if (toolMatch) {
      tool = toolMatch[1]!.trim();
      actionRaw = actionRaw.replace(toolMatch[0], "").trim();
    }

    // Extract optional -> output: text
    let expectedOutput: string | undefined;
    const outputMatch = actionRaw.match(/->\s*output:\s*(.+)$/);
    if (outputMatch) {
      expectedOutput = outputMatch[1]!.trim();
      actionRaw = actionRaw.slice(0, outputMatch.index).trim();
    }

    steps.push({
      order,
      action: actionRaw,
      ...(expectedOutput !== undefined
        ? { expected_output: expectedOutput }
        : {}),
      ...(tool !== undefined ? { tool } : {}),
    });
  }

  return steps;
}

// ─── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serialize an array of ProcedureEntry objects into PROCEDURES.md markdown format.
 *
 * Produces a complete PROCEDURES.md file with:
 * - Title and description
 * - Active Procedures section
 * - Retired Procedures section
 * - Statistics footer
 *
 * @param entries - Array of ProcedureEntry objects to serialize
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const markdown = serializeProcedures(entries);
 * await Bun.write(".planning/PROCEDURES.md", markdown);
 * ```
 */
export function serializeProcedures(entries: ProcedureEntry[]): string {
  const activeEntries = entries.filter((e) => e.status === "active");
  const retiredEntries = entries.filter((e) => e.status === "retired");

  const lines: string[] = [];

  lines.push("# Procedures");
  lines.push("");
  lines.push(
    "> Executable learned procedures extracted from successful executions.",
  );
  lines.push("> Recalled during planning to suggest proven step sequences.");
  lines.push("");

  // Active Procedures
  lines.push("## Active Procedures");
  lines.push("");

  if (activeEntries.length === 0) {
    lines.push(
      "<!-- No procedures extracted yet. Procedures are added by lu-learner after successful phase executions. -->",
    );
  } else {
    for (const entry of activeEntries) {
      lines.push(serializeEntry(entry));
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Retired Procedures
  lines.push("## Retired Procedures");
  lines.push("");

  if (retiredEntries.length === 0) {
    lines.push(
      "<!-- Procedures with success rate below threshold or marked obsolete -->",
    );
  } else {
    for (const entry of retiredEntries) {
      lines.push(serializeEntry(entry));
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Statistics footer
  const avgRate =
    activeEntries.length > 0
      ? (
          activeEntries.reduce((sum, e) => sum + e.success_rate, 0) /
          activeEntries.length
        ).toFixed(2)
      : "N/A";

  lines.push("_Procedure Statistics_");
  lines.push("");
  lines.push(`- Total active: ${activeEntries.length}`);
  lines.push(`- Total retired: ${retiredEntries.length}`);
  lines.push(`- Average success rate: ${avgRate}`);
  lines.push(`- Last updated: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Serialize a single ProcedureEntry into markdown format.
 *
 * @param entry - ProcedureEntry to serialize
 * @returns Formatted markdown string for one procedure block
 */
function serializeEntry(entry: ProcedureEntry): string {
  const lines: string[] = [];

  lines.push(`### ${entry.title}`);
  lines.push("");
  lines.push(`- **Trigger**: ${entry.trigger}`);

  const sourceStr =
    entry.source_phase !== undefined
      ? `${entry.source_agent} (Phase ${entry.source_phase})`
      : entry.source_agent;
  lines.push(`- **Source**: ${sourceStr}`);

  if (entry.tags.length > 0) {
    lines.push(`- **Tags**: [${entry.tags.join(", ")}]`);
  } else {
    lines.push(`- **Tags**: []`);
  }

  const rateDisplay =
    entry.execution_count > 0
      ? `${entry.success_rate.toFixed(2)} (${entry.success_count}/${entry.execution_count})`
      : `${entry.success_rate.toFixed(2)}`;
  lines.push(`- **Success Rate**: ${rateDisplay}`);

  if (entry.last_executed_at) {
    lines.push(`- **Last Executed**: ${entry.last_executed_at}`);
  }

  lines.push(
    `- **Status**: ${entry.status === "active" ? "Active" : "Retired"}`,
  );

  if (entry.retirement_reason) {
    lines.push(`- **Retirement Reason**: ${entry.retirement_reason}`);
  }

  lines.push("");
  lines.push("**Steps:**");
  lines.push("");

  for (const step of entry.steps) {
    let stepLine = `${step.order}. ${step.action}`;
    if (step.expected_output) {
      stepLine += ` -> output: ${step.expected_output}`;
    }
    if (step.tool) {
      stepLine += ` [tool: ${step.tool}]`;
    }
    lines.push(stepLine);
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

/**
 * Escape special regex characters in a string.
 *
 * @param str - String to escape
 * @returns Regex-safe string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────────

/**
 * CLI entry point for the procedure parser.
 *
 * Usage:
 *   bun run src/memory/procedure-parser.ts --file=.planning/PROCEDURES.md
 *
 * Outputs JSON array of parsed procedure entries to stdout.
 *
 * @example
 * ```sh
 * bun run src/memory/procedure-parser.ts --file=.planning/PROCEDURES.md
 * ```
 */
if (import.meta.main) {
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const filePath = fileArg?.split("=")[1] ?? ".planning/PROCEDURES.md";

  const result = await parseProcedureFile(filePath);

  if (result.success) {
    console.log(JSON.stringify(result.data, null, 2));
    process.exit(0);
  } else {
    console.error("Error:", result.error);
    process.exit(1);
  }
}
