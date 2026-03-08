---
phase: 13
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
gap_closure: true
findings: [Gap-2, Gap-3, H1]
---

# Phase 13 Plan 01: Fix Stale Template Reference and Align harnessFixIterations Divergence

## Objective

Fix the stale `src/memory/context-monitor.ts` reference in the luca-framework template shell script (Gap 2), and align the `harnessFixIterations` value for CRITICAL complexity in `packages/luca-framework/src/state/defaults.ts` with the canonical source of truth in `src/complexity/__helpers/defaults.ts` (Gap 3 / H1). Also remove the duplicate `DEFAULT_COMPLEXITY_MATRIX` definition in the state package since it should defer to the canonical complexity domain.

## Context

- @packages/luca-framework/templates/hooks/scripts/context-check-throttled.sh (stale reference to deleted `src/memory/context-monitor.ts`)
- @src/hooks/scripts/context-check-throttled.sh (already-fixed source version, use as reference for the template fix)
- @packages/luca-framework/src/state/defaults.ts (has `CRITICAL.harnessFixIterations = 3`, canonical says `3` -- but also has a full duplicate `DEFAULT_COMPLEXITY_MATRIX`)
- @src/complexity/\_\_helpers/defaults.ts (canonical source of truth for the complexity matrix)
- @.claude/rules/complexity-gating.md (documents `harnessFixIterations` values: TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=2, CRITICAL=3)

## Tasks

### 1. Update template context-check-throttled.sh to match source version

**Type:** auto
**TDD:** false
**Depends on:** none

The template file at `packages/luca-framework/templates/hooks/scripts/context-check-throttled.sh` still references `bun run src/memory/context-monitor.ts` (line 40), which was deleted during the MuninnDB migration in Phase 09. The source file at `src/hooks/scripts/context-check-throttled.sh` has already been updated to use transcript-size heuristics instead.

Replace the entire template file content with the updated approach that uses transcript-size based context monitoring (matching the pattern already in the source version), adapted for the template context (template files do not have the `_lib/common.sh` dependency or bridge calls).

**Files to edit:**

- `packages/luca-framework/templates/hooks/scripts/context-check-throttled.sh`

**Verification:**

- Template no longer references `src/memory/context-monitor.ts`
- Template uses transcript-size heuristics for context monitoring
- Script is valid bash (no syntax errors)

### 2. Verify and align harnessFixIterations in state defaults

**Type:** auto
**TDD:** false
**Depends on:** none

Verify the `harnessFixIterations` values in `packages/luca-framework/src/state/defaults.ts` match the canonical values in `src/complexity/__helpers/defaults.ts` and the documentation in `complexity-gating.md`. Based on current reading:

- Canonical (`src/complexity/__helpers/defaults.ts`): TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=2, CRITICAL=3
- State (`packages/luca-framework/src/state/defaults.ts`): TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=2, CRITICAL=3
- Documentation: TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=2, CRITICAL=3

The values currently match. However, the state package has a full duplicate `DEFAULT_COMPLEXITY_MATRIX` with its own interface types that could drift again. Add a prominent comment linking to the canonical source to prevent future drift.

**Files to edit:**

- `packages/luca-framework/src/state/defaults.ts` (add canonical source reference comment)

**Verification:**

- All three sources (canonical defaults, state defaults, documentation) agree on `harnessFixIterations` values
- State defaults file has a clear comment pointing to the canonical source of truth
- `bunx --bun tsc --noEmit` passes

## Verification

- `grep -r "src/memory/context-monitor" packages/luca-framework/templates/` returns no results
- Template script is syntactically valid: `bash -n packages/luca-framework/templates/hooks/scripts/context-check-throttled.sh`
- Type check passes: `bunx --bun tsc --noEmit`

## Success Criteria

- Gap 2 closed: template no longer references deleted file
- Gap 3 / H1 closed: harnessFixIterations values are aligned and linked to canonical source
- No regressions in type checking

## Output Specification

- Updated template shell script
- Updated state defaults with canonical source reference
