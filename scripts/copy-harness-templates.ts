#!/usr/bin/env bun
/**
 * Copy compiled harness outputs to templates/harness/ for npm distribution.
 *
 * Copies the compiled Claude Code assets (.claude/) from the project root
 * into the package's templates/harness/ directory. This enables
 * `luca init --harness=claude` to scaffold from pre-built templates
 * without requiring the full monorepo build pipeline.
 *
 * During the copy, agent and skill files are transformed so that hardcoded
 * branding references (lu-, Luca, /lu) become EJS template tags. This lets
 * `luca init` with custom branding produce correctly branded output.
 *
 * Usage: bun run scripts/copy-harness-templates.ts
 */
import { cpSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Branding transformation helpers
// ---------------------------------------------------------------------------

/**
 * Strings that must NEVER be transformed, even though they contain "lu" or
 * "luca". Checked with simple string inclusion before regex replacement.
 *
 * The set is ordered longest-first so that longer exclusions are checked
 * before shorter ones (e.g., "luca-framework" before "luca-").
 */
const CONTENT_EXCLUSIONS = [
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
 * Source file path patterns that reference implementation files —
 * these should NOT have their lu- prefix transformed.
 *
 * Matches patterns like:
 *   lu-router.agent.ts
 *   lu-cognition.agent.ts
 *   lu.skill.ts
 */
const SOURCE_FILE_PATTERN = /lu-[\w-]+\.(?:agent|skill|rule)\.ts/g;

/**
 * Transform branding references in file content from hardcoded values to
 * EJS template tags.
 *
 * The transformation is order-sensitive — exclusions are protected first,
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
const transformBrandingContent = (
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

  // 2a: YAML frontmatter `name: lu-{agent}` → `name: <%= branding.commandPrefix %>-{agent}`
  result = result.replace(/^(name:\s*)lu-/m, (match, prefix) => {
    replacements++;
    return `${prefix}<%= branding.commandPrefix %>-`;
  });

  // 2b: Skills directory path `.claude/skills/lu/` → `.claude/skills/<%= branding.commandPrefix %>/`
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

  // 2e: Agent name references `lu-{name}` → `<%= branding.commandPrefix %>-{name}`
  //     Catches: lu-router, lu-cognition, lu-executor, lu-verifier, etc.
  //     Word boundary at start prevents matching inside other words
  result = result.replace(
    /(?<![a-zA-Z0-9_/])lu-([\w][\w-]*)/g,
    (_match, suffix) => {
      replacements++;
      return `<%= branding.commandPrefix %>-${suffix}`;
    },
  );

  // 2f: Path `.claude/luca/` → `.claude/<%= branding.nameLowercase %>/`
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
 * // → "__branding.commandPrefix__-router.md"
 *
 * transformBrandingFilename("code-architect.md")
 * // → "code-architect.md"
 * ```
 */
const transformBrandingFilename = (filename: string): string => {
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
const transformBrandingDirname = (dirname: string): string => {
  if (dirname === "lu") {
    return "__branding.commandPrefix__";
  }
  return dirname;
};

// ---------------------------------------------------------------------------
// Directory copy helpers (with branding transforms)
// ---------------------------------------------------------------------------

/**
 * Recursively copy a directory, applying branding transformations to .md files
 * and renaming lu-prefixed files/directories.
 *
 * @param srcDir - Source directory path
 * @param destDir - Destination directory path
 * @param stats - Mutable stats object for tracking transform counts
 */
const copyWithBrandingTransforms = async (
  srcDir: string,
  destDir: string,
  stats: {
    filesRenamed: number;
    contentTransforms: number;
    filesCopied: number;
  },
): Promise<void> => {
  mkdirSync(destDir, { recursive: true });

  const entries = readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);

    if (entry.isDirectory()) {
      const transformedName = transformBrandingDirname(entry.name);
      const destPath = join(destDir, transformedName);
      if (transformedName !== entry.name) {
        stats.filesRenamed++;
      }
      await copyWithBrandingTransforms(srcPath, destPath, stats);
    } else if (entry.isFile()) {
      const transformedName = transformBrandingFilename(entry.name);
      const destPath = join(destDir, transformedName);

      if (transformedName !== entry.name) {
        stats.filesRenamed++;
      }

      if (entry.name.endsWith(".md")) {
        // Read, transform content, and write
        const file = Bun.file(srcPath);
        const content = await file.text();
        const { content: transformed, replacements } =
          transformBrandingContent(content);
        stats.contentTransforms += replacements;
        await Bun.write(destPath, transformed);
      } else {
        // Non-markdown files: copy as-is using Bun.file
        const file = Bun.file(srcPath);
        await Bun.write(destPath, file);
      }
      stats.filesCopied++;
    }
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const projectRoot = resolve(import.meta.dir, "..");
const templatesDest = resolve(
  projectRoot,
  "packages",
  "luca-framework",
  "templates",
  "harness",
);

// Clean previous output to avoid stale files
if (existsSync(templatesDest)) {
  rmSync(templatesDest, { recursive: true, force: true });
}

mkdirSync(templatesDest, { recursive: true });

// Harness definitions: source dir, subdirectories to copy, extra files
// Directories in `brandedDirs` get branding transforms applied.
// Directories in `rawDirs` are copied as-is (no branding needed).
const harnesses = [
  {
    id: "claude",
    source: resolve(projectRoot, ".claude"),
    brandedDirs: ["agents", "skills"],
    rawDirs: ["rules", "hooks"],
    files: ["settings.json"],
  },
];

let totalCopied = 0;
const stats = { filesRenamed: 0, contentTransforms: 0, filesCopied: 0 };

for (const harness of harnesses) {
  if (!existsSync(harness.source)) {
    console.log(
      `Skipped ${harness.id}/ (source not found — run 'bun run build:all' first)`,
    );
    continue;
  }

  const dest = resolve(templatesDest, harness.id);
  mkdirSync(dest, { recursive: true });

  // Copy branded directories (agents, skills) with transforms
  for (const dir of harness.brandedDirs) {
    const src = resolve(harness.source, dir);
    const dirDest = resolve(dest, dir);
    if (existsSync(src)) {
      await copyWithBrandingTransforms(src, dirDest, stats);
      console.log(`  ${harness.id}/${dir}/ copied (with branding transforms)`);
      totalCopied++;
    }
  }

  // Copy raw directories (rules, hooks) as-is
  for (const dir of harness.rawDirs) {
    const src = resolve(harness.source, dir);
    const dirDest = resolve(dest, dir);
    if (existsSync(src)) {
      cpSync(src, dirDest, { recursive: true });
      console.log(`  ${harness.id}/${dir}/ copied`);
      totalCopied++;
    }
  }

  // Copy individual files
  for (const file of harness.files) {
    const src = resolve(harness.source, file);
    if (existsSync(src)) {
      const srcFile = Bun.file(src);
      await Bun.write(resolve(dest, file), srcFile);
      console.log(`  ${harness.id}/${file} copied`);
      totalCopied++;
    }
  }
}

console.log(
  `\nHarness templates ready: ${totalCopied} assets → templates/harness/`,
);
console.log(
  `  Branding: ${stats.filesRenamed} files/dirs renamed, ${stats.contentTransforms} content replacements across ${stats.filesCopied} files`,
);
