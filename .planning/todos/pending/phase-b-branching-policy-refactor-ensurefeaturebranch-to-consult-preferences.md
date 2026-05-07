---
title: "Phase B — Branching policy: refactor ensureFeatureBranch to consult preferences"
area: pipeline
created: 2026-05-07
priority: high
source: design-discussion
---

## Task

Phase B — Branching policy: refactor ensureFeatureBranch to consult preferences

## Goal

Replace prescriptive branch-name logic in `ensureFeatureBranch` with a consult-based model that reads `project_preferences.branching` from MuninnDB. The only universal hard guard becomes "no commits to default branch."

**Depends on Phase A** (project preferences foundation).

## Background — The PT-12458 Incident

Original failure: pipeline started on a stale `ENG-1428--release` branch (from prior session), `ensureFeatureBranch.status` returned `"on-feature"` because it accepts any non-default branch. Architect skipped the `create` action. PT-12458's commits landed on the wrong branch, conflating with ENG-1428's PR.

Root cause: tool conflates "any non-default branch" with "correct feature branch for current ticket." Has no notion of what "correct" means for the current project.

## New Action Surface

Replace `status | create | rename` with:

| Action | Behavior |
|---|---|
| `assert-not-default` | Read `git branch --show-current`, fail if it's in `preferences.branching.guardedBranches`. The universal hard guard. Called before every commit. |
| `consult` | Thin wrapper over `projectPreferences.consult-section('branching')`. Returns policy or null. |
| `resolve` | Given `{ticket, slug, type?}`, walk `branchTypes[]` rules → return `{branchName, base, prBase, needsConfirmation}`. Pure function, no side effects. |
| `apply` | Given resolved branch name + base, switch/create. Persists `branchName` + `baseBranch` + `prBase` to `luca-state.json`. |
| `status` | Kept as thin read-only inspect for debugging. |

## Resolver Logic

```
function resolve({ ticket, slug, type }) {
  policy = consult()
  if (!policy) → return { needsInit: true }

  // Try ordered branchTypes[] rules
  for (rule of policy.branchTypes) {
    if (ticket && new RegExp(rule.match).test(ticket)) {
      branchName = renderTemplate(rule.template, { ticket, slug, type })
      base = resolveBase(rule.base, currentBranch)
      prBase = resolvePRBase(rule.prBase, base)
      return { branchName, base, prBase, needsConfirmation: rule.base.kind !== 'static' || policy.confirmBaseBeforeCreate }
    }
  }

  // Fall through to fallback rule
  fb = policy.fallback
  branchName = ticket ? renderTemplate(fb.template, { ... }) : renderTemplate(fb.templateNoIssue, { ... })
  base = resolveBase(fb.base, currentBranch)
  return { branchName, base, prBase: base, needsConfirmation: policy.confirmBaseBeforeCreate }
}
```

`resolveBase` handles `kind`:
- `static` → `value`
- `current-branch-if-matches` → `currentBranch` if it matches `pattern`, else `fallback` (`"ask"` triggers confirmation)
- `ask` → always prompt

## Architect Mode Update

`packages/luca-mastracode/src/instructions/architect.md` Step 1:

```
1. policy = ensureFeatureBranch.consult()
2. if policy is null OR returns {needsInit: true}:
     invoke luca-init skill (Phase A) → re-consult
3. resolved = ensureFeatureBranch.resolve({ ticket, slug, type })
4. if resolved.needsConfirmation:
     ask_user "Will branch <resolved.branchName> from <resolved.base>. Correct?"
5. ensureFeatureBranch.apply(resolved.branchName, resolved.base, resolved.prBase)
```

The confirmation step is the single change that would have caught PT-12458.

## Executor Pre-commit Guard

`packages/luca-mastracode/src/instructions/execute.md` and `subagents/executor.ts` — replace the existing `ensureFeatureBranch({ action: "status" })` call with:

```
ensureFeatureBranch({ action: "assert-not-default" })
```

Hard fail with clear message if violated. No silent recovery.

## Replay Test: PT-12458 Scenario

With ENG/PT preferences (multi-rule schema):

1. Current branch: `ENG-1428--release`. New ticket: `PT-12458`.
2. Resolver matches `^PT-\d+` rule. Template renders `PT-12458--{slug}`. Base rule is `current-branch-if-matches: ^ENG-\d+`.
3. Current branch matches → base = `ENG-1428--release`, prBase = `ENG-1428--release`.
4. `needsConfirmation` true → architect asks: "Will branch `PT-12458--color-swatch-dark-theme` from `ENG-1428--release`. Correct?"
5. User confirms (or corrects).
6. Apply switches to fresh branch off `ENG-1428--release`.
7. Pre-commit guard passes (not on `main`).
8. PR opens against `ENG-1428--release`, not `main`.

Stale-branch case: same flow, user sees the wrong base in confirmation, says no, picks correct ENG branch.

## Files Touched

- `packages/luca-mastracode/src/tools/ensure-feature-branch.ts` — new actions
- `packages/luca-mastracode/src/instructions/architect.md` — Step 1 rewrite
- `packages/luca-mastracode/src/instructions/execute.md` — pre-commit guard
- `packages/luca-mastracode/src/instructions/finalize.md:339` — pre-push guard updates
- `packages/luca-mastracode/src/subagents/executor.ts` — guard call
- `packages/luca-mastracode/src/__tests__/ensure-feature-branch.test.ts` — coverage for both rule sets (luca-framework fallback, ENG/PT multi-rule)
- `packages/luca-mastracode/src/state/state.ts` — add `prBase` field

## Acceptance Criteria

1. Committing on `main` is blocked by `assert-not-default`, regardless of preferences state.
2. With luca-framework's seeded preferences, fresh pipeline run creates `<type>/<issue>-<slug>` off `main`. Behavior matches today.
3. With ENG/PT multi-rule preferences (test fixture), starting on `ENG-1428--release` with new PT ticket → resolver returns base `ENG-1428--release`, prBase `ENG-1428--release`, branch `PT-<num>--<slug>`, requests confirmation.
4. Stale-branch case: starting on `ENG-1500--release` while ticket parent is ENG-1428 → confirmation surfaces mismatch before any commit.
5. Resolver tests cover: static base, current-branch-if-matches with hit, current-branch-if-matches with miss + ask fallback, fallback rule, multiple branchTypes ordering.
6. Pre-commit guard fires before *every* commit, not just the first.
7. Auto-init: if no preferences exist, architect invokes Phase A's init skill before proceeding.

## Out of Scope (Phase C)

- PR title/scope/release format consultation in finalize and gh-prepare
- `rules/pr-title-format.md` rewrite
- Changeset bump-mapping consultation
