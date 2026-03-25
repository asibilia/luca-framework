#!/usr/bin/env bun
/**
 * Studio schema drift checker.
 *
 * Compares exported Zod schema field names in luca-studio's mirrored schemas
 * against their source-of-truth counterparts in luca-framework/src/. Detects
 * when a source schema adds, removes, or renames fields that the studio mirror
 * has not picked up yet.
 *
 * Usage:
 *   bun run check:studio-drift
 *
 * Exit codes:
 *   0 — no drift detected
 *   1 — drift detected (field mismatches found)
 *   2 — error reading or parsing a schema file
 */

import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

/** Resolve the monorepo root (two levels up from scripts/). */
const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

// ---------------------------------------------------------------------------
// Schema mapping: studio mirror -> source of truth
// ---------------------------------------------------------------------------

interface SchemaMapping {
  /** Display name for the pair. */
  label: string;
  /** Studio file path (relative to repo root). */
  studioFile: string;
  /** Regex to extract the schema's field names from the studio file. */
  studioPattern: RegExp;
  /** Source file path (relative to repo root). */
  sourceFile: string;
  /** Regex to extract the schema's field names from the source file. */
  sourcePattern: RegExp;
}

const SCHEMA_MAPPINGS: SchemaMapping[] = [
  {
    label: "LedgerEntrySchema",
    studioFile: "packages/luca-studio/lib/types.ts",
    studioPattern:
      /export const LedgerEntrySchema = z\.object\(\{([\s\S]*?)\}\)/,
    sourceFile: "packages/luca-framework/src/state/ledger.ts",
    sourcePattern:
      /export const ledgerEntrySchema = z\.object\(\{([\s\S]*?)\}\)/,
  },
  {
    label: "HarnessResultSnapshotSchema (studio) vs HarnessResultSchema (src)",
    studioFile: "packages/luca-studio/lib/types.ts",
    studioPattern:
      /export const HarnessResultSnapshotSchema = z\.object\(\{([\s\S]*?)\}\)/,
    sourceFile: "src/harness/__schemas/harness.schemas.ts",
    sourcePattern:
      /export const HarnessResultSchema = z\.object\(\{([\s\S]*?)\}\)/,
  },
  {
    label: "CheckResultSnapshotSchema (studio) vs CheckResultSchema (src)",
    studioFile: "packages/luca-studio/lib/types.ts",
    studioPattern:
      /export const CheckResultSnapshotSchema = z\.object\(\{([\s\S]*?)\}\)/,
    sourceFile: "src/harness/__schemas/harness.schemas.ts",
    sourcePattern:
      /export const CheckResultSchema = z\.object\(\{([\s\S]*?)\}\)/,
  },
  {
    label: "ParsedErrorSnapshotSchema (studio) vs ParsedErrorSchema (src)",
    studioFile: "packages/luca-studio/lib/types.ts",
    studioPattern:
      /export const ParsedErrorSnapshotSchema = z\.object\(\{([\s\S]*?)\}\)/,
    sourceFile: "src/harness/__schemas/harness.schemas.ts",
    sourcePattern:
      /export const ParsedErrorSchema = z\.object\(\{([\s\S]*?)\}\)/,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract top-level field names from a Zod z.object({...}) body string.
 *
 * Matches lines like `  field_name: z.string(),` and extracts `field_name`.
 */
function extractFieldNames(objectBody: string): string[] {
  const fieldPattern = /^\s*(\w+)\s*:/gm;
  const fields: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(objectBody)) !== null) {
    const fieldName = match[1];
    if (fieldName) {
      fields.push(fieldName);
    }
  }
  return fields;
}

/**
 * Read a file and extract field names using the given pattern.
 */
async function extractSchemaFields(
  filePath: string,
  pattern: RegExp,
): Promise<{ fields: string[]; error?: string }> {
  try {
    const absolutePath = join(REPO_ROOT, filePath);
    const file = Bun.file(absolutePath);
    const content = await file.text();
    const match = pattern.exec(content);
    if (!match?.[1]) {
      return {
        fields: [],
        error: `Pattern not found in ${filePath}`,
      };
    }
    return { fields: extractFieldNames(match[1]) };
  } catch (err) {
    return {
      fields: [],
      error: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let driftDetected = false;
let errorOccurred = false;

console.log("Studio Schema Drift Check");
console.log("=".repeat(60));

for (const mapping of SCHEMA_MAPPINGS) {
  console.log(`\n  ${mapping.label}`);

  const [studio, source] = await Promise.all([
    extractSchemaFields(mapping.studioFile, mapping.studioPattern),
    extractSchemaFields(mapping.sourceFile, mapping.sourcePattern),
  ]);

  if (studio.error) {
    console.log(`    ERROR: ${studio.error}`);
    errorOccurred = true;
    continue;
  }

  if (source.error) {
    console.log(`    ERROR: ${source.error}`);
    errorOccurred = true;
    continue;
  }

  const studioSet = new Set(studio.fields);
  const sourceSet = new Set(source.fields);

  // Note: studio uses snake_case, source may use camelCase.
  // We compare raw field names — if the naming convention differs,
  // that's intentional (documented in the coupling policy). We only
  // flag count mismatches and field names that have no plausible
  // camelCase/snake_case counterpart.

  const onlyInStudio = studio.fields.filter((f) => !sourceSet.has(f));
  const onlyInSource = source.fields.filter((f) => !studioSet.has(f));

  if (onlyInStudio.length === 0 && onlyInSource.length === 0) {
    console.log(`    OK (${studio.fields.length} fields match)`);
  } else {
    driftDetected = true;
    console.log(`    DRIFT DETECTED`);
    console.log(
      `    Studio fields (${studio.fields.length}): ${studio.fields.join(", ")}`,
    );
    console.log(
      `    Source fields (${source.fields.length}): ${source.fields.join(", ")}`,
    );
    if (onlyInStudio.length > 0) {
      console.log(`    Only in studio: ${onlyInStudio.join(", ")}`);
    }
    if (onlyInSource.length > 0) {
      console.log(`    Only in source: ${onlyInSource.join(", ")}`);
    }
    console.log(
      `    NOTE: Studio uses snake_case, source may use camelCase. Review manually.`,
    );
  }
}

console.log("\n" + "=".repeat(60));

if (errorOccurred) {
  console.log("RESULT: Errors occurred during schema parsing (exit 2)");
  process.exit(2);
} else if (driftDetected) {
  console.log("RESULT: Schema drift detected (exit 1)");
  process.exit(1);
} else {
  console.log("RESULT: No schema drift detected");
  process.exit(0);
}
