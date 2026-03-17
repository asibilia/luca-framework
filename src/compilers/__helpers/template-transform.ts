/**
 * Branding transform functions for converting hardcoded framework references
 * to EJS template tags.
 *
 * Extracted from `scripts/copy-harness-templates.ts` to provide an importable
 * transform layer for downstream consumers (e.g., in-memory template
 * generation without file I/O).
 *
 * The three core transform functions (`transformBrandingContent`,
 * `transformBrandingFilename`, `transformBrandingDirname`) are exact copies
 * of the originals. The `transformOutputsToTemplates` wrapper is new,
 * providing a convenient Map-based API for batch transformation.
 */

import { basename, dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Strings that must NEVER be transformed, even though they contain "lu" or
 * "luca". Checked with simple string inclusion before regex replacement.
 *
 * The set is ordered longest-first so that longer exclusions are checked
 * before shorter ones (e.g., "luca-framework" before "luca-").
 */
export const CONTENT_EXCLUSIONS = [
  "luca-framework",
  "luca-bridge",
  "luca-state",
  "LUCA_MUNINN_VAULT",
  "luca init",
  "luca update",
  "luca doctor",
  "luca install",
  "lucarc",
  "rule-lu-workflow",
  "lu.skill.ts",
  "<%= ", // already templated
] as const;

/**
 * Source file path patterns that reference implementation files --
 * these should NOT have their lu- prefix transformed.
 *
 * Matches patterns like:
 *   lu-router.agent.ts
 *   lu-cognition.agent.ts
 *   lu.skill.ts
 */
export const SOURCE_FILE_PATTERN = /lu-[\w-]+\.(?:agent|skill|rule)\.ts/g;

// ---------------------------------------------------------------------------
// Core transform functions (extracted as-is from copy-harness-templates.ts)
// ---------------------------------------------------------------------------

/**
 * Transform branding references in file content from hardcoded values to
 * EJS template tags.
 *
 * The transformation is order-sensitive -- exclusions are protected first,
 * then replacements are applied from most specific to least specific.
 *
 * @param content - Raw file content to transform
 * @returns Object with transformed content and count of replacements made
 *
 * @example
 * ```typescript
 * const result = transformBrandingContent("name: lu-router\nYou are the Luca router.")
 * // result.content === "name: <%= branding.commandPrefix %>-router\nYou are the <%= branding.frameworkName %> router."
 * // result.replacements === 2
 * ```
 */
export const transformBrandingContent = (
  content: string,
): { content: string; replacements: number } => {
  let result = content;
  let replacements = 0;

  // Step 1: Protect exclusions by replacing them with placeholders
  const placeholders: Array<{ placeholder: string; original: string }> = [];

  // Protect source file references (lu-foo.agent.ts etc.)
  result = result.replace(SOURCE_FILE_PATTERN, (match) => {
    const ph = `__PLACEHOLDER_SRC_${placeholders.length}__`;
    placeholders.push({ placeholder: ph, original: match });
    return ph;
  });

  // Protect each content exclusion
  for (const exclusion of CONTENT_EXCLUSIONS) {
    let idx = result.indexOf(exclusion);
    while (idx !== -1) {
      const ph = `__PLACEHOLDER_EXC_${placeholders.length}__`;
      placeholders.push({ placeholder: ph, original: exclusion });
      result = result.slice(0, idx) + ph + result.slice(idx + exclusion.length);
      idx = result.indexOf(exclusion, idx + ph.length);
    }
  }

  // Step 2: Apply transformations (most specific first)

  // 2a: YAML frontmatter `name: lu-{agent}` -> `name: <%= branding.commandPrefix %>-{agent}`
  result = result.replace(/^(name:\s*)lu-/m, (match, prefix) => {
    replacements++;
    return `${prefix}<%= branding.commandPrefix %>-`;
  });

  // 2b: Skills directory path `.claude/skills/lu/` -> `.claude/skills/<%= branding.commandPrefix %>/`
  //     Also handles `skills/lu/SKILL.md` references etc.
  result = result.replace(/skills\/lu\//g, () => {
    replacements++;
    return "skills/<%= branding.commandPrefix %>/";
  });

  // 2c: Standalone skill name heading `# lu` at start of line
  //     Only matches `# lu` as the entire heading (not `# lu-router` etc.)
  result = result.replace(/^(#\s+)lu$/m, (_match, prefix) => {
    replacements++;
    return `${prefix}<%= branding.commandSlash %>`;
  });

  // 2d: Slash command `/lu` (word-boundary: /lu followed by space, backtick, quote, or end)
  //     Catches: `/lu`, `/lu `, "`/lu`"
  //     Does NOT catch: `/lu-router` (that's an agent reference, not slash command)
  result = result.replace(/\/lu(?=[\s`"'\]).,;:!?]|$)/g, () => {
    replacements++;
    return "/<%= branding.commandSlash %>";
  });

  // 2e: Agent name references `lu-{name}` -> `<%= branding.commandPrefix %>-{name}`
  //     Catches: lu-router, lu-cognition, lu-executor, lu-verifier, etc.
  //     Word boundary at start prevents matching inside other words
  result = result.replace(
    /(?<![a-zA-Z0-9_/])lu-([\w][\w-]*)/g,
    (_match, suffix) => {
      replacements++;
      return `<%= branding.commandPrefix %>-${suffix}`;
    },
  );

  // 2f: Path `.claude/luca/` -> `.claude/<%= branding.nameLowercase %>/`
  result = result.replace(/\.claude\/luca\//g, () => {
    replacements++;
    return ".claude/<%= branding.nameLowercase %>/";
  });

  // 2g: Brand name "Luca" (capitalized, as brand name in prose)
  //     Catches: "the Luca router", "Luca workflows", "Luca framework"
  //     Does NOT catch: "luca-framework" (lowercase, already protected)
  //     Uses word boundary to avoid matching inside other words
  result = result.replace(/(?<![a-zA-Z0-9_<%./-])Luca(?![a-zA-Z0-9_])/g, () => {
    replacements++;
    return "<%= branding.frameworkName %>";
  });

  // Step 3: Restore all placeholders
  for (const { placeholder, original } of placeholders) {
    // Use split+join instead of replaceAll to handle special regex chars
    result = result.split(placeholder).join(original);
  }

  return { content: result, replacements };
};

/**
 * Transform a filename from hardcoded branding to EJS template placeholder.
 *
 * Only transforms files with the `lu-` prefix. Non-lu files (e.g.,
 * code-architect.md) are returned unchanged.
 *
 * @param filename - Original filename (e.g., "lu-router.md")
 * @returns Transformed filename (e.g., "__branding.commandPrefix__-router.md")
 *
 * @example
 * ```typescript
 * transformBrandingFilename("lu-router.md")
 * // -> "__branding.commandPrefix__-router.md"
 *
 * transformBrandingFilename("code-architect.md")
 * // -> "code-architect.md"
 * ```
 */
export const transformBrandingFilename = (filename: string): string => {
  if (filename.startsWith("lu-")) {
    return `__branding.commandPrefix__-${filename.slice(3)}`;
  }
  return filename;
};

/**
 * Transform a directory name from hardcoded branding to EJS template placeholder.
 *
 * Only transforms the "lu" directory (the unified skill entry point).
 *
 * @param dirname - Original directory name (e.g., "lu")
 * @returns Transformed directory name (e.g., "__branding.commandPrefix__")
 */
export const transformBrandingDirname = (dirname: string): string => {
  if (dirname === "lu") {
    return "__branding.commandPrefix__";
  }
  return dirname;
};

// ---------------------------------------------------------------------------
// New wrapper function for batch Map-based transformation
// ---------------------------------------------------------------------------

/**
 * Transform a Map of compiled outputs into branded EJS templates.
 *
 * Applies filename, directory, and content branding transforms to every
 * entry in the input Map. Only `.md` file content is transformed; non-md
 * files pass through with their content unchanged (matching the behavior
 * of `scripts/copy-harness-templates.ts`).
 *
 * @param outputs - Map of filepath -> content pairs to transform
 * @returns A new Map with transformed keys (filepaths) and values (content)
 *
 * @example
 * ```typescript
 * const outputs = new Map([
 *   ["agents/lu-router.md", "name: lu-router\nYou are the Luca router."],
 *   ["skills/lu/SKILL.md", "# lu\nThe main Luca skill."],
 *   ["hooks/pre-commit.sh", "#!/bin/bash\nexit 0"],
 * ])
 *
 * const templates = transformOutputsToTemplates(outputs)
 * // Key transforms:
 * //   "agents/lu-router.md" -> "agents/__branding.commandPrefix__-router.md"
 * //   "skills/lu/SKILL.md"  -> "skills/__branding.commandPrefix__/SKILL.md"
 * //   "hooks/pre-commit.sh" -> "hooks/pre-commit.sh" (unchanged)
 * // Content transforms applied to .md files only
 * ```
 */
export const transformOutputsToTemplates = (
  outputs: Map<string, string>,
): Map<string, string> => {
  const result = new Map<string, string>();

  for (const [filepath, content] of outputs) {
    // Transform filename portion
    const dir = dirname(filepath);
    const file = basename(filepath);
    const transformedFile = transformBrandingFilename(file);

    // Transform directory segments
    const dirSegments = dir.split("/");
    const transformedSegments = dirSegments.map((segment) =>
      transformBrandingDirname(segment),
    );
    const transformedDir = transformedSegments.join("/");

    const transformedPath = join(transformedDir, transformedFile);

    // Transform content only for .md files (matching existing behavior)
    if (file.endsWith(".md")) {
      const { content: transformedContent } = transformBrandingContent(content);
      result.set(transformedPath, transformedContent);
    } else {
      result.set(transformedPath, content);
    }
  }

  return result;
};
