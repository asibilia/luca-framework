# Plan: Phase B — Branching Policy Refactor (ensureFeatureBranch consult preferences)

## Objective

Refactor `ensureFeatureBranch` to consult `projectPreferences.branching`. Add 4 actions (assert-not-default, consult, resolve, apply) additively. Implement multi-rule branchTypes resolver with template rendering and base resolution. Fix PT-12458 root cause (status returning on-feature for any non-default branch). Persist `baseBranch`/`prBase` to luca-state. Rewrite architect.md Step 1 + executor pre-commit guard. Two preferences fixtures + PT-12458 regression test (covers BOTH new resolve path AND legacy status surface).

## Context

Phase A (branch `feat/project-preferences-foundation`, rebased into Phase B) delivered `projectPreferences` tool with BranchingSection {types, template, defaultBranch, guardedBranches}. Phase B extends that schema additively (BranchTypeRule, BaseRule, RegexSource, branchTypes[], fallback, confirmBaseBeforeCreate) without bumping schemaVersion. resolve is pure read; apply mutates (git first, state second). confirmBaseBeforeCreate is a hard-stop carve-out from G-DX-003 oversight. gh-prepare update is OUT OF SCOPE. Repo paths: `src/instructions/` (mode markdown), `src/subagents/` (executor.ts), `src/state/` (project-preferences.ts, luca-store.ts), `src/tools/` (ensure-feature-branch.ts), `src/util/`.

## Phases

### Phase B (this plan)

#### Wave 1 — Schema, helpers, state extension

- [ ] **Task B.1.1**: Extend `BranchingSection` in `packages/luca-mastracode/src/state/project-preferences.ts`. Add `RegexSource` Zod refinement (`.refine(v=>{try{new RegExp(v);return true}catch{return false}})`), `BaseRule` (`kind: 'static'|'current-branch-if-matches'|'ask'`, optional `value`/`pattern`/`fallback`), `BranchTypeRule` (`match: RegexSource`, `template: SAFE_FREEFORM`, `base: BaseRule`, `prBase: BaseRule`, optional `role`). Add optional `branchTypes[]`, `fallback`, `confirmBaseBeforeCreate` (default false). Tighten `guardedBranches` to `.min(1)`. JSDoc warns on catch-all-first hazard. schemaVersion stays 1.
  - Files: `packages/luca-mastracode/src/state/project-preferences.ts`
  - Verification: `tsc` passes; existing project-preferences tests still green; new schema tests for RegexSource validity, .min(1) rejection of empty array, additivity (omitting new fields parses default).
  - Dependencies: none

- [ ] **Task B.1.2**: Add `baseBranch?: string` and `prBase?: string` to `LucaWorkflowState` in `packages/luca-mastracode/src/state/luca-store.ts` under a `// --- Branching policy ---` section comment.
  - Files: `packages/luca-mastracode/src/state/luca-store.ts`
  - Verification: `tsc` passes; existing luca-store tests green.
  - Dependencies: none

- [ ] **Task B.1.3**: Create `packages/luca-mastracode/src/util/branch-template.ts` exporting `renderTemplate(tpl: string, vars: { type: string; issue?: string; slug: string }): string`. Allow only `{type}` `{issue}` `{slug}` (empty string substituted when `issue` undefined). Throw on unknown vars. Add `branch-template.test.ts` covering happy path, missing-issue (empty replacement), unknown var (throws), repeated vars, and edge cases.
  - Files: `packages/luca-mastracode/src/util/branch-template.ts`, `packages/luca-mastracode/src/__tests__/branch-template.test.ts`
  - Verification: new tests pass; `tsc` passes.
  - Dependencies: none

#### Wave 2 — Tool refactor (additive actions + resolver)

- [ ] **Task B.2.1**: Add 4 actions to `ENSURE_FEATURE_BRANCH_ACTIONS` in `packages/luca-mastracode/src/tools/ensure-feature-branch.ts`: `assert-not-default`, `consult`, `resolve`, `apply`. Keep `status|create|rename` intact. Per-action runtime parse via flat `z.object` (NEVER `discriminatedUnion`). Existing `BRANCH_TYPES` const + `buildBranchName` retained for create-action back-compat (deletion deferred to a separate cutover phase).
  - Files: `packages/luca-mastracode/src/tools/ensure-feature-branch.ts`
  - Verification: `tsc` passes; existing tool tests green; grep `! grep -q discriminatedUnion src/tools/ensure-feature-branch.ts` returns 0; grep `BRANCH_TYPES` and `buildBranchName` still present.
  - Dependencies: B.1.1, B.1.2

