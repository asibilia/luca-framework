import type { MemoryEntry } from "./types.ts";
import { memoryEntrySchema } from "./types.ts";
import type { Result } from "../shared/types.ts";
import { estimateTokens } from "./token-estimator.ts";

/**
 * Category type for memory entries.
 */
type MemoryCategory = "pattern" | "decision" | "pitfall" | "preference";

/**
 * Mapping from markdown section headers to entry categories.
 *
 * Supports both top-level headers (## Patterns) and nested headers
 * (### Validated Approaches under ## Patterns).
 */
const SECTION_CATEGORIES: Record<string, MemoryCategory> = {
  Patterns: "pattern",
  "Validated Approaches": "pattern",
  Decisions: "decision",
  "Architectural Choices": "decision",
  Pitfalls: "pitfall",
  "Known Issues": "pitfall",
  Preferences: "preference",
  "User Preferences": "preference",
  "Project Preferences": "preference",
  Archive: "pattern",
};

/**
 * Parse a MEMORY.md file into structured MemoryEntry array.
 *
 * Handles the current MEMORY.md format used by lu-learner:
 * - ## Patterns / ### Validated Approaches (inline list format)
 * - ## Decisions / ### Architectural Choices (table + subsection format)
 * - ## Pitfalls / ### Known Issues (inline list format)
 * - ## Preferences (inline list format)
 *
 * Each entry is parsed for metadata (tags, confidence, agent, added date)
 * and validated against the memoryEntrySchema. Invalid entries are skipped
 * with a console warning.
 *
 * @param filePath - Path to the MEMORY.md file
 * @returns Result with parsed entries or error
 *
 * @example
 * ```typescript
 * const result = await parseMemoryFile(".planning/MEMORY.md");
 * if (result.success) {
 *   console.log(`Parsed ${result.data.length} memory entries`);
 *   for (const entry of result.data) {
 *     console.log(`  [${entry.category}] ${entry.title}`);
 *   }
 * }
 * ```
 */
export async function parseMemoryFile(
  filePath: string,
): Promise<Result<MemoryEntry[]>> {
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
    return parseMemoryContent(text);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Parse MEMORY.md content string into structured MemoryEntry array.
 *
 * Exported for testing purposes (avoids file I/O in unit tests).
 *
 * @param content - Raw markdown content
 * @returns Result with parsed entries
 */
export function parseMemoryContent(content: string): Result<MemoryEntry[]> {
  try {
    if (!content.trim()) {
      return { success: true, data: [] };
    }

    const entries: MemoryEntry[] = [];
    const sections = splitSections(content);

    for (const section of sections) {
      const category = resolveCategory(section.header);
      if (!category) continue;

      const sectionEntries = parseSectionEntries(
        section.content,
        category,
        section.isArchive,
      );
      entries.push(...sectionEntries);
    }

    return { success: true, data: entries };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse memory content: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Section Splitting ────────────────────────────────────────────────────────

/**
 * Represents a parsed markdown section.
 */
interface ParsedSection {
  /** Section header text (without ## or ###) */
  header: string;
  /** Section content (everything between this header and the next) */
  content: string;
  /** Whether this is an archive section */
  isArchive: boolean;
}

/**
 * Split markdown content into sections by ## and ### headers.
 *
 * Detects both level-2 (## Section) and level-3 (### Subsection) headers
 * and creates separate ParsedSection entries for each.
 *
 * @param content - Raw markdown content
 * @returns Array of parsed sections
 */
function splitSections(content: string): ParsedSection[] {
  const lines = content.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeader = "";
  let currentLines: string[] = [];
  let isArchive = false;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);

    if (h2Match) {
      // Flush previous section
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          content: currentLines.join("\n"),
          isArchive,
        });
      }

      const header = h2Match[1]!.trim();
      currentHeader = header;
      currentLines = [];
      isArchive = header.toLowerCase() === "archive";
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section
  if (currentHeader) {
    sections.push({
      header: currentHeader,
      content: currentLines.join("\n"),
      isArchive,
    });
  }

  return sections;
}

/**
 * Resolve a section header to a memory category.
 *
 * @param header - Section header text
 * @returns Category or undefined if not a known memory section
 */
function resolveCategory(header: string): MemoryCategory | undefined {
  return SECTION_CATEGORIES[header];
}

