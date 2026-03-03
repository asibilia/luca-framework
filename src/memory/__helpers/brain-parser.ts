/**
 * Parse BRAIN.md into the brainSchema structure.
 *
 * Used as a fallback/migration path when brain.json doesn't exist
 * but BRAIN.md does. Extracts project identity fields from the
 * markdown structure.
 *
 * @module memory/brain-parser
 */
import { brainSchema } from "../__schemas/memory.schemas";

import type { Brain } from "../__schemas/memory.schemas";
import type { PersistResult } from "./json-persistence";

/** Default path for BRAIN.md */
const BRAIN_MD_PATH = ".planning/BRAIN.md";

/**
 * Extract a section's content from markdown by heading.
 *
 * Finds the first `## {heading}` and returns everything until the next
 * `## ` heading or end of file. Trims whitespace.
 */
function extractSection(markdown: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const match = pattern.exec(markdown);
  if (!match) return "";

  const start = match.index + match[0].length;
  const nextHeading = markdown.indexOf("\n## ", start);
  const end = nextHeading === -1 ? markdown.length : nextHeading;

  return markdown.slice(start, end).trim();
}

/**
 * Extract a key-value field from a markdown section.
 *
 * Matches patterns like `- **Key**: Value` or `**Key**: Value`.
 */
function extractField(section: string, field: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*-?\\s*\\*\\*${field}\\*\\*:\\s*(.+)`,
    "i",
  );
  const match = pattern.exec(section);
  return match?.[1]?.trim() ?? "";
}

/**
 * Parse BRAIN.md file into a Brain object.
 *
 * @param filePath - Path to BRAIN.md (default: ".planning/BRAIN.md")
 * @returns Parsed Brain data or error
 *
 * @example
 * ```typescript
 * const result = await parseBrainFile();
 * if (result.success) {
 *   console.log(result.data.project_name);
 * }
 * ```
 */
export async function parseBrainFile(
  filePath: string = BRAIN_MD_PATH,
): Promise<PersistResult<Brain>> {
  try {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return { success: false, error: `BRAIN.md not found: ${filePath}` };
    }

    const markdown = await file.text();
    if (!markdown.trim()) {
      return { success: false, error: `BRAIN.md is empty: ${filePath}` };
    }

    return parseBrainContent(markdown);
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse BRAIN.md: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Parse BRAIN.md content string into a Brain object.
 *
 * @param markdown - Raw markdown content
 * @returns Parsed Brain data or error
 */
export function parseBrainContent(markdown: string): PersistResult<Brain> {
  try {
    // Extract title line (first # heading)
    const titleMatch = /^#\s+(.+)/m.exec(markdown);
    const projectName = titleMatch?.[1]
      ? titleMatch[1].replace(/project\s+brain\s*[-–—]?\s*/i, "").trim() ||
        "Project"
      : "Project";

    // Extract sections
    const identitySection = extractSection(markdown, "Project Identity");
    const stackSection = extractSection(markdown, "Stack");
    const archSection = extractSection(markdown, "Architecture");
    const conventionsSection = extractSection(markdown, "Code Conventions");
    const prefsSection = extractSection(markdown, "Development Preferences");

    // Parse identity fields
    const domain = extractField(identitySection, "Domain");
    const purpose = extractField(identitySection, "Purpose");

    // Parse stack fields
    const language = extractField(stackSection, "Language") || "TypeScript";
    const framework = extractField(stackSection, "Framework");
    const build = extractField(stackSection, "Build");
    const testing = extractField(stackSection, "Testing") || "bun:test";
    const styling = extractField(stackSection, "Styling") || undefined;

    const raw: Record<string, unknown> = {
      project_name: projectName,
      domain,
      purpose,
      stack: { language, framework, build, testing, styling },
      architecture_patterns: archSection,
      code_conventions: conventionsSection,
      development_preferences: parsePreferences(prefsSection),
      updated_at: new Date().toISOString(),
    };

    const result = brainSchema.safeParse(raw);
    if (!result.success) {
      return {
        success: false,
        error: `Brain schema validation failed: ${result.error.message}`,
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse BRAIN.md content: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Parse development preferences section into a record.
 *
 * Matches `- **Key**: Value` lines.
 */
function parsePreferences(section: string): Record<string, string> {
  const prefs: Record<string, string> = {};
  const lines = section.split("\n");

  for (const line of lines) {
    const match = /^\s*-\s*\*\*(.+?)\*\*:\s*(.+)/.exec(line);
    if (match?.[1] && match[2]) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
      prefs[key] = match[2].trim();
    }
  }

  return prefs;
}