- [ ] **Task B.2.2**: Implement and **export** pure `resolveBranching({ ticketId?, intent?, currentBranch, defaultBranch, preferences })` returning `{ branchName, base, prBase, role?, needsConfirmation }`. Iterate `preferences.branching.branchTypes[]` ordered first-match (regex via `match`); on no match use `fallback` rule; on no preferences at all use built-in defaults (current `BRANCH_TYPES` behavior). Use `renderTemplate` and `slugifySegment` from `phase-paths.ts`. **`needsConfirmation:true` is set when EITHER `confirmBaseBeforeCreate=true` OR any of the resolved `BaseRule.kind === 'ask'`** (semantics: `kind:'ask'` means "value must be confirmed by the user at apply time"; resolver returns `base`/`prBase` from `BaseRule.fallback` when present, else leaves them as `undefined` and forces needsConfirmation).
  - Files: `packages/luca-mastracode/src/tools/ensure-feature-branch.ts`
  - Verification: pure-function fixture tests cover regex dispatch, all 3 BaseRule kinds (static, current-branch-if-matches success+fail, ask), fallback rule, multi-rule order, confirmBaseBeforeCreate trigger, BaseRule.kind='ask' trigger, PT-12458 regression (see B.4.3).
  - Dependencies: B.2.1

- [ ] **Task B.2.3**: Implement `apply({ resolution, confirmedBase?: string })` action. Refuse with `{ok:false, status:'needs-confirmation', message}` when `resolution.needsConfirmation && !confirmedBase`. Otherwise: git switch/-c (reuse existing logic from `create`), then `writeLucaState({ branchName, baseBranch: confirmedBase ?? resolution.base, prBase: resolution.prBase, issueNumber })`. State write happens **only after** git mutation succeeds (existing invariant preserved).
  - Files: `packages/luca-mastracode/src/tools/ensure-feature-branch.ts`
  - Verification: tests cover (a) refusal-without-confirm returns ok:false status:needs-confirmation, (b) success path writes baseBranch+prBase to state, (c) git failure path leaves state untouched.
  - Dependencies: B.2.2

- [ ] **Task B.2.4**: Implement `assert-not-default` (read-only; hard fail when `currentBranch === defaultBranch` OR `currentBranch ∈ guardedBranches`; runtime fallback to `['main']` when `guardedBranches` missing/empty/undefined). Implement `consult` (returns merged BranchingSection: prefs ?? tool defaults). Update `status` action to **add** a `role` field (`default | guarded | feature | unknown`) while preserving the existing `status` string values (`on-default | on-feature | detached | no-git | git-error`) so back-compat callers continue to work during the wave-2-to-wave-3 window.
  - Files: `packages/luca-mastracode/src/tools/ensure-feature-branch.ts`
  - Verification: tests cover guarded fallback to ['main'], assert-not-default hard-fail on guarded branch, status preserves legacy string + adds role, consult merges prefs.
  - Dependencies: B.2.1

- [ ] **Task B.2.5**: Update `packages/luca-mastracode/src/tool-manifest.ts`: scope new actions per mode. architect: full set (add 4 new); execute: `['status','assert-not-default']`; finalize: `['status','assert-not-default']`; build/fast: full set; research/review/triage/discuss: omitted (default-deny).
  - Files: `packages/luca-mastracode/src/tool-manifest.ts`
  - Verification: existing manifest tests pass; new tests assert (a) execute lacks `apply`, (b) finalize lacks `apply`, (c) research/review/triage/discuss have no entry for ensureFeatureBranch.
  - Dependencies: B.2.1

#### Wave 3 — Instruction files

- [ ] **Task B.3.1**: Rewrite Step 1 in `packages/luca-mastracode/src/instructions/architect.md`. Replace BRANCH_TYPES enum with: `consult` → `resolve` → IF `needsConfirmation:true` THEN `ask_user` (even in full-auto, per **G-DX-003 carve-out** — branching mistakes are silent and expensive) → `apply({resolution, confirmedBase})`. Remove the misleading `(only seen via action="status")` comment near line 50; replace with explicit warning "never insert status→skip-create coupling — see PT-12458 incident".
  - Files: `packages/luca-mastracode/src/instructions/architect.md`
  - Verification: `! grep -q "BRANCH_TYPES" src/instructions/architect.md`; `grep -q "ask_user" src/instructions/architect.md` co-located with `needsConfirmation`; PT-12458 reference doc-comment present; G-DX-003 carve-out string present.
  - Dependencies: B.2.3

- [ ] **Task B.3.2**: Update Step 0 in `packages/luca-mastracode/src/subagents/executor.ts`: switch `ensureFeatureBranch({action:"status"})` → `ensureFeatureBranch({action:"assert-not-default"})`. On `ok:false` → STOP with reported status/message. Keep "ONCE per session" semantics.
  - Files: `packages/luca-mastracode/src/subagents/executor.ts`
  - Verification: `! grep -q 'action:"status"' src/subagents/executor.ts`; `grep -q 'assert-not-default' src/subagents/executor.ts`.
  - Dependencies: B.2.4

- [ ] **Task B.3.3**: Update `packages/luca-mastracode/src/instructions/finalize.md` pre-push: switch `status` → `assert-not-default`. Update `gh pr create --base` line to read `state.prBase ?? state.baseBranch ?? defaultBranch` (no hardcoded `main`).
  - Files: `packages/luca-mastracode/src/instructions/finalize.md`
  - Verification: `! grep -qE "gh pr create.*--base main" src/instructions/finalize.md`; `grep -q "state.prBase" src/instructions/finalize.md`.
  - Dependencies: B.2.4

