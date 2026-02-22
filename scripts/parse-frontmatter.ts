#!/usr/bin/env bun

/**
 * Shared frontmatter parsing utility for generate-*-from-cursor scripts.
 *
 * Extracts YAML-like frontmatter from markdown files and coerces
 * values to appropriate JavaScript types (boolean, number, array, string).
 *
 * @module scripts/parse-frontmatter
 */

/**
 * Result of parsing a markdown file with optional frontmatter.
 */
export interface ParsedFrontmatter {
  /** Parsed key-value pairs from the frontmatter block */
  frontmatter: Record<string, any>;
  /** Content after the frontmatter block (trimmed) */
  content: string;
}

/**
 * Options for frontmatter extraction behavior.
 */
export interface ParseFrontmatterOptions {
  /**
   * When true, if no frontmatter block is found, attempt to extract
   * a description from the first markdown heading or first 100 chars.
   * When false (default), throw an error if no frontmatter is found.
   */
  fallbackDescription?: boolean;
}

/**
 * Parse YAML-like frontmatter from a markdown string.
 *
 * Extracts the `---` delimited frontmatter block and coerces values:
 * - `[a, b, c]` -> string array
 * - `"quoted"` -> unquoted string
 * - `true` / `false` -> boolean
 * - Numeric strings -> number
 * - Everything else -> string
 *
 * @param content - Raw markdown content with optional frontmatter
 * @param options - Parsing options (e.g., fallbackDescription)
 * @returns Parsed frontmatter key-value pairs and remaining content
 * @throws Error if no frontmatter found and fallbackDescription is false
 *
 * @example
 * ```typescript
 * const raw = await Bun.file("rule.mdc").text();
 * const { frontmatter, content } = parseFrontmatter(raw);
 * console.log(frontmatter.description); // "My rule"
 * console.log(frontmatter.alwaysApply); // true (boolean)
 * ```
 */
export function parseFrontmatter(
  content: string,
  options: ParseFrontmatterOptions = {},
): ParsedFrontmatter {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    if (options.fallbackDescription) {
      return extractFallbackDescription(content);
    }
    throw new Error("No frontmatter found");
  }

  const frontmatterBlock = frontmatterMatch[1]!;
  const parsedFrontmatter = parseFrontmatterBlock(frontmatterBlock);
  const contentWithoutFrontmatter = content
    .substring(frontmatterMatch[0].length)
    .trim();

  return {
    frontmatter: parsedFrontmatter,
    content: contentWithoutFrontmatter,
  };
}

/**
 * Parse the inner content of a frontmatter block into key-value pairs.
 *
 * @param block - The raw text between --- delimiters
 * @returns Record of parsed key-value pairs with type coercion
 */
function parseFrontmatterBlock(block: string): Record<string, any> {
  const parsed: Record<string, any> = {};

  for (const line of block.split("\n")) {
    if (!line.trim()) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();

    parsed[key] = coerceValue(rawValue);
  }

  return parsed;
}

/**
 * Coerce a raw frontmatter string value to an appropriate JS type.
 *
 * @param rawValue - The raw string value from frontmatter
 * @returns Coerced value (boolean, number, string[], or string)
 */
function coerceValue(rawValue: string): any {
  // Array: [a, b, c]
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    return rawValue
      .slice(1, -1)
      .split(",")
      .map((v) => v.trim().replace(/"/g, "").replace(/'/g, ""));
  }

  // Quoted string: "value"
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1);
  }

  // Boolean
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;

  // Number
  if (!isNaN(Number(rawValue))) return Number(rawValue);

  // Plain string
  return rawValue;
}

/**
 * Extract a fallback description when no frontmatter block exists.
 *
 * Looks for the first markdown heading, or falls back to the first
 * 100 characters of the content. Used by generate-rules-from-cursor.ts
 * for .mdc files that lack a formal frontmatter block.
 *
 * @param content - Raw markdown content without frontmatter
 * @returns ParsedFrontmatter with description in frontmatter and full content
 */
function extractFallbackDescription(content: string): ParsedFrontmatter {
  let description = "";

  for (const line of content.split("\n")) {
    if (line.startsWith("# ")) {
      description = line.substring(2).trim();
      break;
    }
  }

  if (!description) {
    description = content.substring(0, 100).replace(/\n/g, " ").trim();
  }

  return {
    frontmatter: { description },
    content,
  };
}
