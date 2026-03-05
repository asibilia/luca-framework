---
id: "02"
title: "Fix Cross-Subdirectory __helpers/ Import and Add Observer Schema Drift Check"
phase: 116
wave: 1
depends_on: []
---

# PLAN-116-B: Fix Cross-Subdirectory \_\_helpers/ Import and Add Observer Schema Drift Check

## Objective

Fix a module boundary violation in `config-generators.ts` that imports directly from another subdirectory's `__helpers/`, and create an automated drift check script for observer-local schema mirrors in `packages/luca-observer/lib/types.ts`.

Source: `.planning/v2.7.0-MILESTONE-AUDIT.md` -- HIGH #6 (cross-domain import), MEDIUM (schema drift risk).

## Context

@file src/hooks/**helpers/config-generators.ts -- Line 24 imports `sanitizeForTemplate` and `validateScriptPath` from `../pi-extensions/**helpers/sanitize`, violating the `\_\_helpers/` encapsulation rule (Rule 4 in module-boundary.md).

@file src/hooks/pi-extensions/**helpers/sanitize.ts -- Contains the functions being imported. Already exported from the pi-extensions `**helpers/index.ts` barrel.

@file src/hooks/pi-extensions/\_\_helpers/index.ts -- Already re-exports `sanitizeForTemplate` and `validateScriptPath` from `./sanitize` (lines 34-43).

@file packages/luca-observer/lib/types.ts -- Contains ~20 observer-local mirrors of luca-framework schemas with manual "Update this schema when the source schema changes" comments. No automated sync mechanism exists.

@file packages/luca-framework/src/state/ledger.ts -- Source for `ledgerEntrySchema` (mirrored as `LedgerEntrySchema` in observer types).

@file packages/luca-framework/src/harness/\_\_schemas/harness.schemas.ts -- Source for harness check schemas (mirrored as snapshot schemas in observer types).

## Tasks

### Task 1: Fix cross-subdirectory \_\_helpers/ import in config-generators.ts

**Goal:** Replace the direct import from `../pi-extensions/__helpers/sanitize` with an import from the pi-extensions `__helpers/` barrel `../pi-extensions/__helpers`.

**File:** `src/hooks/__helpers/config-generators.ts`

**Current (lines 23-26):**

```typescript
import {
  sanitizeForTemplate,
  validateScriptPath,
} from "../pi-extensions/__helpers/sanitize";
```

**Target:**

```typescript
import {
  sanitizeForTemplate,
  validateScriptPath,
} from "../pi-extensions/__helpers";
```

**Rationale:** The pi-extensions `__helpers/index.ts` already re-exports both functions (lines 34-43). Importing from the barrel instead of the direct file resolves the module boundary violation while still staying within the hooks domain (both `__helpers/` and `pi-extensions/` are subdirectories of `src/hooks/`).

Note: This is a same-domain import (hooks -> hooks), so it does not violate the cross-domain **helpers/ rule (Rule 4). The issue was importing from a *sister subdirectory's* `**helpers/` implementation file rather than its barrel. The barrel import is the correct pattern.

**Verification:** `grep -n "pi-extensions/__helpers/sanitize" src/hooks/__helpers/config-generators.ts` returns no matches. The import now uses the barrel path.

### Task 2: Create the observer schema drift check script

**Goal:** Create `scripts/check-observer-schema-drift.ts` that compares field names between source schemas in `luca-framework` and their observer-local mirrors in `luca-observer/lib/types.ts`.

**File:** `scripts/check-observer-schema-drift.ts` (NEW)

**Target content:**

```typescript
#!/usr/bin/env bun
/**
 * Observer schema drift check.
 *
 * Compares field names between luca-framework source schemas and their
 * observer-local mirrors in packages/luca-observer/lib/types.ts.
 *
 * Reports any fields present in the source but missing from the mirror,
 * or vice versa.
 *
 * Usage:
 *   bun scripts/check-observer-schema-drift.ts
 *
 * Exit codes:
 *   0 - No drift detected
 *   1 - Drift detected (fields added/removed in source but not mirror)
 *
 * @module scripts/check-observer-schema-drift
 */

import { z } from "zod";

// ─── Schema Pair Definitions ─────────────────────────────────────────────────

/**
 * Defines a pair of source + mirror schemas to compare.
 *
 * Each entry maps a source schema from luca-framework to its
 * observer-local mirror in luca-observer/lib/types.ts.
 */
interface SchemaPair {
  /** Human-readable name for reporting */
  name: string;
  /** Source schema (from luca-framework) */
  source: z.ZodObject<z.ZodRawShape>;
  /** Mirror schema (from luca-observer) */
  mirror: z.ZodObject<z.ZodRawShape>;
}

/**
 * Extract field names from a Zod object schema.
 *
 * @param schema - A Zod object schema
 * @returns Sorted array of field name strings
 */