- [ ] **Task B.3.4**: Add a pre-commit reminder paragraph to `packages/luca-mastracode/src/instructions/execute.md` documenting the `assert-not-default` contract (executor.ts is the enforcement site; this paragraph documents the contract for OVERFLOW executors).
  - Files: `packages/luca-mastracode/src/instructions/execute.md`
  - Verification: `grep -q "assert-not-default" src/instructions/execute.md`.
  - Dependencies: B.3.2

#### Wave 4 — Tests (resolver fixtures + PT-12458 regression)

- [ ] **Task B.4.1**: Add fixture (a) `packages/luca-mastracode/src/__tests__/fixtures/preferences-luca-framework.ts`: single rule + fallback (current Phase A behavior). Add fixture (b) `packages/luca-mastracode/src/__tests__/fixtures/preferences-eng-pt.ts`: ENG rule (`match: '^ENG-\\d+$'`, role:'release', static base/prBase=`main`); PT rule (`match: '^PT-\\d+$'`, role:'feature', `base: { kind:'current-branch-if-matches', pattern:'^ENG-\\d+--release$', fallback:'ask' }`, `prBase: { kind:'current-branch-if-matches', pattern:'^ENG-\\d+--release$', fallback:'ask' }`); fallback rule; **`guardedBranches: ['main']` plus a release-branch entry/pattern** so B.4.3(ii) is mechanically grounded. Both fixtures parse via `ProjectPreferencesSchema`.
  - Files: `packages/luca-mastracode/src/__tests__/fixtures/preferences-luca-framework.ts`, `packages/luca-mastracode/src/__tests__/fixtures/preferences-eng-pt.ts`
  - Verification: a parse test for each fixture (no Zod errors).
  - Dependencies: B.1.1

- [ ] **Task B.4.2**: Extend `packages/luca-mastracode/src/__tests__/ensure-feature-branch.test.ts` with new test categories using both fixtures: assert-not-default (default + guarded + missing-array fallback to `['main']`); consult (prefs+defaults merge); resolve (regex dispatch, all BaseRule kinds, template render, fallback rule, multi-rule order, confirmBaseBeforeCreate trigger, BaseRule.kind='ask' trigger); apply (refuse-without-confirm, success-writes-state, git-fail-no-state); status preserves legacy strings + adds role.
  - Files: `packages/luca-mastracode/src/__tests__/ensure-feature-branch.test.ts`
  - Verification: all existing tests still green; ≥16 new tests added.
  - Dependencies: B.4.1, B.2.2, B.2.3, B.2.4

- [ ] **Task B.4.3**: PT-12458 regression test — covers BOTH bug surfaces. (i) On `currentBranch="ENG-1428--release"` with ticket `"PT-12458"`, fixture (b): `resolve` returns `branchName` matching `/^PT-12458-/`, `base="ENG-1428--release"`, `prBase="ENG-1428--release"`. (ii) On the same `currentBranch`: `status` returns `role:"guarded"` (since `ENG-1428--release` is not the default but matches an ENG release-role rule's branch — guarded by inference) AND `assert-not-default` returns `ok:false` when `guardedBranches` includes the release-branch pattern. Comment in test references original PT-12458 incident.
  - Files: `packages/luca-mastracode/src/__tests__/ensure-feature-branch.test.ts`
  - Verification: regression test green; deliberately reverting B.2.2 resolver fix produces a red test for (i); reverting the role enrichment in B.2.4 produces a red test for (ii).
  - Dependencies: B.4.2

## Verification Criteria

- All existing tests still green (133 from Phase A) + new ≥18 tests.
- `tsc` clean across `packages/luca-mastracode` and `packages/luca-framework`.
- `bun test` clean.
- 4 new actions registered + per-mode-scoped (execute/finalize cannot call `apply`).
- `baseBranch`/`prBase` written by `apply`, read by `finalize` for PR base.
- PT-12458 regression test pins BOTH bug surfaces (resolve + status/assert-not-default).
- `architect.md` Step 1 contains no `BRANCH_TYPES` enum and no misleading status-skip-create comment.
- Executor.ts and finalize.md no longer call `action:"status"` for the pre-commit/pre-push guard.
- `discriminatedUnion` not introduced in ensure-feature-branch.ts.

## Risks & Mitigations

- **PT-12458 regression** → two-surface regression test (B.4.3) + comment cleanup (B.3.1).
- **guardedBranches empty bypass** → schema `.min(1)` (B.1.1) + runtime `['main']` fallback (B.2.4).
- **Full-auto bypassing confirm** → resolve sets needsConfirmation; apply refuses without token (B.2.3); architect.md documents G-DX-003 carve-out + ask_user gate (B.3.1).
- **State write order** → apply calls writeLucaState ONLY after git success (B.2.3).
- **Catch-all-first hazard** → JSDoc on `branchTypes[]` (B.1.1).
- **Wave 2 status back-compat window** → status keeps legacy string values, only adds `role` field (B.2.4).
- **BaseRule.kind='ask' semantics** → explicit in B.2.2: triggers needsConfirmation; uses `BaseRule.fallback` if present, else leaves base/prBase undefined.
