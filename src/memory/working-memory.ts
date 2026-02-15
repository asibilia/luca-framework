import type { WorkingMemory, WorkingMemorySection } from "./types.ts";
import { workingMemorySchema, WORKING_MEMORY_SECTIONS } from "./types.ts";
import type { Result } from "../shared/types.ts";
import { estimateTokens } from "./token-estimator.ts";

/**
 * Valid section name type from the WORKING_MEMORY_SECTIONS const.
 */
type WorkingMemorySectionName = (typeof WORKING_MEMORY_SECTIONS)[number];

/** Default token threshold per section before auto-summarize triggers. */
const DEFAULT_SECTION_TOKEN_THRESHOLD = 2000;

/** Total working memory token threshold before global compression. */
const DEFAULT_TOTAL_TOKEN_THRESHOLD = 8000;

/**
 * Mapping from markdown header text to section name.
 *
 * Supports both primary and alternative header names (e.g., "Findings"
 * and "Immediate Findings" both map to "findings").
 */
const HEADER_TO_SECTION: Record<string, WorkingMemorySectionName> = {
  "Session Info": "session_info",
  "Memory Recall": "memory_recall",
  "Planning Notes": "planning_notes",
  Findings: "findings",
  "Immediate Findings": "findings",
  Hypotheses: "hypotheses",
  "Candidate Learnings": "candidate_learnings",
  "Pre-Learning Extraction": "candidate_learnings",
};

/**
 * Mapping from section name back to display header text.
 *
 * Used by serializeWorkingMemory to produce human-readable markdown.
 */
const SECTION_TO_HEADER: Record<WorkingMemorySectionName, string> = {
  session_info: "Session Info",
  memory_recall: "Memory Recall",
  planning_notes: "Planning Notes",
  findings: "Findings",
  hypotheses: "Hypotheses",
  candidate_learnings: "Candidate Learnings",
};

/**
 * Parse WORKING.md markdown into a structured WorkingMemory object.
 *
 * Detects sections by `## Section Name` headers and maps them to
 * the canonical section name enum. Token estimates are computed
 * for each section and summed into total_tokens. Session status
 * is detected from `_Session Status_` checkboxes.
 *
 * @param markdown - Raw markdown content of WORKING.md
 * @returns Result with parsed WorkingMemory, or error if validation fails
 *
 * @example
 * ```typescript
 * const md = await Bun.file(".planning/WORKING.md").text();
 * const result = parseWorkingMemory(md);
 * if (result.success) {
 *   console.log(result.data.sections.length);
 *   console.log(result.data.total_tokens);
 * }
 * ```
 */