// ─── Entry Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a section of MEMORY.md into entries.
 *
 * Supports two entry formats:
 *
 * Format 1 (inline list item -- used for Patterns/Pitfalls):
 *   - **Entry Name**: Description text
 *     Tags: [tag1, tag2]
 *
 * Format 2 (subsection -- used for Decisions):
 *   ### Entry Name
 *   - **Field**: Value
 *   - **Tags**: [tag1, tag2]
 *
 * Also handles markdown table rows for Decisions that use table format.
 *
 * @param sectionContent - Raw content of the section
 * @param category - Category to assign to entries
 * @param isArchive - Whether this section is an archive (affects default confidence)
 * @returns Array of parsed MemoryEntry objects
 */
function parseSectionEntries(
  sectionContent: string,
  category: MemoryCategory,
  isArchive: boolean = false,
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];

  // Try inline list entries first
  const inlineEntries = parseInlineEntries(sectionContent, category, isArchive);
  entries.push(...inlineEntries);

  // Try subsection entries (### headers within the section)
  const subsectionEntries = parseSubsectionEntries(
    sectionContent,
    category,
    isArchive,
  );
  entries.push(...subsectionEntries);

  // Try table entries (markdown tables)
  const tableEntries = parseTableEntries(sectionContent, category, isArchive);
  entries.push(...tableEntries);

  return entries;
}

/**
 * Parse inline list entries from section content.
 *
 * Matches the pattern:
 *   - **Entry Name**: Description text
 *     Tags: [tag1, tag2]
 *   - **Another Entry**: More text
 *     - **Sub-field**: Value
 *     Tags: [tag1]
 *
 * @param content - Section content
 * @param category - Entry category
 * @param isArchive - Whether this is an archive section
 * @returns Parsed entries
 */
function parseInlineEntries(
  content: string,
  category: MemoryCategory,
  isArchive: boolean,
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split("\n");

  let currentTitle = "";
  let currentDescription = "";
  let currentExtraLines: string[] = [];

  const flushEntry = () => {
    if (!currentTitle) return;

    const fullContent = currentDescription
      ? `${currentDescription}\n${currentExtraLines.join("\n")}`.trim()
      : currentExtraLines.join("\n").trim();

    const tags =
      extractTags(fullContent) || extractTags(currentExtraLines.join("\n"));
    const extraContent = currentExtraLines.join("\n");
    const confidence = extractMetadataField(extraContent, "Confidence");
    const agent = extractMetadataField(extraContent, "Agent");
    const added = extractMetadataField(extraContent, "Added");
    const milestone = extractMetadataField(extraContent, "Milestone");

    const entry = buildEntry(
      currentTitle,
      fullContent || currentDescription,
      category,
      tags,
      confidence,
      agent,
      added,
      isArchive,
      milestone,
    );

    if (entry) entries.push(entry);
    currentTitle = "";
    currentDescription = "";
    currentExtraLines = [];
  };

  for (const line of lines) {
    // Match: - **Title**: Description
    const inlineMatch = line.match(/^- \*\*(.+?)\*\*:\s*(.*)$/);

    // Match: - **[Phase N] Title**: Description
    const bracketMatch = line.match(/^- \*\*(\[.+?\]\s*.+?)\*\*:\s*(.*)$/);

    const match = bracketMatch || inlineMatch;

    if (match) {
      flushEntry();
      currentTitle = match[1]!.trim();
      currentDescription = match[2]!.trim();
    } else if (currentTitle) {
      // Continuation line (indented or sub-field)
      currentExtraLines.push(line);
    }
  }

  flushEntry();
  return entries;
}

/**
 * Parse subsection entries (### headers) from section content.
 *
 * Matches the pattern:
 *   ### Decision Title
 *   - **Context**: Description
 *   - **Tags**: [tag1, tag2]
 *   - **Confidence**: High
 *
 * @param content - Section content
 * @param category - Entry category
 * @param isArchive - Whether this is an archive section
 * @returns Parsed entries
 */
