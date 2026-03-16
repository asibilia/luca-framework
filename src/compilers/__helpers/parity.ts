/**
 * Cross-format verification parity checker (R10).
 *
 * Compares entity counts and content across compilation outputs
 * (Claude, Plugin) to ensure all formats are in sync.
 *
 * Pure functions that operate on the output map produced by
 * `generateAllOutputs()` in `scripts/build-shared.ts`.
 *
 * @module
 */
import type {
  ParityEntityType,
  ParityFormat,
  FormatCount,
  ContentParityCheck,
  ParityReport,
} from "../__schemas/compilers.schemas";

/**
 * Path patterns for extracting entity name from output map keys.
 *
 * Each format has regex patterns per entity type. A captured group (1)
 * yields the entity name.
 */
const FORMAT_PATTERNS: Record<
  string,
  Partial<Record<ParityEntityType, RegExp>>
> = {
  claude: {
    agent: /^\.claude\/agents\/(.+)\.md$/,
    skill: /^\.claude\/skills\/(.+)\/SKILL\.md$/,
    rule: /^\.claude\/rules\/(.+)\.md$/,
  },
  plugin: {
    agent: /^dist\/plugin\/agents\/(.+)\.md$/,
    skill: /^dist\/plugin\/skills\/(.+)\/SKILL\.md$/,
    // Plugin does not have individual rule files
  },
};

/**
 * Which formats support which entity types.
 *
 * Only formats listed here are checked for parity of a given entity type.
 * Pi and Plugin do not compile individual rule files.
 */
const FORMAT_ENTITY_SUPPORT: Record<ParityEntityType, ParityFormat[]> = {
  agent: ["claude", "plugin"],
  skill: ["claude", "plugin"],
  rule: ["claude"],
};

/**
 * Parse the output map to extract entities grouped by type and format.
 *
 * @param outputs - Map of relative file paths to content strings
 * @returns Nested map: entity_type → format → Set<entity_name>
 */
function parseOutputMap(
  outputs: Map<string, string>,
): Map<ParityEntityType, Map<ParityFormat, Set<string>>> {
  const result = new Map<ParityEntityType, Map<ParityFormat, Set<string>>>();

  for (const entityType of ["agent", "skill", "rule"] as ParityEntityType[]) {
    result.set(entityType, new Map());
    for (const format of FORMAT_ENTITY_SUPPORT[entityType]) {
      result.get(entityType)!.set(format, new Set());
    }
  }

  for (const key of outputs.keys()) {
    for (const [format, patterns] of Object.entries(FORMAT_PATTERNS)) {
      for (const [entityType, regex] of Object.entries(patterns)) {
        if (!regex) continue;
        const match = key.match(regex);
        if (match?.[1]) {
          const typeMap = result.get(entityType as ParityEntityType);
          const formatSet = typeMap?.get(format as ParityFormat);
          if (formatSet) {
            formatSet.add(match[1]);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Check entity count parity across all compilation formats.
 *
 * For each entity type, counts entities per supported format and flags
 * mismatches where format counts diverge.
 *
 * @param outputs - Map of relative file paths to content strings (from generateAllOutputs)
 * @returns Array of format count checks, one per entity type
 */
export function checkFormatParity(outputs: Map<string, string>): FormatCount[] {
  const parsed = parseOutputMap(outputs);
  const results: FormatCount[] = [];

  for (const entityType of ["agent", "skill", "rule"] as ParityEntityType[]) {
    const typeMap = parsed.get(entityType)!;
    const formatCounts: Record<string, number> = {};
    const supportedFormats = FORMAT_ENTITY_SUPPORT[entityType];

    for (const format of supportedFormats) {
      formatCounts[format] = typeMap.get(format)?.size ?? 0;
    }

    const counts = Object.values(formatCounts);
    const allEqual = counts.length > 0 && counts.every((c) => c === counts[0]);

    const mismatches: string[] = [];
    if (!allEqual && counts.length > 1) {
      const maxCount = Math.max(...counts);
      for (const [format, count] of Object.entries(formatCounts)) {
        if (count !== maxCount) {
          mismatches.push(
            `${format} has ${count} ${entityType}s (expected ${maxCount})`,
          );
        }
      }
    }

    results.push({
      entity_type: entityType,
      format_counts: formatCounts,
      is_parity: allEqual,
      mismatches,
    });
  }

  return results;
}

/**
 * Check content parity: verify each entity is present in all expected formats.
 *
 * Collects all entity names across formats and verifies each appears in every
 * format that supports that entity type.
 *
 * @param outputs - Map of relative file paths to content strings (from generateAllOutputs)
 * @returns Array of content parity checks, one per entity
 */
export function checkContentParity(
  outputs: Map<string, string>,
): ContentParityCheck[] {
  const parsed = parseOutputMap(outputs);
  const results: ContentParityCheck[] = [];

  for (const entityType of ["agent", "skill", "rule"] as ParityEntityType[]) {
    const typeMap = parsed.get(entityType)!;
    const supportedFormats = FORMAT_ENTITY_SUPPORT[entityType];

    // Collect all entity names from all formats
    const allNames = new Set<string>();
    for (const format of supportedFormats) {
      const names = typeMap.get(format);
      if (names) {
        for (const name of names) allNames.add(name);
      }
    }

    for (const name of allNames) {
      const present: ParityFormat[] = [];
      const missing: ParityFormat[] = [];

      for (const format of supportedFormats) {
        if (typeMap.get(format)?.has(name)) {
          present.push(format);
        } else {
          missing.push(format);
        }
      }

      results.push({
        entity_name: name,
        entity_type: entityType,
        formats_present: present,
        formats_missing: missing,
        is_parity: missing.length === 0,
      });
    }
  }

  return results;
}

/**
 * Generate a full parity report from compilation outputs.
 *
 * Combines format count parity and content parity checks into
 * a single report with an overall pass/fail and human-readable summary.
 *
 * @param outputs - Map of relative file paths to content strings (from generateAllOutputs)
 * @returns Complete parity report
 */
export function generateParityReport(
  outputs: Map<string, string>,
): ParityReport {
  const formatParity = checkFormatParity(outputs);
  const contentParity = checkContentParity(outputs);

  const formatOk = formatParity.every((fc) => fc.is_parity);
  const contentOk = contentParity.every((cp) => cp.is_parity);
  const overallParity = formatOk && contentOk;

  const formatMismatches = formatParity
    .filter((fc) => !fc.is_parity)
    .flatMap((fc) => fc.mismatches);
  const contentMissing = contentParity
    .filter((cp) => !cp.is_parity)
    .map(
      (cp) =>
        `${cp.entity_name} (${cp.entity_type}) missing from: ${cp.formats_missing.join(", ")}`,
    );

  const issues = [...formatMismatches, ...contentMissing];
  const summary = overallParity
    ? `All ${contentParity.length} entities have parity across formats.`
    : `Parity check failed: ${issues.length} issue(s) found.\n${issues.map((i) => `  - ${i}`).join("\n")}`;

  return {
    timestamp: new Date().toISOString(),
    format_parity: formatParity,
    content_parity: contentParity,
    overall_parity: overallParity,
    summary,
  };
}
