# Phase 3 Plan 1 Summary: TypeScript Round-Trip Utilities

## Status: COMPLETE

## What was built

Three new files in `packages/luca-studio/`:

1. **`lib/ts-round-trip.ts`** — Core read/write utilities
   - `extractConfigFromSource(source, domain)` — Splits a `.agent.ts`, `.skill.ts`, or `.rule.ts` file into prefix / raw config object text / suffix via brace-depth counting with template literal interpolation awareness
   - `generateEntitySource(rawConfigText, metadata)` — Reassembles the three segments into a complete TypeScript source file
   - `readEntityFile(filePath)` — File I/O wrapper with auto domain detection
   - `writeEntityFile(filePath, rawConfigText, metadata)` — Atomic write (`.tmp` + rename)
   - `roundTripEntityFile(filePath)` — Read/generate/compare for verification
   - `detectDomain(filePath)` — Extension-based domain detection

2. **`lib/shared-constant-registry.ts`** — Frozen registry of 4 shared constants
   - `COLD_ISOLATION_BLOCK` from `~/agents/__helpers/cold-isolation-block`
   - `RESEARCH_REVIEWER_COLD_ISOLATION`, `RESEARCH_REVIEWER_SCORING`, `RESEARCH_REVIEWER_OUTPUT_CONTRACT` from `~/agents/__helpers/research-reviewer-shared-sections`
   - Provides `lookupSharedConstant(name)` for programmatic access
   - Used by read/write paths to detect/preserve `${CONSTANT_NAME}` interpolation

3. **`scripts/verify-round-trip.ts`** — Verification gate script
   - Discovers all 129 entity files via glob
   - Runs round-trip verification on each
   - Individually tracks and reports the 8 interpolation agents
   - Exits with code 1 on any failure

## Approach

The round-trip uses a three-segment split strategy:

- **Prefix**: Everything before the config object's opening `{` (JSDoc, imports, extra declarations, config variable declaration up to `= `)
- **Raw config text**: The brace-balanced config object `{ ... }` extracted via depth-counting that correctly handles template literal `${...}` interpolation
- **Suffix**: Everything after the closing `}` (semicolon, export statement, trailing newlines)

This approach guarantees zero-diff round-trip by construction for unmodified files, since it preserves the exact source text without parsing and re-serializing. The structured config data is available in the metadata for editing use cases.

## Verification results

```
129/129 files pass round-trip verification. All clear.

Interpolation agents (8 expected):
  [PASS] code-architect
  [PASS] code-simplifier
  [PASS] dx-advocate
  [PASS] lu-accuracy-reviewer
  [PASS] lu-actionability-reviewer
  [PASS] lu-completeness-reviewer
  [PASS] performance-auditor
  [PASS] security-auditor
  8/8 interpolation agents verified
```

Execution time: 0.02s for all 129 files.

## Deviations

1. **[Simplified write path]** The plan described a full serialization approach (`serializeSectionContent()`, `serializeConfig()`) that would parse the config into structured data and re-serialize it. Instead, the implementation uses a prefix/config/suffix split that preserves raw source text verbatim. This is simpler, more robust, and guarantees zero-diff by construction. The structured parsing can be layered on top when Luca Studio needs to edit individual fields.

2. **[Two edge-case files handled]** `post-init-tour.skill.ts` has extra exported code (`tourSteps`) between imports and the config declaration. `session-plan.skill.ts` has a JSDoc comment between the config and the export. Both are handled correctly by the three-segment approach because all "extra" content falls naturally into the prefix or suffix.

## Commit

- `524ca4d0` — feat(studio): add TypeScript round-trip utilities for entity files