function parseSubsectionEntries(
  content: string,
  category: MemoryCategory,
  isArchive: boolean,
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split("\n");

  let currentTitle = "";
  let currentLines: string[] = [];

  const flushSubsection = () => {
    if (!currentTitle) return;

    // Skip known non-entry subsections
    const skipHeaders = [
      "Validated Approaches",
      "Architectural Choices",
      "Known Issues",
      "User Preferences",
      "Project Preferences",
      "Trade-offs Made",
    ];
    if (skipHeaders.includes(currentTitle)) {
      currentTitle = "";
      currentLines = [];
      return;
    }

    const fullContent = currentLines.join("\n").trim();
    if (!fullContent) {
      currentTitle = "";
      currentLines = [];
      return;
    }

    const tags = extractTags(fullContent);
    const confidence = extractMetadataField(fullContent, "Confidence");
    const agent = extractMetadataField(fullContent, "Agent");
    const added = extractMetadataField(fullContent, "Added");
    const milestone = extractMetadataField(fullContent, "Milestone");

    // Extract the main description (first non-metadata field or **Context** or **Choice**)
    const descMatch = fullContent.match(
      /\*\*(?:Context|Choice|What happened)\*\*:\s*(.+)/,
    );
    const description = descMatch ? descMatch[1]!.trim() : fullContent;

    const entry = buildEntry(
      currentTitle,
      description,
      category,
      tags,
      confidence,
      agent,
      added,
      isArchive,
      milestone,
    );

    if (entry) entries.push(entry);
    currentTitle = "";
    currentLines = [];
  };

  for (const line of lines) {
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      flushSubsection();
      currentTitle = h3Match[1]!.trim();
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }

  flushSubsection();
  return entries;
}

/**
 * Parse markdown table rows as entries.
 *
 * Handles the Decisions table format:
 *   | Decision | Context | Tags | Rationale | Date |
 *   | --- | --- | --- | --- | --- |
 *   | CLI installer over npm | Distribution model | [decisions, architecture] | ... | 2026-02-04 |
 *
 * @param content - Section content
 * @param category - Entry category
 * @param isArchive - Whether this is an archive section
 * @returns Parsed entries
 */
function parseTableEntries(
  content: string,
  category: MemoryCategory,
  isArchive: boolean,
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split("\n");

  // Find table header and determine column indices
  let headerLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes("|") && lines[i]!.includes("Decision")) {
      headerLine = i;
      break;
    }
  }

  if (headerLine < 0) return entries;

  // Parse table rows (skip header and separator)
  for (let i = headerLine + 2; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("|")) break;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 3) continue;

    const title = cells[0]!;
    const context = cells[1] ?? "";
    const tagsStr = cells[2] ?? "";
    const rationale = cells[3] ?? "";
    const date = cells[4] ?? "";

    const tags = extractTagsFromBrackets(tagsStr);

    const entry = buildEntry(
      title,
      `${context}. ${rationale}`.trim(),
      category,
      tags,
      undefined,
      undefined,
      date || undefined,
      isArchive,
    );

    if (entry) entries.push(entry);
  }

  return entries;
}

// ─── Metadata Extraction ──────────────────────────────────────────────────────

/**
 * Extract tags from content.
 *
 * Matches patterns like:
 *   Tags: [tag1, tag2, tag3]
 *   **Tags**: [tag1, tag2]
 *   **Tags:** [tag1, tag2]
 *   - **Tags**: [tag1, tag2]
 *
 * @param content - Content string to search
 * @returns Array of tag strings, or empty array if not found
 */
export function extractTags(content: string): string[] {
  // Match various Tags formats:
  // - Tags: [...]
  // - **Tags**: [...]
  // - **Tags:** [...]
  // - - **Tags**: [...]
  const match = content.match(
    /(?:^|\n)\s*(?:-\s+)?(?:\*\*)?Tags(?::?\*\*)?:?\s*\[([^\]]*)\]/m,
  );

  if (!match || !match[1]) return [];

  return match[1]
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Extract tags from a bracketed string like "[tag1, tag2]".
 *
 * @param text - Text containing bracketed tags
 * @returns Array of tag strings
 */
function extractTagsFromBrackets(text: string): string[] {
  const match = text.match(/\[([^\]]*)\]/);
  if (!match || !match[1]) return [];

  return match[1]
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Extract a metadata field value from entry content.
 *
 * Matches patterns like:
 *   - **Confidence**: High
 *   - **Agent**: executor
 *   **Added**: 2026-01-15
 *
 * @param content - Content string to search
 * @param fieldName - Name of the metadata field (e.g., "Confidence", "Agent")
 * @returns Trimmed field value, or undefined if not found
 */
