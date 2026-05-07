---
"@alecsibilia/luca-mastracode": minor
"@alecsibilia/luca-framework": patch
---

Phase B — branching policy refactor (consult preferences + PT-12458 fix)

This PR builds on the Phase A "project preferences foundation" and supersedes
PR #227 (which is closed in favor of this combined PR). All Phase A changes
are included plus the Phase B refactor.

## Phase A (foundation, included)

- `projectPreferences` Mastra tool — consult / consult-section / seed / update
  backed by `.planning/preferences.json` and `state.preferencesSeeded`.
- Zod schema (`ProjectPreferencesSchema`) covering branching, commits, pr,
  release, tracker sections with sealed `schemaVersion` and tightened
  `SAFE_FREEFORM` allowlist (no quote chars, no line terminators).
- Vault helpers (`sanitizeVaultName`, `resolveProjectVault`) consolidated in
  mastracode; framework re-exports for backward compatibility.
- Triage Step 1.6 sentinel — when preferences are unseeded, agent invokes the
  `/luca-init` skill before classifying.
- `/luca-init` skill — probing wizard that detects branching/commit/PR
  conventions from the local repo, confirms with the user, and seeds both the
  local preferences file AND a MuninnDB memory via JSON-blob handoff (avoids
  prompt-injection from re-interpolation).
- Includes PR #227 Copilot review fixes: plain-object guard in
  `mergePreferences`, doc accuracy in skill, defensive runtime validation in
  `consult-section`.

## Phase B (branching policy refactor)

- **4 new ensureFeatureBranch actions** — `assert-not-default` (read-only
  guard), `consult` (read preferences), `resolve` (pure multi-rule resolver),
  `apply` (git-first branch creation + state write).
- **Multi-rule branch resolver** — `resolveBranching()` pure function dispatches
  against `projectPreferences.branching.branchTypes[]` ordered first-match,
  with fallback rule support. Three base-resolution kinds: `static` (hardcoded
  default branch), `current-branch-if-matches` (release-branch-aware), `ask`
  (requires user confirmation). Fixes PT-12458 root cause where the old
  `status` action returned `"on-feature"` for any non-default branch and
  conflated feature work onto release branches.
- **Schema extensions** — `BranchingSection` adds `RegexSource` validation
  (with nested-quantifier ReDoS guard), `BaseRule`, `BranchTypeRule`, optional
  `branchTypes[]`, fallback rule, `confirmBaseBeforeCreate`, and
  `guardedBranches.min(1)`. All additive; `schemaVersion` stays at `1`.
- **State persistence** — `baseBranch` and `prBase` fields added to
  `LucaWorkflowState`, written by `apply`, read by finalize for PR-base
  resolution.
- **Instruction rewrites** — `architect.md` Step 1 consults preferences and
  applies a resolve→ask_user→apply flow (no hardcoded branch type enum);
  executor switches from `status` to `assert-not-default` pre-commit guard;
  `finalize.md` computes PR base from `state.prBase ?? state.baseBranch ??
  'main'` (no hardcoded `--base main`).
- **Test fixtures** — two preferences fixtures: luca-framework (single-rule)
  and ENG/PT (multi-rule with release-branch base resolution, the PT-12458
  setup). Two-surface PT-12458 regression: `resolve` returns the correct
  release-branch base AND `assert-not-default` correctly identifies the
  release branch as guarded.
- **Security hardening** — `SafeRefName` validation on git-ref args passed to
  `execFileSync`, `RegexSource` ReDoS guard, input length caps on `ticketId`
  / `intent`.

## Review summary

Phase A: 2 review iterations + PR #227 Copilot fixes folded in.
Phase B: 2 review iterations, 0 MUST-FIX remaining.
Tests: 175/175 pass (133 Phase A + 42 Phase B-specific).
TypeScript: clean.
Rule gate: clean.
