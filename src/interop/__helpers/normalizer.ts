/**
 * Agent definition normalizer for the interop scanner.
 *
 * Takes raw file paths and content from various IDE tool directories
 * and normalizes them into a common InteropAgentSummary format. Handles
 * YAML frontmatter parsing, source tool detection from paths, and
 * capability extraction from markdown section headings.
 *
 * This module is T1 (Core) and imports only from its own domain schemas.
 *
 * @module
 */
import type {
  InteropAgentSummary,
  SourceTool,
} from "../__schemas/interop.schemas";
import { interopAgentSummarySchema } from "../__schemas/interop.schemas";

// ---------------------------------------------------------------------------
// Source tool detection
// ---------------------------------------------------------------------------

/**
 * Path-prefix-to-source-tool mapping.
 *
 * Order matters: more specific prefixes should come first to avoid
 * false matches (e.g., `.github/copilot` before `.github/`).
 */
const PATH_PREFIX_MAP: ReadonlyArray<{ prefix: string; tool: SourceTool }> = [
  { prefix: ".claude/", tool: "claude" },
  { prefix: ".cursor/", tool: "cursor" },
  { prefix: ".gemini/", tool: "gemini" },
  { prefix: ".codex/", tool: "codex" },
  { prefix: ".github/copilot", tool: "copilot" },
];

/**
 * Infer the source tool from a file's relative path.
 *
 * Checks known IDE directory prefixes against the file path. Falls back
 * to "other" for unrecognized paths.
 *
 * @param filePath - Project-relative file path (e.g., ".claude/agents/lu-router.md")
 * @returns The detected SourceTool enum value
 *
 * @example
 * ```typescript
 * detectSourceTool(".claude/agents/lu-router.md")   // "claude"
 * detectSourceTool(".cursor/agents/dx-advocate.md") // "cursor"
 * detectSourceTool("custom/agents/my-agent.md")     // "other"
 * ```
 */
export function detectSourceTool(filePath: string): SourceTool {
  const normalized = filePath.replace(/\\/g, "/");

  for (const { prefix, tool } of PATH_PREFIX_MAP) {
    if (normalized.startsWith(prefix) || normalized.includes(`/${prefix}`)) {
      return tool;
    }
  }

  return "other";
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from a markdown file's content.
 *
 * Parses the region between the opening and closing `---` delimiters.
 * Uses a simple key-value parser (no full YAML library dependency)
 * that handles string values, arrays (dash-prefixed), and nested objects
 * (indented keys). Returns an empty record if no frontmatter is found.
 *
 * @param content - Raw file content
 * @returns Parsed frontmatter as a flat key-value record
 *
 * @example
 * ```typescript
 * const fm = parseMarkdownFrontmatter("---\nname: lu-router\ndescription: Routes tasks\n---\n# Content")
 * // { name: "lu-router", description: "Routes tasks" }
 * ```
 */
export function parseMarkdownFrontmatter(
  content: string,
): Record<string, unknown> {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return {};

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) return {};

  const frontmatterBlock = trimmed.slice(3, endIndex).trim();
  if (!frontmatterBlock) return {};

  const result: Record<string, unknown> = {};
  const lines = frontmatterBlock.split("\n");

  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Array item (starts with "  - " or "    - ")
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey && currentArray) {
      const arrayValue = arrayMatch[1];
      if (arrayValue) {
        currentArray.push(arrayValue.trim());
      }
      continue;
    }

    // If we were collecting an array, save it
    if (currentArray && currentKey) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    // Top-level key: value
    const kvMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawValue = kvMatch[2]?.trim() ?? "";

      if (!key) continue;

      if (rawValue === "" || rawValue === "|" || rawValue === ">") {
        // Could be start of an array or multiline value
        currentKey = key;
        currentArray = [];
      } else {
        // Simple scalar value
        currentKey = key;
        currentArray = null;
        result[key] = rawValue;
      }
    }
  }

  // Flush any trailing array
  if (currentArray && currentKey) {
    result[currentKey] = currentArray;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Capability extraction
// ---------------------------------------------------------------------------

/**
 * Extract capabilities from markdown content section headings.
 *
 * Scans for `## heading` patterns in the markdown body (after frontmatter)
 * and returns the heading text as capability strings. Filters out generic
 * headings like "role", "description", and "instructions" that don't
 * represent distinct capabilities.
 *
 * @param content - Raw file content (may include frontmatter)
 * @returns Array of capability strings extracted from section headings
 *
 * @example
 * ```typescript
 * const caps = extractCapabilities("## role\nYou are...\n## code-review\nReviews code...")
 * // ["code-review"]  ("role" is filtered out)
 * ```
 */
export function extractCapabilities(content: string): string[] {
  const genericHeadings = new Set([
    "role",
    "description",
    "instructions",
    "overview",
    "configuration",
    "config",
    "setup",
    "notes",
    "references",
    "changelog",
  ]);

  const headingRegex = /^##\s+(.+)$/gm;
  const capabilities: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1]?.trim().toLowerCase();
    if (heading && !genericHeadings.has(heading)) {
      capabilities.push(heading);
    }
  }

  return capabilities;
}