export function extractMetadataField(
  content: string,
  fieldName: string,
): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:-\\s+)?\\*\\*${fieldName}\\*\\*:\\s*(.+)`,
    "m",
  );
  const match = content.match(pattern);
  return match?.[1]?.trim();
}

/**
 * Generate a deterministic ID from a title string and category.
 *
 * Lowercase, strip punctuation, replace spaces with dashes,
 * prefix with category initial. Truncated to 50 characters.
 *
 * @param title - Entry title
 * @param category - Entry category
 * @returns Deterministic ID string
 *
 * @example
 * ```typescript
 * generateEntryId("Zod safeParse at API boundaries", "pattern")
 * // => "p-zod-safeparse-at-api-boundaries"
 * ```
 */
export function generateEntryId(title: string, category: string): string {
  const prefixes: Record<string, string> = {
    pattern: "p",
    decision: "d",
    pitfall: "t",
    preference: "pref",
  };

  const prefix = prefixes[category] ?? "x";
  const slug = title
    .toLowerCase()
    .replace(/\[.*?\]\s*/g, "") // Remove [Phase N] markers
    .replace(/[^\w\s-]/g, "") // Remove punctuation
    .replace(/\s+/g, "-") // Spaces to dashes
    .replace(/-+/g, "-") // Collapse multiple dashes
    .replace(/^-|-$/g, "") // Trim leading/trailing dashes
    .slice(0, 50);

  return `${prefix}-${slug}`;
}

// ─── Entry Builder ────────────────────────────────────────────────────────────

/**
 * Build a validated MemoryEntry from extracted fields.
 *
 * Validates via memoryEntrySchema.safeParse(). Invalid entries
 * are logged as warnings and return null.
 *
 * @param title - Entry title
 * @param content - Entry content/description
 * @param category - Entry category
 * @param tags - Extracted tags
 * @param confidence - Extracted confidence string
 * @param agent - Extracted agent string
 * @param added - Extracted added date string
 * @param isArchive - Whether this is from an archive section
 * @param milestone - Milestone version string (e.g., "v1.5.0")
 * @returns Validated MemoryEntry or null if validation fails
 */
function buildEntry(
  title: string,
  content: string,
  category: MemoryCategory,
  tags: string[],
  confidence?: string,
  agent?: string,
  added?: string,
  isArchive: boolean = false,
  milestone?: string,
): MemoryEntry | null {
  if (!title.trim()) return null;

  const normalizedConfidence = normalizeConfidence(confidence, isArchive);
  const id = generateEntryId(title, category);
  const tokenEstimate = estimateTokens(content);

  const raw: Record<string, unknown> = {
    id,
    category,
    title: title.trim(),
    content: content.trim(),
    tags,
    agent: agent ?? "general",
    confidence: normalizedConfidence,
    added_at: added?.trim() || new Date().toISOString(),
    recall_count: 0,
    token_estimate: tokenEstimate,
  };

  if (milestone) {
    raw.milestone = milestone.trim();
  }

  const result = memoryEntrySchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      `Skipping invalid memory entry "${title}": ${result.error.message}`,
    );
    return null;
  }

  return result.data;
}

/**
 * Normalize a confidence string to one of the valid enum values.
 *
 * @param raw - Raw confidence string (e.g., "High", "MEDIUM", undefined)
 * @param isArchive - Whether the entry is from an archive section
 * @returns Normalized confidence value
 */
function normalizeConfidence(
  raw?: string,
  isArchive: boolean = false,
): "low" | "medium" | "high" {
  if (!raw) return isArchive ? "low" : "low";

  const lower = raw.toLowerCase().trim();
  if (lower === "high") return "high";
  if (lower === "medium") return "medium";
  return "low";
}

/**
 * CLI entry point for the memory parser.
 *
 * Usage:
 *   bun run src/memory/memory-parser.ts --file=.planning/MEMORY.md
 *
 * Outputs JSON array of parsed entries to stdout.
 *
 * @example
 * ```sh
 * bun run src/memory/memory-parser.ts --file=.planning/MEMORY.md
 * ```
 */
if (import.meta.main) {
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const filePath = fileArg?.split("=")[1] ?? ".planning/MEMORY.md";

  const result = await parseMemoryFile(filePath);

  if (result.success) {
    console.log(JSON.stringify(result.data, null, 2));
    process.exit(0);
  } else {
    console.error("Error:", result.error);
    process.exit(1);
  }
}