export function parseWorkingMemory(markdown: string): Result<WorkingMemory> {
  try {
    const sections: WorkingMemorySection[] = [];
    const lines = markdown.split("\n");

    let currentSectionName: WorkingMemorySectionName | null = null;
    let currentContent: string[] = [];
    let statusPart = "";
    let inStatusSection = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]!;

      // Detect _Session Status_ block (may be preceded by --- separator)
      if (line.trim() === "_Session Status_") {
        inStatusSection = true;
        // Flush current section before status, trimming trailing --- separators
        if (currentSectionName) {
          // Remove trailing --- lines from section content
          while (
            currentContent.length > 0 &&
            (currentContent[currentContent.length - 1]!.trim() === "---" ||
              currentContent[currentContent.length - 1]!.trim() === "")
          ) {
            currentContent.pop();
          }
          sections.push(buildSection(currentSectionName, currentContent));
          currentSectionName = null;
          currentContent = [];
        }
        statusPart += line + "\n";
        continue;
      }

      if (inStatusSection) {
        statusPart += line + "\n";
        continue;
      }

      // Detect ## headers
      const headerMatch = line.match(/^## (.+)$/);
      if (headerMatch) {
        const headerText = headerMatch[1]!.trim();
        const sectionName = HEADER_TO_SECTION[headerText];

        // Flush previous section
        if (currentSectionName) {
          sections.push(buildSection(currentSectionName, currentContent));
          currentContent = [];
        }

        if (sectionName) {
          currentSectionName = sectionName;
        } else {
          // Unknown section -- skip content until next known header
          currentSectionName = null;
        }
        continue;
      }

      // Skip the main title (# Working Memory)
      if (line.match(/^# /)) {
        // Flush any current section
        if (currentSectionName) {
          sections.push(buildSection(currentSectionName, currentContent));
          currentSectionName = null;
          currentContent = [];
        }
        continue;
      }

      // Accumulate content for current section
      if (currentSectionName) {
        currentContent.push(line);
      }
    }

    // Flush final section
    if (currentSectionName) {
      sections.push(buildSection(currentSectionName, currentContent));
    }

    // Detect status from checkboxes
    const status = detectStatus(statusPart);

    // Calculate total tokens
    const totalTokens = sections.reduce((sum, s) => sum + s.token_estimate, 0);

    const result = workingMemorySchema.safeParse({
      sections,
      total_tokens: totalTokens,
      status,
    });

    if (!result.success) {
      return {
        success: false,
        error: `WorkingMemory validation failed: ${result.error.message}`,
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse working memory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Convert a structured WorkingMemory back to markdown.
 *
 * Produces valid markdown with `# Working Memory` title, `## Section Name`
 * headers for each section, and `_Session Status_` checkboxes at the bottom.
 * Output is readable by lu-learner and can be written back to WORKING.md.
 *
 * @param wm - Structured WorkingMemory object
 * @returns Markdown string representation
 *
 * @example
 * ```typescript
 * const md = serializeWorkingMemory(workingMemory);
 * await Bun.write(".planning/WORKING.md", md);
 * ```
 */
export function serializeWorkingMemory(wm: WorkingMemory): string {
  const parts: string[] = ["# Working Memory", ""];

  for (const section of wm.sections) {
    const header = SECTION_TO_HEADER[section.name] ?? section.name;
    parts.push(`## ${header}`);
    parts.push("");

    const content = section.content.trim();
    if (content) {
      parts.push(content);
    }

    parts.push("");
  }

  // Add separator and status section
  parts.push("---");
  parts.push("");
  parts.push("_Session Status_");
  parts.push("");

  const statusChecks: Record<string, string> = {
    active: "Active",
    extracted: "Learnings extracted",
    cleared: "Ready to clear",
  };

  for (const [key, label] of Object.entries(statusChecks)) {
    const checked = wm.status === key;
    parts.push(`- [${checked ? "x" : " "}] ${label}`);
  }
  parts.push("");

  return parts.join("\n");
}

/**
 * Add or update a section in the working memory.
 *
 * Returns a NEW WorkingMemory (immutable -- does not mutate input).
 * In append mode, content is concatenated with a double newline separator.
 * In replace mode, content overwrites the section entirely. If the section
 * does not exist, it is created.
 *
 * @param wm - Current WorkingMemory (not mutated)
 * @param sectionName - Name of the section to add/update
 * @param content - New content to add or replace with
 * @param mergeMode - "append" (default) or "replace"
 * @returns New WorkingMemory with updated section and recalculated token estimates
 *
 * @example
 * ```typescript
 * const updated = addSection(wm, "findings", "Found a bug in module X");
 * // original wm is unchanged, updated has new content appended
 * ```
 */
export function addSection(
  wm: WorkingMemory,
  sectionName: WorkingMemorySectionName,
  content: string,
  mergeMode: "append" | "replace" = "append",
): WorkingMemory {
  const existingIndex = wm.sections.findIndex((s) => s.name === sectionName);

  let newSections: WorkingMemorySection[];

  if (existingIndex >= 0) {
    newSections = wm.sections.map((s, i) => {
      if (i !== existingIndex) return { ...s };

      const newContent =
        mergeMode === "append"
          ? s.content.trim()
            ? `${s.content.trim()}\n\n${content}`
            : content
          : content;

      return {
        name: sectionName,
        content: newContent,
        token_estimate: estimateTokens(newContent),
        last_updated_at: new Date().toISOString(),
      };
    });
  } else {
    // Create new section
    newSections = [
      ...wm.sections.map((s) => ({ ...s })),
      {
        name: sectionName,
        content,
        token_estimate: estimateTokens(content),
        last_updated_at: new Date().toISOString(),
      },
    ];
  }

  const totalTokens = newSections.reduce((sum, s) => sum + s.token_estimate, 0);

  // Internal construction — .parse() validates shape, data is computed (not external input)
  return workingMemorySchema.parse({
    sections: newSections,
    total_tokens: totalTokens,
    status: wm.status,
    session_started_at: wm.session_started_at,
  });
}

/**
 * Summarize a section by truncating to fit within a token budget.
 *
 * Returns a NEW WorkingMemory (immutable -- does not mutate input).
 * If the section's token count is below the threshold, returns unchanged.
 * If over threshold, truncates to the last N lines that fit within the
 * token budget and prepends a `[Summarized]` marker.
 *
 * @param wm - Current WorkingMemory (not mutated)
 * @param sectionName - Name of the section to summarize
 * @param maxTokens - Maximum token count for the section (default: 2000)
 * @returns New WorkingMemory with summarized section
 *
 * @example
 * ```typescript
 * const summarized = summarizeSection(wm, "findings", 1000);
 * ```
 */
export function summarizeSection(
  wm: WorkingMemory,
  sectionName: WorkingMemorySectionName,
  maxTokens: number = DEFAULT_SECTION_TOKEN_THRESHOLD,
): WorkingMemory {
  const sectionIndex = wm.sections.findIndex((s) => s.name === sectionName);

  if (sectionIndex < 0) return wm;

  const section = wm.sections[sectionIndex]!;

  if (section.token_estimate <= maxTokens) return wm;

  const originalTokens = section.token_estimate;
  const lines = section.content.split("\n");

  // Keep lines from the end until we exceed the budget (minus room for the marker)
  const markerText = `[Summarized: original was ~${originalTokens} tokens, truncated to ~`;
  const markerOverhead = estimateTokens(markerText + "9999 tokens]");
  const availableTokens = maxTokens - markerOverhead;

  const keptLines: string[] = [];
  let keptTokens = 0;

  // Iterate from the end to keep the most recent content
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineTokens = estimateTokens(lines[i]!);
    if (keptTokens + lineTokens > availableTokens && keptLines.length > 0) {
      break;
    }
    if (lineTokens > availableTokens && keptLines.length === 0) {
      // Single line exceeds budget -- truncate by characters
      const maxChars = Math.max(1, availableTokens * 4);
      keptLines.unshift(lines[i]!.slice(-maxChars));
      keptTokens = estimateTokens(keptLines[0]!);
      break;
    }
    keptLines.unshift(lines[i]!);
    keptTokens += lineTokens;
  }

  const truncatedContent = keptLines.join("\n");
  const finalTokens = estimateTokens(truncatedContent);
  const markerLine = `[Summarized: original was ~${originalTokens} tokens, truncated to ~${finalTokens} tokens]`;
  const newContent = `${markerLine}\n\n${truncatedContent}`;
  const newTokenEstimate = estimateTokens(newContent);

  const newSections = wm.sections.map((s, i) => {
    if (i !== sectionIndex) return { ...s };
    return {
      name: sectionName,
      content: newContent,
      token_estimate: newTokenEstimate,
      last_updated_at: new Date().toISOString(),
    };
  });

  const totalTokens = newSections.reduce((sum, s) => sum + s.token_estimate, 0);

  // Internal construction — .parse() validates shape, data is computed (not external input)
  return workingMemorySchema.parse({
    sections: newSections,
    total_tokens: totalTokens,
    status: wm.status,
    session_started_at: wm.session_started_at,
  });
}

/**
 * Check which sections exceed token thresholds and whether the
 * total working memory should be auto-summarized.
 *
 * @param wm - WorkingMemory to check
 * @param thresholds - Optional threshold overrides
 * @returns Object indicating whether summarization is needed and which sections are over
 *
 * @example
 * ```typescript
 * const check = shouldAutoSummarize(wm);
 * if (check.should_summarize) {
 *   for (const section of check.sections_over) {
 *     wm = summarizeSection(wm, section);
 *   }
 * }
 * ```
 */
export function shouldAutoSummarize(
  wm: WorkingMemory,
  thresholds?: { section?: number; total?: number },
): { should_summarize: boolean; sections_over: string[] } {
  const sectionThreshold =
    thresholds?.section ?? DEFAULT_SECTION_TOKEN_THRESHOLD;
  const totalThreshold = thresholds?.total ?? DEFAULT_TOTAL_TOKEN_THRESHOLD;

  const sectionsOver = wm.sections
    .filter((s) => s.token_estimate > sectionThreshold)
    .map((s) => s.name);

  const totalOver = wm.total_tokens > totalThreshold;

  return {
    should_summarize: sectionsOver.length > 0 || totalOver,
    sections_over: sectionsOver,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Build a WorkingMemorySection from accumulated content lines.
 *
 * Trims leading/trailing blank lines and computes token estimate.
 *
 * @param name - Section name
 * @param contentLines - Raw content lines
 * @returns WorkingMemorySection with token estimate
 */
function buildSection(
  name: WorkingMemorySectionName,
  contentLines: string[],
): WorkingMemorySection {
  // Trim leading and trailing empty lines
  const content = contentLines.join("\n").trim();
  return {
    name,
    content,
    token_estimate: estimateTokens(content),
  };
}

/**
 * Detect working memory status from Session Status checkboxes.
 *
 * Checks which checkboxes are checked (`[x]`) and returns the
 * highest status: cleared > extracted > active.
 *
 * @param statusBlock - The raw text of the _Session Status_ block
 * @returns Status string
 */
function detectStatus(statusBlock: string): "active" | "extracted" | "cleared" {
  if (statusBlock.includes("[x] Ready to clear")) return "cleared";
  if (statusBlock.includes("[x] Learnings extracted")) return "extracted";
  if (statusBlock.includes("[x] Active")) return "active";
  return "active";
}
