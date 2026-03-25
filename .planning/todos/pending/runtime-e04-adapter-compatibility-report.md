---
title: "Runtime E04: Adapter compatibility report — validate() per adapter producing compatibility-report.json"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/research/ide-ecosystems.md
depends_on: [E01, E02, E03]
phase: runtime-e
estimated_files: 3
---

## Context

Each adapter must implement a `validate()` method that checks compiled output against the target IDE's known constraints and produces a structured compatibility report. This todo implements the shared schema, the per-adapter validation logic, and the CLI integration so `bun run build:all --adapter=all` emits a `compatibility-report.json` alongside compiled artifacts.

## Task

### 1. Define compatibility report schema

**File:** `src/adapters/__schemas/compatibility-report.schemas.ts`

```typescript
import { z } from "zod";

/**
 * Feature mapping status in a compatibility report.
 */
export const featureMappingStatusSchema = z.enum([
  "fully_mapped",
  "partially_mapped",
  "unsupported",
]);
export type FeatureMappingStatus = z.infer<typeof featureMappingStatusSchema>;

/**
 * A single feature's compatibility status.
 */
export const featureMappingSchema = z.object({
  /** Feature name (e.g., "rules", "skills", "hooks", "agents") */
  feature: z.string(),
  /** Mapping status */
  status: featureMappingStatusSchema,
  /** Human-readable notes about the mapping */
  notes: z.string().default(""),
  /** Number of items compiled for this feature */
  item_count: z.number().int().nonnegative().default(0),
  /** Number of items that were truncated or degraded */
  degraded_count: z.number().int().nonnegative().default(0),
  /** Specific warnings (e.g., "3 rules truncated due to 12K limit") */
  warnings: z.array(z.string()).default([]),
});
export type FeatureMapping = z.infer<typeof featureMappingSchema>;

/**
 * Per-adapter compatibility report.
 */
export const compatibilityReportSchema = z.object({
  /** Adapter ID (e.g., "cursor", "windsurf", "vscode") */
  adapter_id: z.string(),
  /** Adapter name (human-readable) */
  adapter_name: z.string(),
  /** Adapter version */
  adapter_version: z.string(),
  /** Target IDE */
  target_ide: z.string(),
  /** Timestamp of report generation */
  generated_at: z.string().datetime(),
  /** Per-feature mapping status */
  features: z.array(featureMappingSchema),
  /** Overall summary: all features fully mapped? */
  fully_compatible: z.boolean(),
  /** Total warnings across all features */
  total_warnings: z.number().int().nonnegative(),
});
export type CompatibilityReport = z.infer<typeof compatibilityReportSchema>;

/**
 * Aggregated report across all adapters.
 */
export const aggregatedReportSchema = z.object({
  generated_at: z.string().datetime(),
  adapters: z.array(compatibilityReportSchema),
});
export type AggregatedReport = z.infer<typeof aggregatedReportSchema>;
```

### 2. Implement validate() in each adapter

Each adapter's `validate()` method must:

1. Iterate over all compiled output
2. Check IDE-specific constraints
3. Return a `CompatibilityReport`

**Cursor adapter validation checks:**

- Rule files have valid `.mdc` YAML frontmatter
- Skill files exist as `SKILL.md` in subdirectories
- Hook config is valid JSON with known event names
- No character limit violations (Cursor has no documented limits)

**Windsurf adapter validation checks:**

- No workspace rule file exceeds 12,000 characters
- Global rules total does not exceed 6,000 characters
- All workflow files are under 12,000 characters
- Required `trigger` frontmatter is present in workspace rules
- Trigger values are one of: `always_on`, `model_decision`, `glob`, `manual`

**VS Code adapter validation checks:**

- Agent profiles have required frontmatter: `name`, `description`
- Agent profiles do not exceed 30,000 characters
- Skills have `name` and `description` in SKILL.md frontmatter
- Hook JSON files have valid structure
- Hook stability warnings are present

### 3. Emit aggregated report from build pipeline

**File to modify:** The build orchestration file (in `src/compilers/` or `src/adapters/` depending on Phase B implementation)

After all adapters compile, collect their `CompatibilityReport` results and write:

**Output file:** `dist/compatibility-report.json`

```json
{
  "generated_at": "2026-03-24T12:00:00Z",
  "adapters": [
    {
      "adapter_id": "cursor",
      "adapter_name": "Cursor IDE",
      "features": [ ... ],
      "fully_compatible": true,
      "total_warnings": 0
    },
    {
      "adapter_id": "windsurf",
      "features": [ ... ],
      "fully_compatible": false,
      "total_warnings": 5
    }
  ]
}
```

### 4. CLI integration

When running `bun run build:all --adapter=all`, after compilation completes:

1. Run `validate()` on each adapter's output
2. Print a summary to stdout:
   ```
   Adapter Compatibility Report:
     cursor: COMPATIBLE (0 warnings)
     windsurf: DEGRADED (5 warnings — 3 rules truncated, 2 hooks unsupported)
     vscode: COMPATIBLE (1 warning — hooks in Preview)
   Full report: dist/compatibility-report.json
   ```
3. Exit code 0 if all adapters compiled successfully (warnings are OK, only hard errors cause exit 1)

## Verification

- `bunx --bun tsc --noEmit` passes
- `dist/compatibility-report.json` is valid JSON conforming to `aggregatedReportSchema`
- Each adapter has a report entry with at least entries for: rules, skills, hooks, agents
- Windsurf report correctly flags truncated rules
- VS Code report correctly flags hooks as Preview/unstable
- CLI summary prints to stdout after build completes

## Notes

- The compatibility report is intended for developer consumption. It helps answer: "What does Luca support in my IDE?"
- The report schema uses `snake_case` per API conventions (even though it is not a network API payload, consistency is preferred).
- The `degraded_count` field is important for Windsurf where character truncation is common.
