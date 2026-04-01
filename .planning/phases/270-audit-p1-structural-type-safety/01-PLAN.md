---
phase: 270
plan: 01
type: fix
autonomous: true
complexity: COMPLEX
---

# Phase 270: Audit P1 — Structural & Type Safety Fixes

## Objective

Fix structural invariant violations, type name collisions, and consolidate duplicate enums identified in the v9.0.0 audit. Nine targeted fixes across the src/ and packages/luca-framework/ codebases.

## Context

@src/drift/**schemas/drift.schemas.ts
@src/drift/index.ts
@src/drift/**helpers/drift-checker.ts
@src/process-data/compute.ts
@src/process-data/index.ts
@src/context/**helpers/result-envelope.ts
@src/context/index.ts
@packages/luca-framework/src/state/types.ts
@packages/luca-framework/src/state/index.ts
@packages/luca-framework/src/state/events.ts
@src/complexity/**helpers/classify.ts
@packages/luca-framework/src/state/**helpers/milestone-reset.ts
@packages/luca-framework/src/state/ledger.ts
@packages/luca-framework/src/state/**helpers/pipeline-lock.ts
@packages/luca-framework/src/state/utils/complexity-utils.ts
@packages/luca-framework/src/state/**schemas/budget-matrix.schemas.ts
@packages/luca-framework/src/state/**schemas/oversight-gate.schemas.ts
@packages/luca-framework/.claude/rules/domain-architecture.md

## Tasks

<task id="1" type="auto">
### ARCH-01: Rename drift ReassessmentResult to DriftReassessmentResult

Rename the `ReassessmentResult` type in `src/drift/__schemas/drift.schemas.ts` to `DriftReassessmentResult` (and schema to `DriftReassessmentResultSchema`) to resolve the name collision with `ReassessmentResult` in `src/complexity/__schemas/complexity.schemas.ts`.

Update barrel exports in `src/drift/index.ts`.

**Verification:**

- [ ] `DriftReassessmentResultSchema` and `DriftReassessmentResult` exist in drift schemas
- [ ] `src/drift/index.ts` re-exports the renamed type/schema
- [ ] No references to old name remain in src/drift/
      </task>

<task id="2" type="auto">
### ARCH-02: Move compute.ts to process-data/__helpers/

Move `src/process-data/compute.ts` to `src/process-data/__helpers/compute.ts`. Update barrel import in `src/process-data/index.ts`. Update CLI path reference in `src/skills/luca/lu.skill.ts`.

**Verification:**

- [ ] File exists at `src/process-data/__helpers/compute.ts`
- [ ] Old location `src/process-data/compute.ts` is removed
- [ ] `src/process-data/index.ts` imports from new location
- [ ] `lu.skill.ts` CLI reference updated
      </task>

<task id="3" type="auto">
### ARCH-06: Move result-envelope schemas to __schemas/

Split schemas from `src/context/__helpers/result-envelope.ts` into a new `src/context/__schemas/result-envelope.schemas.ts`. The `parseResultEnvelope` function stays in `__helpers/`. Update barrel in `src/context/index.ts`.

**Verification:**

- [ ] New file `src/context/__schemas/result-envelope.schemas.ts` exists with Zod schemas
- [ ] `parseResultEnvelope` function remains in `__helpers/result-envelope.ts`
- [ ] `src/context/index.ts` barrel updated to import from new locations
      </task>

<task id="4" type="auto">
### ARCH-05/DRY-003: Consolidate OversightLevel/OversightMode

In `packages/luca-framework/src/state/types.ts`, make `OversightLevel` a deprecated alias for `OversightMode` from the oversight-gate schemas. Keep "plan" in the schema for backward compatibility.

**Verification:**

- [ ] `OversightLevel` is a deprecated alias for `OversightMode`
- [ ] `oversightLevelSchema` still includes "plan" for backward compat
- [ ] All existing usages in events.ts, index.ts still compile
      </task>

<task id="5" type="auto">
### DRY-001/002/006: Add cross-reference NOTE comments

Add NOTE comments to duplicated type/constant declarations linking to their canonical source, preventing silent drift.

**Verification:**

- [ ] NOTE comment in `complexity-utils.ts` linking to canonical source
- [ ] NOTE comment in `budget-matrix.schemas.ts` linking to canonical source
- [ ] NOTE comment in `oversight-gate.schemas.ts` linking to canonical source
      </task>

<task id="6" type="auto">
### DX-02: Replace parse({}) with safeParse in classify.ts

Replace `classifierWeightsSchema.parse({})` and `classifierThresholdsSchema.parse({})` with safeParse pattern in `src/complexity/__helpers/classify.ts`.

**Verification:**

- [ ] No bare `.parse({})` calls remain in classify.ts lines 260-261
- [ ] safeParse pattern with fallback used instead
      </task>

<task id="7" type="auto">
### DX-11: Replace parse() with safeParse in milestone-reset.ts

Replace `.parse()` calls with `.safeParse()` in `packages/luca-framework/src/state/__helpers/milestone-reset.ts`.

**Verification:**

- [ ] All `.parse()` calls replaced with safeParse pattern
- [ ] Error handling preserved for each usage
      </task>

<task id="8" type="auto">
### SEC-006/007: Replace bare JSON.parse with sanitizeJsonParse

Replace bare `JSON.parse` calls in ledger.ts and pipeline-lock.ts with `sanitizeJsonParse`.

**Verification:**

- [ ] No bare `JSON.parse` in ledger.ts
- [ ] No bare `JSON.parse` in pipeline-lock.ts
- [ ] `sanitizeJsonParse` imported from utils/sanitize.ts
      </task>

<task id="9" type="auto">
### ARCH-03: Register 5 new domains in domain-architecture.md

Add drift, verification, process-data, and workflow to the tier tables in domain-architecture.md.

**Verification:**

- [ ] drift listed under T0 Foundation
- [ ] verification listed under T3 Build
- [ ] process-data listed under T3 Build
- [ ] workflow listed under T1 Core
      </task>

## Success Criteria

- [ ] `bunx --bun tsc --noEmit` passes with no errors
- [ ] All 9 fixes applied cleanly
- [ ] No backward-incompatible changes (deprecated aliases provided)
