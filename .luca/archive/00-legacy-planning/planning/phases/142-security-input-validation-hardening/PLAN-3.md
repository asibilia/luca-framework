---
phase: 142
plan: 3
type: improvement
autonomous: true
wave: 3
depends_on: [2]
---

# Phase 142 Plan 3: Wire Orphaned Interop Domain to Context Consumer

## Objective

Wire the orphaned `src/interop/` domain (Gap #1 from milestone audit) to a real TypeScript consumer. The interop scanner (`scanForAgents` + `formatScanSummary`) currently has zero importers within `src/`. This plan adds the interop scanner as an optional data source in the context domain's pre-flight hydration snapshot, populating the already-defined `agent_summaries` field in `ContextDocumentSet`.

This depends on Plan 2 (Wave 2) which fixes the path traversal vulnerability in `scanner.ts` -- the scanner must be secure before wiring it to a consumer.

> Appetite: Medium (100000 tokens remaining of 100000 ceiling)

## Context

@src/interop/index.ts — barrel exports scanForAgents and formatScanSummary
@src/context/**helpers/hydration-snapshot.ts — natural consumer, generates PreFlightSnapshot
@src/context/**schemas/context.schemas.ts — preFlightSnapshotSchema (needs agent_summaries field), contextDocumentSetSchema already has agent_summaries
@scripts/check-domain-boundaries.ts — enforcement script; verified that T1->T1 imports are allowed (check is `sourceTier < targetTier`, same-tier is skipped)
@.claude/rules/module-boundary.md — documents "T1 Core: imports T0 only" but enforcement script does not block T1->T1

## Tasks

### 1. Verify T1->T1 import legality with boundary checker

**Type:** auto
**TDD:** false
**Depends on:** none

Run `bun run scripts/check-domain-boundaries.ts` to confirm current clean baseline, then verify that the enforcement logic at line 194 uses `sourceTier < targetTier` (strict less-than), meaning same-tier imports (T1->T1) are not flagged.

This is a read-only verification step. If the checker WOULD flag T1->T1 imports, this plan must be revised to wire interop from a T3 consumer instead.

**Files to create/edit:**

- None (verification only)

**Verification:**

- `bun run scripts/check-domain-boundaries.ts` passes with 0 violations
- Confirmed: same-tier (T1->T1) imports are not checked by the enforcement script

### 2. Add agent_summaries field to PreFlightSnapshot schema

**Type:** auto
**TDD:** false
**Depends on:** 1

Add an optional `agent_summaries` field to `preFlightSnapshotSchema` in `src/context/__schemas/context.schemas.ts`. The field already exists on `contextDocumentSetSchema` (line 121) but is missing from the snapshot schema that feeds it.

Changes:

1. In `preFlightSnapshotSchema` (line ~214), add after `import_graph`:
   ```typescript
   /** Optional interop scanner summary of discovered agents */
   agent_summaries: z.string().optional(),
   ```

This is a non-breaking addition -- the field is optional, so all existing consumers continue to work.

**Files to create/edit:**

- `src/context/__schemas/context.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `PreFlightSnapshot` type now includes `agent_summaries?: string`

### 3. Wire scanForAgents into generatePreFlightSnapshot

**Type:** auto
**TDD:** false
**Depends on:** 2

Import `scanForAgents` and `formatScanSummary` from `~/interop` in `src/context/__helpers/hydration-snapshot.ts` and call them inside `generatePreFlightSnapshot()` to populate the new `agent_summaries` field.

Changes:

1. Add import at top of hydration-snapshot.ts:
   ```typescript
   import { scanForAgents, formatScanSummary } from "~/interop";
   ```
2. Inside `generatePreFlightSnapshot()`, after the existing snapshot collection steps (file tree, test files, git history, import graph), add:
   ```typescript
   // Interop: discover agents across IDE tool directories
   let agentSummaries: string | undefined;
   try {
     const scanResult = await scanForAgents(cwd);
     if (scanResult.agents.length > 0) {
       agentSummaries = formatScanSummary(scanResult);
     }
   } catch {
     // Interop scan is optional -- silently skip on failure
   }
   ```
3. Include `agent_summaries: agentSummaries` in the returned snapshot object

Note: `generatePreFlightSnapshot` already receives a `cwd: string` parameter — use that directly. Do NOT reference `config.project_root` (it does not exist on `HydrationConfig`). The fallback return path (~line 406) does not need updating since `agent_summaries` is optional.

**Files to create/edit:**

- `src/context/__helpers/hydration-snapshot.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun run scripts/check-domain-boundaries.ts` passes (T1->T1 import allowed)
- The interop domain (`src/interop/`) now has at least one TypeScript importer

### 4. Update module-boundary.md to document T1->T1 allowance

**Type:** auto
**TDD:** false
**Depends on:** 3

The documented rule says "T1 Core: imports T0 only" but the enforcement script allows T1->T1. Update `.claude/rules/module-boundary.md` (the source file at `src/rules/general/module-boundary.rule.ts` if it exists, otherwise the rule file directly) to document this clarification:

Add a note under Rule 1 or in the Documented Exceptions section:

```
**Clarification: Same-tier imports (T1->T1) are permitted.** The "T1 imports T0 only" shorthand means T1 cannot import from T2 or T3. Cross-domain imports within the same tier are allowed (e.g., context importing from interop). The enforcement script (`check-domain-boundaries.ts`) validates this: `sourceTier < targetTier` is the violation condition, so same-tier imports pass.
```

IMPORTANT: Check if this rule is a generated file (built from `src/rules/`). If so, edit the source, not the generated output. If the rule file at `.claude/rules/module-boundary.md` is generated, find the source in `src/rules/` and edit that instead.

**Files to create/edit:**

- Source of `.claude/rules/module-boundary.md` (likely `src/rules/general/module-boundary.rule.ts`)

**Verification:**

- The documentation accurately reflects the enforcement behavior
- No contradictions between documented rules and enforcement script

## Verification

1. `bunx --bun tsc --noEmit` -- type checking passes
2. `bun run scripts/check-domain-boundaries.ts` -- no tier violations (including the new T1->T1 import)
3. Grep `src/` for imports from `~/interop` -- at least one file in `src/context/` imports from it
4. The `PreFlightSnapshot` schema includes `agent_summaries`
5. `generatePreFlightSnapshot` calls `scanForAgents` and populates `agent_summaries`

## Success Criteria

- `src/interop/` is no longer orphaned -- it has at least one TypeScript consumer in `src/`
- The wiring is resilient (try/catch, optional field, graceful degradation)
- Module boundary documentation matches enforcement behavior
- No regressions in type checking or domain boundary compliance

## Output Specification

- Modified: `src/context/__schemas/context.schemas.ts` (agent_summaries field on PreFlightSnapshot)
- Modified: `src/context/__helpers/hydration-snapshot.ts` (import and call scanForAgents)
- Modified: Source rule file for module-boundary.md (T1->T1 clarification)
