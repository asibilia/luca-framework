/**
 * Shared YAML frontmatter parser for Pi extensions.
 *
 * Provides functions to parse YAML frontmatter from .pi/agents/*.md files,
 * consolidating the duplicated parsers in luca-roles.ts (L35-59),
 * luca-teams.ts (L76-101), and luca-chain.ts (L45-56).
 *
 * Source: src/hooks/pi-extensions/__helpers/frontmatter.ts
 */

/**
 * Parsed frontmatter fields from a .pi/agents/*.md file.
 *
 * NOTE: This is the Pi runtime type, parsed from deployed .md files at runtime.
 * The build-time equivalent is `AgentFrontmatter` in `src/agents/__schemas/agent.schemas.ts`,
 * which uses Zod validation and includes additional fields (cognition, context, model_routing).
 * The two types serve different layers and are intentionally separate.
 */
export interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  model_tier?: string;
  background_spawnable?: boolean;
  purpose?: string;
  allowed_contexts?: string[];
}

/**
 * Parse YAML frontmatter from a Pi agent markdown file.
 *
 * Extracts the `---` fenced YAML block at the start of the file and
 * returns structured fields: name, description, model, and tools array.
 *
 * @param content - Full file content of a .pi/agents/*.md file
 * @returns Parsed frontmatter, or null if no valid frontmatter found
 *
 * @example
 * ```typescript
 * const content = `---
 * name: lu-executor
 * description: Executes plans
 * model: claude-sonnet-4-20250514
 * tools:
 *   - Read
 *   - Write
 *   - Bash
 * ---
 * Body content here.`;
 *
 * const fm = parseFrontmatter(content);
 * // { name: "lu-executor", description: "Executes plans", model: "claude-sonnet-4-20250514", tools: ["Read", "Write", "Bash"] }
 * ```
 */
/**
 * Parse a YAML list field from frontmatter content.
 *
 * Extracts a dash-list block for the given field name and returns
 * the items as a string array.
 *
 * @param fm - Raw frontmatter string (between --- delimiters)
 * @param fieldName - YAML field name to parse (e.g., "tools", "allowed_contexts")
 * @returns Array of parsed list items, or empty array if field missing
 */
export function parseYamlList(fm: string, fieldName: string): string[] {
  const listMatch = fm.match(
    new RegExp(`^${fieldName}:\\n((?:\\s+-\\s+.+\\n?)*)`, "m"),
  );
  if (!listMatch?.[1]) return [];
  return listMatch[1]
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.replace(/^\s*-\s+/, "").trim())
    .filter(Boolean);
}

export function parseFrontmatter(content: string): AgentFrontmatter | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch || !fmMatch[1]) return null;

  const fm: string = fmMatch[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const model = fm.match(/^model:\s*(.+)$/m)?.[1]?.trim();

  // Parse tools array (YAML list format)
  const tools = parseYamlList(fm, "tools");

  // Parse background_spawnable (boolean field)
  const bgMatch = fm.match(/^background_spawnable:\s*(.+)$/m)?.[1]?.trim();
  const background_spawnable =
    bgMatch === "true" ? true : bgMatch === "false" ? false : undefined;

  // Parse purpose (single string field)
  const purpose = fm.match(/^purpose:\s*(.+)$/m)?.[1]?.trim();

  // Parse allowed_contexts array (YAML list format)
  const allowed_contexts = parseYamlList(fm, "allowed_contexts");

  if (!name) return null;

  // Parse model_tier (single string field, e.g., "fast", "balanced", "capable")
  const model_tier = fm.match(/^model_tier:\s*(.+)$/m)?.[1]?.trim();

  const result: AgentFrontmatter = { name, description, tools, model };
  if (model_tier) result.model_tier = model_tier;
  if (background_spawnable != null)
    result.background_spawnable = background_spawnable;
  if (purpose) result.purpose = purpose;
  if (allowed_contexts.length > 0) result.allowed_contexts = allowed_contexts;
  return result;
}

/**
 * Extract a single field from YAML frontmatter.
 *
 * Lighter-weight alternative for extensions that only need one field
 * (e.g., chain only needs description).
 *
 * @param content - Full file content
 * @param field - Field name to extract (e.g., "description", "name")
 * @returns The field value, or null if not found
 *
 * @example
 * ```typescript
 * const desc = extractFrontmatterField(content, "description");
 * // "Executes plans"
 * ```
 */
export function extractFrontmatterField(
  content: string,
  field: string,
): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch || !fmMatch[1]) return null;

  const fm: string = fmMatch[1];
  const fieldMatch = fm.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return fieldMatch?.[1]?.trim() ?? null;
}
