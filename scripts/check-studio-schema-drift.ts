#!/usr/bin/env bun
/**
 * Studio schema drift check.
 *
 * Compares field names between luca-framework source schemas and their
 * studio-local mirrors in packages/luca-studio/lib/types.ts.
 *
 * Reports any fields present in the source but missing from the mirror,
 * or vice versa.
 *
 * Usage:
 *   bun scripts/check-studio-schema-drift.ts
 *
 * Exit codes:
 *   0 - No drift detected
 *   1 - Drift detected (fields added/removed in source but not mirror)
 *
 * @module scripts/check-studio-schema-drift
 */

/**
 * Structural type for any Zod object schema regardless of version.
 *
 * Both Zod v3 and v4 expose a `.shape` record on ZodObject instances.
 * Using a structural type avoids cross-version incompatibility.
 */
interface ZodObjectLike {
  shape: Record<string, unknown>;
}

interface SchemaPair {
  name: string;
  source: ZodObjectLike;
  mirror: ZodObjectLike;
}

function getFieldNames(schema: ZodObjectLike): string[] {
  return Object.keys(schema.shape).sort();
}

function checkDrift(pair: SchemaPair): {
  name: string;
  sourceOnly: string[];
  mirrorOnly: string[];
} | null {
  const sourceFields = getFieldNames(pair.source);
  const mirrorFields = getFieldNames(pair.mirror);

  const sourceSet = new Set(sourceFields);
  const mirrorSet = new Set(mirrorFields);

  const sourceOnly = sourceFields.filter((f) => !mirrorSet.has(f));
  const mirrorOnly = mirrorFields.filter((f) => !sourceSet.has(f));

  if (sourceOnly.length === 0 && mirrorOnly.length === 0) return null;

  return { name: pair.name, sourceOnly, mirrorOnly };
}

async function main(): Promise<void> {
  const frameworkLedger =
    await import("../packages/luca-framework/src/state/ledger");
  const frameworkHarness =
    await import("../src/harness/__schemas/harness.schemas");
  const studioTypes = await import("../packages/luca-studio/lib/types");

  const pairs: SchemaPair[] = [
    {
      name: "LedgerEntry",
      source: frameworkLedger.ledgerEntrySchema,
      mirror: studioTypes.LedgerEntrySchema,
    },
    {
      name: "ParsedError -> ParsedErrorSnapshot",
      source: frameworkHarness.ParsedErrorSchema,
      mirror: studioTypes.ParsedErrorSnapshotSchema,
    },
    {
      name: "CheckResult -> CheckResultSnapshot",
      source: frameworkHarness.CheckResultSchema,
      mirror: studioTypes.CheckResultSnapshotSchema,
    },
    {
      name: "HarnessResult -> HarnessResultSnapshot",
      source: frameworkHarness.HarnessResultSchema,
      mirror: studioTypes.HarnessResultSnapshotSchema,
    },
  ];

  console.log("Studio Schema Drift Check");
  console.log("=========================\n");

  const drifts = pairs.map(checkDrift).filter(Boolean);

  if (drifts.length === 0) {
    console.log("No drift detected. All studio mirrors match source schemas.");
    process.exit(0);
  }

  console.log(`Drift detected in ${drifts.length} schema pair(s):\n`);

  for (const drift of drifts) {
    console.log(`  ${drift!.name}:`);
    if (drift!.sourceOnly.length > 0) {
      console.log(
        `    Source-only fields (missing from mirror): ${drift!.sourceOnly.join(", ")}`,
      );
    }
    if (drift!.mirrorOnly.length > 0) {
      console.log(
        `    Mirror-only fields (not in source): ${drift!.mirrorOnly.join(", ")}`,
      );
    }
    console.log();
  }

  console.log(
    "Fix: Update the studio-local mirrors in packages/luca-studio/lib/types.ts",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("Schema drift check failed:", err);
  process.exit(2);
});
