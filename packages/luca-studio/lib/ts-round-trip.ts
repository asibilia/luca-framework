/**
 * TypeScript round-trip utilities for reading and writing entity files.
 *
 * Provides `extractConfigFromSource()` to parse `.agent.ts`, `.skill.ts`, and
 * `.rule.ts` source files into structured config objects, and
 * `generateEntitySource()` to serialize configs back to valid TypeScript with
 * zero-diff fidelity.
 *
 * The approach is source-text-preserving: on read, we split the source file into
 * a prefix (everything before the config object `{`), the raw config object text,
 * and a suffix (everything after the closing `};`). On write, we reassemble those
 * three segments. The config object text is preserved verbatim for unmodified
 * round-trips, while the structured parsed config is available for editing.
 *
 * @module ts-round-trip
 */
import { readFile, rename, writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported entity domain identifiers. */
export type EntityDomain = "agents" | "skills" | "rules";

/** Metadata extracted alongside the config from a source file. */
export interface EntityMetadata {
  /** camelCase variable name (e.g. "codeDeveloperConfig") */
  varName: string;
  /** The domain this entity belongs to */
  domain: EntityDomain;
  /** Raw import lines from the source file (preserves order and formatting) */
  imports: string[];
  /** Names of shared constants used in template-literal interpolation */
  sharedConstants: string[];
  /** The camelCase export variable name (e.g. "codeDeveloperAgent") */
  exportVarName: string;
  /** Factory function name ("createAgent" | "createSkill" | "createRule") */
  factoryFn: string;
  /** The config type annotation (e.g. "AgentConfig") */
  configType: string;
  /**
   * Exact text before the opening `{` of the config object.
   * Includes everything from the start of the file through
   * `const xConfig: XConfig = `.
   */
  prefix: string;
  /**
   * Exact text after the closing `};` of the config object.
   * Includes everything from the `;\n` through the end of the file.
   */
  suffix: string;
}

/** Successful extraction result. */
export interface ExtractionSuccess {
  success: true;
  /** The raw config object source text (from `{` through matching `}`) */
  rawConfigText: string;
  /** File metadata needed for the write path */
  metadata: EntityMetadata;
}

/** Failed extraction result. */
export interface ExtractionFailure {
  success: false;
  error: string;
}

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known shared constants that appear as ${CONSTANT_NAME} in template literals. */
const KNOWN_CONSTANTS = new Set([
  "COLD_ISOLATION_BLOCK",
  "RESEARCH_REVIEWER_COLD_ISOLATION",
  "RESEARCH_REVIEWER_SCORING",
  "RESEARCH_REVIEWER_OUTPUT_CONTRACT",
]);

/** Maps domain to factory function and type names. */
const DOMAIN_MAP = {
  agents: {
    factory: "createAgent",
    configType: "AgentConfig",
  },
  skills: {
    factory: "createSkill",
    configType: "SkillConfig",
  },
  rules: {
    factory: "createRule",
    configType: "RuleConfig",
  },
} as const;

// ---------------------------------------------------------------------------
// Read Path — extractConfigFromSource()
// ---------------------------------------------------------------------------

/**
 * Extract structured metadata and raw config text from a TypeScript entity source file.
 *
 * The source file is split into three segments:
 * 1. **Prefix**: Everything before the config object opening `{`
 * 2. **Raw config text**: The brace-balanced config object `{ ... }`
 * 3. **Suffix**: Everything after the closing `};`
 *
 * This three-segment approach guarantees zero-diff round-trip for any source
 * file, regardless of extra declarations, comments, or formatting between
 * standard segments.
 *
 * @param source - The full TypeScript source string
 * @param domain - The entity domain ("agents" | "skills" | "rules")
 * @returns An ExtractionResult with either the extracted segments or an error
 *
 * @example
 * ```typescript
 * const source = await readFile("src/agents/general/code-developer.agent.ts", "utf-8");
 * const result = extractConfigFromSource(source, "agents");
 * if (result.success) {
 *   console.log(result.metadata.varName); // "codeDeveloperConfig"
 *   console.log(result.rawConfigText);     // The exact config object source
 * }
 * ```
 */
export function extractConfigFromSource(
  source: string,
  domain: EntityDomain,
): ExtractionResult {
  try {
    const info = DOMAIN_MAP[domain];

    // 1. Find config variable declaration
    const configVarMatch = source.match(
      /const\s+(\w+)\s*:\s*(\w+Config)\s*=\s*\{/,
    );
    if (!configVarMatch) {
      return {
        success: false,
        error: "Could not find config variable declaration",
      };
    }
    const varName = configVarMatch[1]!;
    const configType = configVarMatch[2]!;

    // 2. Find the exact position of the opening brace
    const configDeclIdx = source.indexOf(configVarMatch[0]);
    const objectStartIdx = source.indexOf("{", configDeclIdx);

    // 3. Extract the full config object text via brace-depth counting
    const rawConfigBlock = extractBraceBalancedBlock(source, objectStartIdx);
    if (!rawConfigBlock) {
      return {
        success: false,
        error: "Could not extract config object (brace mismatch)",
      };
    }

    // 4. Split source into prefix / config / suffix
    const prefix = source.slice(0, objectStartIdx);
    const configEndIdx = objectStartIdx + rawConfigBlock.length;
    // suffix includes the `;` right after the closing `}` and everything after
    const suffix = source.slice(configEndIdx);

    // 5. Extract import lines (for informational metadata)
    const imports = extractImports(source);
    const sharedConstants = detectSharedConstants(imports);

    // 6. Extract export info (for informational metadata)
    const exportMatch = source
      .slice(configEndIdx)
      .match(/export\s+const\s+(\w+)\s*=\s*(\w+)\(/);
    const exportVarName = exportMatch?.[1] ?? "unknownExport";
    const factoryFn = exportMatch?.[2] ?? info.factory;

    const metadata: EntityMetadata = {
      varName,
      domain,
      imports,
      sharedConstants,
      exportVarName,
      factoryFn,
      configType,
      prefix,
      suffix,
    };

    return { success: true, rawConfigText: rawConfigBlock, metadata };
  } catch (err) {
    return {
      success: false,
      error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Write Path — generateEntitySource()
// ---------------------------------------------------------------------------

/**
 * Generate a complete TypeScript entity source file from extracted metadata
 * and raw config text.
 *
 * For unmodified round-trips, this simply concatenates prefix + config + suffix,
 * guaranteeing zero-diff. When the config is modified (e.g., by Luca Studio),
 * the prefix and suffix remain unchanged while the config text is replaced.
 *
 * @param rawConfigText - The raw config object text (including outer braces)
 * @param metadata - The file metadata from the read path
 * @returns The complete TypeScript source string
 *
 * @example
 * ```typescript
 * const result = extractConfigFromSource(source, "agents");
 * if (result.success) {
 *   const regenerated = generateEntitySource(result.rawConfigText, result.metadata);
 *   // regenerated === source (zero-diff for unmodified round-trip)
 * }
 * ```
 */
export function generateEntitySource(
  rawConfigText: string,
  metadata: EntityMetadata,
): string {
  return metadata.prefix + rawConfigText + metadata.suffix;
}

// ---------------------------------------------------------------------------
// File-level convenience API
// ---------------------------------------------------------------------------

/**
 * Detect entity domain from a file path.
 *
 * Determines domain from the file extension suffix:
 * - `.agent.ts` -> "agents"
 * - `.skill.ts` -> "skills"
 * - `.rule.ts` -> "rules"
 *
 * @param filePath - Path to the entity file
 * @returns The detected domain, or null if not an entity file
 *
 * @example
 * ```typescript
 * detectDomain("src/agents/general/code-developer.agent.ts") // "agents"
 * detectDomain("src/skills/luca/lu.skill.ts")                 // "skills"
 * detectDomain("src/rules/general/file-naming.rule.ts")       // "rules"
 * detectDomain("src/shared/format.ts")                        // null
 * ```
 */
export function detectDomain(filePath: string): EntityDomain | null {
  if (filePath.endsWith(".agent.ts")) return "agents";
  if (filePath.endsWith(".skill.ts")) return "skills";
  if (filePath.endsWith(".rule.ts")) return "rules";
  return null;
}

/**
 * Read an entity file from disk and extract its config and metadata.
 *
 * Combines file I/O with `extractConfigFromSource()` for convenience.
 * Domain is auto-detected from the file extension.
 *
 * @param filePath - Absolute or relative path to the entity file
 * @returns An ExtractionResult with either the extracted data or an error
 *
 * @example
 * ```typescript
 * const result = await readEntityFile("src/agents/general/code-developer.agent.ts");
 * if (result.success) {
 *   console.log(result.metadata.varName);
 * }
 * ```
 */
export async function readEntityFile(
  filePath: string,
): Promise<ExtractionResult> {
  const domain = detectDomain(filePath);
  if (!domain) {
    return {
      success: false,
      error: `Cannot detect domain from file path: ${filePath}`,
    };
  }

  const source = await readFile(filePath, "utf-8");
  return extractConfigFromSource(source, domain);
}

/**
 * Write an entity file to disk atomically.
 *
 * Generates the TypeScript source from the raw config text and metadata,
 * writes to a `.tmp` sibling file, then renames into place for atomicity.
 *
 * @param filePath - Absolute or relative path to write to
 * @param rawConfigText - The raw config object text
 * @param metadata - The entity metadata
 *
 * @example
 * ```typescript
 * const result = await readEntityFile(path);
 * if (result.success) {
 *   // Modify something...
 *   await writeEntityFile(path, result.rawConfigText, result.metadata);
 * }
 * ```
 */
export async function writeEntityFile(
  filePath: string,
  rawConfigText: string,
  metadata: EntityMetadata,
): Promise<void> {
  const source = generateEntitySource(rawConfigText, metadata);
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, source, "utf-8");
  await rename(tmpPath, filePath);
}

/**
 * Round-trip an entity file: read from disk, generate source, compare.
 *
 * Returns the diff status for verification. Does NOT write back to disk.
 *
 * @param filePath - Absolute or relative path to the entity file
 * @returns An object with the comparison result
 *
 * @example
 * ```typescript
 * const result = await roundTripEntityFile("src/agents/general/code-developer.agent.ts");
 * if (result.success && result.identical) {
 *   console.log("Zero-diff round trip!");
 * }
 * ```
 */
export async function roundTripEntityFile(filePath: string): Promise<{
  success: boolean;
  identical?: boolean;
  error?: string;
  diff?: string;
}> {
  const domain = detectDomain(filePath);
  if (!domain) {
    return { success: false, error: `Cannot detect domain: ${filePath}` };
  }

  const originalSource = await readFile(filePath, "utf-8");
  const result = extractConfigFromSource(originalSource, domain);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const regenerated = generateEntitySource(
    result.rawConfigText,
    result.metadata,
  );

  if (originalSource === regenerated) {
    return { success: true, identical: true };
  }

  // Find the first difference for debugging
  const diff = findFirstDiff(originalSource, regenerated);
  return { success: true, identical: false, diff };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract all import lines from source, preserving their exact text.
 *
 * Handles multi-line imports like:
 * ```
 * import {
 *   FOO,
 *   BAR,
 * } from "~/path";
 * ```
 */
function extractImports(source: string): string[] {
  const lines = source.split("\n");
  const importLines: string[] = [];
  let collecting = false;
  let inMultiLineImport = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    const trimmed = line.trim();

    // Skip JSDoc comment block at the top
    if (!collecting && trimmed.startsWith("/**")) {
      while (idx < lines.length && !lines[idx]!.includes("*/")) {
        idx++;
      }
      continue;
    }

    // Inside a multi-line import: collect everything until the closing semicolon
    if (inMultiLineImport) {
      importLines.push(line);
      if (trimmed.endsWith(";")) {
        inMultiLineImport = false;
      }
      continue;
    }

    // Detect import start
    if (trimmed.startsWith("import ") || trimmed.startsWith("import{")) {
      collecting = true;
      importLines.push(line);

      // Check if import is complete on one line
      if (trimmed.endsWith(";")) {
        continue;
      }
      // Multi-line import: keep collecting until semicolon
      inMultiLineImport = true;
      continue;
    }

    if (collecting) {
      // Blank line between import groups (only keep if more imports follow)
      if (trimmed === "") {
        let hasMoreImports = false;
        for (let j = idx + 1; j < lines.length; j++) {
          const nextTrimmed = lines[j]!.trim();
          if (nextTrimmed === "") continue;
          if (
            nextTrimmed.startsWith("import ") ||
            nextTrimmed.startsWith("import{")
          ) {
            hasMoreImports = true;
          }
          break;
        }
        if (hasMoreImports) {
          importLines.push(line);
          continue;
        }
      }

      // End of import block
      break;
    }
  }

  return importLines;
}

/**
 * Detect which known shared constants are referenced in the import lines.
 */
function detectSharedConstants(imports: string[]): string[] {
  const found: string[] = [];
  const importText = imports.join("\n");
  for (const name of KNOWN_CONSTANTS) {
    if (importText.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Extract a brace-balanced block starting at the given index.
 * Returns the text from `{` through the matching `}` (inclusive).
 *
 * Correctly handles:
 * - Nested braces in object literals
 * - Template literal interpolation `${...}` inside backtick strings
 * - Escaped characters in strings
 * - Line and block comments
 */
function extractBraceBalancedBlock(
  source: string,
  startIdx: number,
): string | null {
  if (source[startIdx] !== "{") return null;

  let depth = 0;
  let inString: false | '"' | "'" | "`" = false;
  let escaped = false;
  const templateStack: number[] = [];

  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) {
        escaped = true;
      }
      continue;
    }

    if (inString === "`") {
      if (ch === "`") {
        inString = false;
        continue;
      }
      if (ch === "$" && i + 1 < source.length && source[i + 1] === "{") {
        templateStack.push(depth);
        depth++;
        i++;
        inString = false;
        continue;
      }
      continue;
    }

    if (inString === '"' || inString === "'") {
      if (ch === inString) {
        inString = false;
      }
      continue;
    }

    // Normal code
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "`") {
      inString = "`";
      continue;
    }

    // Line comment
    if (ch === "/" && i + 1 < source.length && source[i + 1] === "/") {
      const nlIdx = source.indexOf("\n", i);
      i = nlIdx === -1 ? source.length : nlIdx;
      continue;
    }

    // Block comment
    if (ch === "/" && i + 1 < source.length && source[i + 1] === "*") {
      const endIdx = source.indexOf("*/", i + 2);
      i = endIdx === -1 ? source.length : endIdx + 1;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;

      if (
        templateStack.length > 0 &&
        depth === templateStack[templateStack.length - 1]!
      ) {
        templateStack.pop();
        inString = "`";
        continue;
      }

      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

/**
 * Find the first character difference between two strings.
 * Returns a human-readable description for debugging.
 */
function findFirstDiff(a: string, b: string): string {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) {
      const context = 40;
      const start = Math.max(0, i - context);
      const aSlice = a.slice(start, i + context);
      const bSlice = b.slice(start, i + context);
      const charA = a[i] ? `'${a[i]}' (${a.charCodeAt(i)})` : "EOF";
      const charB = b[i] ? `'${b[i]}' (${b.charCodeAt(i)})` : "EOF";
      return (
        `First diff at position ${i}: original=${charA}, generated=${charB}\n` +
        `  original context: ...${JSON.stringify(aSlice)}...\n` +
        `  generated context: ...${JSON.stringify(bSlice)}...`
      );
    }
  }
  return "No diff found (strings are identical)";
}
