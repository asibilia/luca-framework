/**
 * resolve-templates.ts — Shared EJS resolution module for template deployment.
 *
 * Resolves EJS-style template tags (`<%= branding.X %>`) and filename
 * placeholders (`__branding.X__`) in template files. Used by:
 * - build-deploy.ts (templates/ -> .claude/ during dogfood build)
 * - luca init (templates/ -> target project during installation)
 *
 * @module resolve-templates
 */

import { readdir, stat } from "node:fs/promises";
import { join, basename } from "pathe";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Branding context for template resolution.
 *
 * Contains all values needed to resolve `<%= branding.X %>` tags
 * and `__branding.X__` filename placeholders.
 */
export interface BrandingContext {
  /** Display name for the framework (e.g., "Luca") */
  frameworkName: string;
  /** Command prefix for skills/agents (e.g., "lu") */
  commandPrefix: string;
  /** Slash command form (e.g., "/lu") */
  commandSlash: string;
  /** Lowercase framework name (e.g., "luca") */
  nameLowercase: string;
  /** Ticket regex pattern (e.g., "[A-Z]+-\\d+") */
  ticketPattern?: string;
  /** Placeholder ticket ID (e.g., "PROJ-0000") */
  placeholderTicket?: string;
  /** JSON-safe ticket pattern with escaped backslashes */
  ticketPatternJson?: string;
  /** Uppercase framework name (e.g., "LUCA") */
  nameUppercase?: string;
}

// ---------------------------------------------------------------------------
// Content resolution
// ---------------------------------------------------------------------------

/**
 * Resolve all `<%= branding.X %>` tags in content with branding values.
 *
 * Uses simple string replacement rather than a full EJS engine,
 * keeping the dependency footprint minimal.
 *
 * @param content - Template content with EJS tags
 * @param branding - Branding context values
 * @returns Resolved content string
 *
 * @example
 * ```typescript
 * const resolved = resolveContent(
 *   "You are the <%= branding.frameworkName %> router.",
 *   { frameworkName: "Luca", commandPrefix: "lu", commandSlash: "/lu", nameLowercase: "luca" }
 * )
 * // resolved === "You are the Luca router."
 * ```
 */
export const resolveContent = (
  content: string,
  branding: BrandingContext,
): string => {
  let result = content;

  // Replace all <%= branding.KEY %> patterns with the corresponding value
  result = result.replace(
    /<%=\s*branding\.(\w+)\s*%>/g,
    (_match, key: string) => {
      const value = branding[key as keyof BrandingContext];
      if (value === undefined) {
        console.warn(`Template warning: unknown branding key "${key}"`);
        return _match; // Leave unresolved tags intact
      }
      return String(value);
    },
  );

  return result;
};

// ---------------------------------------------------------------------------
// Filename resolution
// ---------------------------------------------------------------------------

/**
 * Resolve `__branding.X__` placeholders in a path segment.
 *
 * @param segment - A single path segment (filename or directory name)
 * @param branding - Branding context values
 * @returns Resolved path segment
 *
 * @example
 * ```typescript
 * resolvePathSegment("__branding.commandPrefix__-router.md", branding)
 * // -> "lu-router.md"
 *
 * resolvePathSegment("__branding.commandPrefix__", branding)
 * // -> "lu"
 * ```
 */
/** Allowlist of branding keys permitted in path segment placeholders. */
const ALLOWED_BRANDING_KEYS = new Set<string>([
  "frameworkName",
  "commandPrefix",
  "commandSlash",
  "nameLowercase",
  "nameUppercase",
  "ticketPattern",
  "placeholderTicket",
  "ticketPatternJson",
]);

export const resolvePathSegment = (
  segment: string,
  branding: BrandingContext,
): string => {
  return segment.replace(/__branding\.(\w+)__/g, (match, key: string) => {
    if (!ALLOWED_BRANDING_KEYS.has(key)) {
      console.warn(`Unknown branding key in path: ${key}`);
      return match; // leave unresolved
    }
    const value = branding[key as keyof BrandingContext];
    if (value === undefined) {
      console.warn(
        `Template warning: unknown branding key "${key}" in filename`,
      );
      return match;
    }
    return String(value);
  });
};

/**
 * Resolve all `__branding.X__` placeholders in a relative path.
 *
 * Processes each path segment independently so both directory and file
 * names are resolved.
 *
 * @param relPath - Relative path with potential placeholders
 * @param branding - Branding context values
 * @returns Resolved relative path
 */
export const resolveFilePath = (
  relPath: string,
  branding: BrandingContext,
): string => {
  const segments = relPath.split("/");
  const resolved = segments.map((seg) => resolvePathSegment(seg, branding));
  return resolved.join("/");
};

// ---------------------------------------------------------------------------
// Directory walker
// ---------------------------------------------------------------------------

/**
 * Recursively walk a directory and collect all files with their relative paths.
 *
 * @param dir - Absolute path to walk
 * @param prefix - Relative path prefix for the current directory
 * @returns Array of [relativePath, absolutePath] pairs
 *
 * @example
 * ```typescript
 * const files = await walkDir("/path/to/templates", "");
 * // files === [
 * //   ["agents/lu-router.md", "/path/to/templates/agents/lu-router.md"],
 * //   ["skills/lu/SKILL.md", "/path/to/templates/skills/lu/SKILL.md"],
 * // ]
 * ```
 */
const walkDir = async (
  dir: string,
  prefix: string,
): Promise<Array<[string, string]>> => {
  const results: Array<[string, string]> = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const absPath = join(dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    const entryStat = await stat(absPath);

    if (entryStat.isDirectory()) {
      const subResults = await walkDir(absPath, relPath);
      results.push(...subResults);
    } else if (entryStat.isFile()) {
      results.push([relPath, absPath]);
    }
  }

  return results;
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Resolve all templates in a directory using the given branding context.
 *
 * Walks the template directory recursively, resolving:
 * - `<%= branding.X %>` tags in `.md` and `.json` file content
 * - `__branding.X__` placeholders in file and directory names
 *
 * Non-md/json files (e.g., `.sh` scripts) have their paths resolved
 * but content is passed through unchanged.
 *
 * @param templateDir - Absolute path to the template directory to resolve
 * @param branding - Branding context for tag resolution
 * @returns Map of resolved relative paths to resolved content strings
 *
 * @example
 * ```typescript
 * const resolved = await resolveTemplates(
 *   "/path/to/templates/harness/claude",
 *   { frameworkName: "Luca", commandPrefix: "lu", commandSlash: "/lu", nameLowercase: "luca" }
 * )
 * // resolved.get("agents/lu-router.md") -> resolved agent content
 * // resolved.get("skills/lu/SKILL.md") -> resolved skill content
 * ```
 */
export const resolveTemplates = async (
  templateDir: string,
  branding: BrandingContext,
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  const files = await walkDir(templateDir, "");

  for (const [relPath, absPath] of files) {
    // Resolve path placeholders
    const resolvedPath = resolveFilePath(relPath, branding);

    // Read file content
    const file = Bun.file(absPath);
    const content = await file.text();

    // Resolve content for text-based files (.md and .json)
    const fileName = basename(relPath);
    if (fileName.endsWith(".md") || fileName.endsWith(".json")) {
      result.set(resolvedPath, resolveContent(content, branding));
    } else {
      // .sh and other files: pass content through unchanged
      result.set(resolvedPath, content);
    }
  }

  return result;
};