// ---------------------------------------------------------------------------
// Agent normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a discovered agent file into an InteropAgentSummary.
 *
 * Combines source tool detection, frontmatter parsing, and capability
 * extraction to produce a normalized summary. The file path is used for
 * source tool detection and stored in the result. Name and description
 * are extracted from frontmatter when available, falling back to the
 * filename stem.
 *
 * @param filePath - Project-relative file path
 * @param content - Raw file content
 * @returns Normalized InteropAgentSummary
 *
 * @example
 * ```typescript
 * const summary = normalizeAgent(
 *   ".claude/agents/lu-router.md",
 *   "---\nname: lu-router\ndescription: Routes tasks\n---\n## role\nYou route tasks.\n## planning\nYou plan."
 * )
 * // {
 * //   name: "lu-router",
 * //   source_tool: "claude",
 * //   file_path: ".claude/agents/lu-router.md",
 * //   capabilities: ["planning"],
 * //   description: "Routes tasks",
 * //   model_preference: undefined,
 * // }
 * ```
 */
export function normalizeAgent(
  filePath: string,
  content: string,
): InteropAgentSummary {
  const sourceTool = detectSourceTool(filePath);
  const frontmatter = parseMarkdownFrontmatter(content);
  const capabilities = extractCapabilities(content);

  // Extract name: prefer frontmatter, fall back to filename stem
  const fmName =
    typeof frontmatter.name === "string" ? frontmatter.name : undefined;
  const filenameStem =
    filePath
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? "";
  const name = fmName || filenameStem;

  // Extract description from frontmatter
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description : "";

  // Extract model preference from frontmatter
  const modelPreference =
    typeof frontmatter.model === "string"
      ? frontmatter.model
      : typeof frontmatter.model_tier === "string"
        ? frontmatter.model_tier
        : undefined;

  const raw = {
    name,
    source_tool: sourceTool,
    file_path: filePath,
    capabilities,
    description,
    model_preference: modelPreference,
  };

  const parseResult = interopAgentSummarySchema.safeParse(raw);
  if (!parseResult.success) {
    console.error(
      `[interop/normalizer] Failed to parse agent summary for ${filePath}: ${parseResult.error.message}`,
    );
    // Attempt minimal fallback with safeParse (non-throwing)
    const fallbackResult = interopAgentSummarySchema.safeParse({
      name: name || "unknown",
      source_tool: sourceTool,
      file_path: filePath,
    });
    if (fallbackResult.success) return fallbackResult.data;
    // Hard minimum -- matches schema shape at definition time
    return {
      name: "unknown",
      source_tool: sourceTool,
      file_path: filePath,
      capabilities: [],
      description: "",
      model_preference: undefined,
    };
  }

  return parseResult.data;
}