function getFieldNames(schema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.keys(schema.shape).sort();
}

/**
 * Compare two schemas and report field drift.
 *
 * @param pair - The schema pair to compare
 * @returns Object with drift details, or null if no drift
 */
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Dynamic imports to avoid static cross-package dependency issues
  const frameworkLedger =
    await import("../packages/luca-framework/src/state/ledger");
  const frameworkHarness =
    await import("../packages/luca-framework/src/harness/__schemas/harness.schemas");
  const observerTypes = await import("../packages/luca-observer/lib/types");

  const pairs: SchemaPair[] = [
    {
      name: "LedgerEntry",
      source: frameworkLedger.ledgerEntrySchema,
      mirror: observerTypes.LedgerEntrySchema,
    },
    {
      name: "ParsedError -> ParsedErrorSnapshot",
      source: frameworkHarness.parsedErrorSchema,
      mirror: observerTypes.ParsedErrorSnapshotSchema,
    },
    {
      name: "CheckResult -> CheckResultSnapshot",
      source: frameworkHarness.checkResultSchema,
      mirror: observerTypes.CheckResultSnapshotSchema,
    },
    {
      name: "HarnessResult -> HarnessResultSnapshot",
      source: frameworkHarness.HarnessResultSchema,
      mirror: observerTypes.HarnessResultSnapshotSchema,
    },
  ];

  console.log("Observer Schema Drift Check");
  console.log("===========================\n");

  const drifts = pairs.map(checkDrift).filter(Boolean);

  if (drifts.length === 0) {
    console.log(
      "No drift detected. All observer mirrors match source schemas.",
    );
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
    "Fix: Update the observer-local mirrors in packages/luca-observer/lib/types.ts",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("Schema drift check failed:", err);
  process.exit(2);
});
```

**Verification:** `bun scripts/check-observer-schema-drift.ts` runs and reports results.

### Task 3: Add the drift check to package.json scripts

**Goal:** Add a `check:observer-drift` script to the root `package.json` for easy invocation.

**File:** `package.json`

**Target (add to "scripts" section):**

```json
"check:observer-drift": "bun scripts/check-observer-schema-drift.ts"
```

**Verification:** `bun run check:observer-drift` runs the drift check script.

### Task 4: Verify the harness schemas exist with expected export names

**Goal:** Before the drift check script can work, verify that the harness schema exports (`parsedErrorSchema`, `checkResultSchema`, `HarnessResultSchema`) exist and are exported from the expected paths. If the export names differ, update the script accordingly.

**File:** `packages/luca-framework/src/harness/__schemas/harness.schemas.ts`

**Verification:** `grep -n "export.*parsedErrorSchema\|export.*checkResultSchema\|export.*HarnessResultSchema" packages/luca-framework/src/harness/__schemas/harness.schemas.ts` returns matches for all three.

Note: If the export names differ (e.g., camelCase vs PascalCase), Task 2 must be updated to match. The executor should verify this before running the script.

### Task 5: Update observer types.ts header comment to reference drift check

**Goal:** Add a reference to the drift check script in the Schema Coupling Policy documentation at the top of `packages/luca-observer/lib/types.ts`.

**File:** `packages/luca-observer/lib/types.ts`

**Current (lines 7-8):**

```typescript
 * **When luca-framework schemas change**, the corresponding observer-local mirrors
 * must be updated manually:
```

**Target:**

```typescript
 * **When luca-framework schemas change**, the corresponding observer-local mirrors
 * must be updated manually. Run `bun run check:observer-drift` to detect mismatches:
```

**Verification:** `grep -n "check:observer-drift" packages/luca-observer/lib/types.ts` returns the updated line.

## Success Criteria

- [ ] `config-generators.ts` imports from `../pi-extensions/__helpers` (barrel) not `../pi-extensions/__helpers/sanitize` (direct file)
- [ ] `scripts/check-observer-schema-drift.ts` exists and runs without error
- [ ] `check:observer-drift` script added to root `package.json`
- [ ] Observer `types.ts` header references the drift check command
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes

## Verification

```bash
# Verify no direct __helpers/ file import
grep "pi-extensions/__helpers/sanitize" src/hooks/__helpers/config-generators.ts && echo "FAIL: direct import remains" || echo "PASS: barrel import used"

# Verify drift check script exists and runs
test -f scripts/check-observer-schema-drift.ts && echo "PASS: script exists" || echo "FAIL"
bun scripts/check-observer-schema-drift.ts && echo "PASS: no drift" || echo "INFO: drift detected (expected if schemas differ)"

# Verify package.json script
grep "check:observer-drift" package.json && echo "PASS: script registered" || echo "FAIL"

# Verify types.ts reference
grep "check:observer-drift" packages/luca-observer/lib/types.ts && echo "PASS: reference added" || echo "FAIL"

# No regressions
bunx --bun tsc --noEmit
bun test
```
