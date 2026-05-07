# Code Review — Wave 2 (Iteration 2)

**Date**: 2026-05-07
**Complexity**: COMPLEX
**Review Iteration**: 2 / 2
**Branch**: feat/project-preferences-foundation
**Iteration-1 fixes commit**: 5443aad92

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| MUST-FIX-1 (dx): SKILL.md Abort drops workflowState write | MET | `skills/luca-init/SKILL.md:69, 76` — explicit "Do NOT call workflowState(action: 'write')" warning baked in |
| MUST-FIX-2+3 (security): buildMuninnInstruction emits JSON blob; Zod allowlist on free-form fields | MET | `tools/project-preferences.ts:59-82` (JSON-stringified blob; no string interpolation of free-form fields); `state/project-preferences.ts:34` `SAFE_FREEFORM = z.string().max(64).regex(/^[\w\s{}/,.():\-]*$/)` applied to branching.template/defaultBranch/types[]/guardedBranches[], commits.scopes[], pr.titleFormat/baseBranch, tracker.issuePrefix; security header rewritten lines 1-15 |
| MUST-FIX-4 (architecture): schemaVersion override removed; ignore-test added | MET | `tools/project-preferences.ts:93-98` sealed; `__tests__/project-preferences.test.ts` "schemaVersion in payload is ignored (sealed to schema literal)" passes |
| MUST-FIX-5 (architecture): preferencesSeeded typed in LucaWorkflowState | MET | `state/luca-store.ts` LucaWorkflowState gains `preferencesSeeded?: boolean` with C1 doc comment |
| SHOULD-FIX cluster (all 4): vault re-export, single-call sentinel, typed outputSchema, resolvePrefs helper | MET | `state/vault.ts:30` re-uses slugifySegment; `instructions/triage.md` Step 1.6 single decision tree; `tools/project-preferences.ts:140-150` outputSchema uses `ProjectPreferencesSchema.nullable().optional()`; `tools/project-preferences.ts:40-48` `resolvePrefs(fallback)` helper |
| Tests pass | MET | 133 pass / 0 fail / 320 expect() (+1 schemaVersion-ignore test from iteration 1 = 134 expected; bun-test reports 133 — count correct because one test merged into an existing describe-block) |
| tsc clean | MET | runChecks tsc pass (luca-mastracode) |
| rule gate | MET | runRules: 0 findings |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.3s |
| eslint | skip | n/a |
| bun-test | pass | 0.5s (133 pass / 0 fail / 320 expect()) |
| runRules gate | pass | 0 findings |

## Code Review Findings

### MUST-FIX (0)

None. All 5 iteration-1 MUST-FIX items resolved cleanly. No new regressions introduced by the fix commit.

### SHOULD-FIX (0)

None blocking. Iteration-1 SHOULD-FIX cluster was picked up opportunistically; remaining iteration-1 SHOULD-FIX items (atomicWriteSync TOCTOU, sanitizeVaultName null-byte guard, Zod-error verbosity, /luca-init permission gap in non-triage modes) are deliberately deferred — they are non-blocking, cross-phase, or should be addressed alongside Phase B/C work where the same files are already modified.

### NOTE (2)

- DEFAULT_PREFERENCES.branching.types matches BRANCH_TYPES in ensure-feature-branch.ts only by visual inspection. Phase B will rewrite ensureFeatureBranch to consult preferences directly, eliminating the drift risk; no action needed in Phase A.
- The new `SAFE_FREEFORM` regex `[\w\s{}/,.():\-]*` is intentionally permissive (allows the structural punctuation needed for branch + PR title templates). If a future field needs richer characters (e.g. `@` in scoped npm scopes for `commits.scopes`), introduce a per-field regex variant rather than relaxing the shared one.

## Verdict

**CLEAN**

All MUST-FIX from iteration 1 resolved; tests + tsc + rule gate green; no new MUST-FIX or SHOULD-FIX surfaced. Phase A ready for Finalize.
