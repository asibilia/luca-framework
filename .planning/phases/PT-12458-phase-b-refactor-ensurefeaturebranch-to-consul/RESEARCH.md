# Research: Phase B — Branching Policy Refactor (ensureFeatureBranch consult preferences)

## Summary

`ensureFeatureBranch` hardcodes BRANCH_TYPES + buildBranchName, never reads `preferences.branching`. Default branch resolved from git only. PT-12458 root cause: `status()` returns `on-feature` for any non-default branch (no policy match). Phase B adds `assert-not-default | consult | resolve | apply` actions, multi-rule branchTypes resolver with template rendering + base resolution kinds, persists `baseBranch`/`prBase` to luca-state. Architect Step 1 rewrites `create`→`resolve→confirm→apply`. Executor adds `assert-not-default` pre-commit guard. Phase A tool stays untouched.

## Scope

**Files modified**:
- `src/tools/ensure-feature-branch.ts` — new actions, resolver, render, base resolution
- `src/state/project-preferences.ts` — extend BranchingSection (additive, no schemaVersion bump)
- `src/state/luca-store.ts` — add `baseBranch?: string`, `prBase?: string` to LucaWorkflowState
- `src/util/branch-template.ts` — NEW renderTemplate(template, vars)
- `src/agents/modes/architect.md` — Step 1 rewrite (consult→resolve→confirm→apply)
- `src/agents/modes/execute.md` — pre-commit assert-not-default reminder
- `src/agents/subagents/executor.ts` — switch status→assert-not-default
- `src/agents/modes/finalize.md` — switch status→assert-not-default; PR base from state.prBase
- `src/tool-manifest.ts` — register new actions per mode
- Tests: `ensure-feature-branch.test.ts` (extend), `branch-template.test.ts` (new), fixture-driven multi-rule resolver tests

**Blast radius**: 3 callers (architect, executor, finalize). Additive action set keeps `status|create|rename` intact for back-compat.

## Architecture

- Tool action contract: flat `z.object` + `action: z.enum`, per-action runtime parse. NEVER discriminatedUnion.
- `resolve` is **pure** (reads prefs+git, no writes, no git mutations) → returns `{branchName, base, prBase, role, needsConfirmation}`.
- `apply` is the **mutating** action (git switch/-c, writes baseBranch+prBase to state). Git first, state second (existing invariant preserved).
- `assert-not-default` is the **read-only guard** (no side effects, hard fail on default-or-guarded).
- `consult` returns the resolved `BranchingSection` (after preferences + tool defaults merge).
- `status` retained for back-compat but role-based: `default | guarded | feature | unknown`.
- ask_user belongs to architect prose, never inside the tool.

## Patterns

- Template rendering: new `src/util/branch-template.ts` with `renderTemplate(tpl, vars)` supporting `{type}`, `{issue}`, `{slug}`. Reject unknown vars at parse.
- Slug standardization: route through existing `slugifySegment` from phase-paths.ts (48-char). Drop divergent inline slugify in ensure-feature-branch.
- RegexSource Zod refinement: `.refine(v => { try { new RegExp(v); return true } catch { return false }})`. Used for `branchTypes[].match` and `BaseRule.pattern`.
- Multi-rule dispatch: ordered first-match wins. Fallback rule applied when no match. JSDoc warns about catch-all hazard.
- Error shape: `{ ok: boolean, status: string, message: string, ...payload }` (existing convention preserved).

## Dependencies

Schema additions to `BranchingSection` (additive, schemaVersion stays 1):
- `branchTypes?: BranchTypeRule[]`
- `fallback?: BranchTypeRule`
- `confirmBaseBeforeCreate?: boolean` (default false)

`BranchTypeRule`:
- `match: RegexSource`
- `template: SAFE_FREEFORM`
- `base: BaseRule`
- `prBase: BaseRule`
- `role?: 'feature' | 'release' | 'rc'`

`BaseRule`:
- `kind: 'static' | 'current-branch-if-matches' | 'ask'`
- `value?: SAFE_FREEFORM` (for static)
- `pattern?: RegexSource` (for current-branch-if-matches)
- `fallback?: SAFE_FREEFORM | 'ask'`

LucaWorkflowState additions: `baseBranch?: string`, `prBase?: string`.

No new git commands. No new external packages.

## Risks

- **P0 RISK-1** PT-12458 latent regression — architect.md:50 misleading comment must be rewritten; never insert status→skip-create.
- **P0 RISK-2** `guardedBranches: []` no-op — schema `.min(1)`, AND tool fallback `['main']` if missing.
- **P0 RISK-3** Full-auto bypassing `confirmBaseBeforeCreate` — treat as **hard stop independent of oversight**. resolve returns `needsConfirmation:true`; apply refuses without confirmation token; architect.md prose handles ask_user. Document G-DX-003 carve-out.
- **P1 RISK-4** State write order — preserve git-first/state-second in apply.
- **P1 RISK-5** Multi-rule ordering hazard — JSDoc + optional seed-time warn on `^.*$` at index 0.
- **P1 RISK-6** Pre-commit scope — switch executor.ts + finalize.md to `assert-not-default`. gh-prepare gap acknowledged, deferred.
- **P2 RISK-7** Additive enum = no breaking change for existing callers.
- **P2 RISK-8** Test categories: regex dispatch, base kinds, template render, fallback rule, multi-rule ordering, needsConfirmation, guarded-branch detection, baseBranch persistence.

## Recommendations

1. **Wave 1 — Schema + helpers + state**
   - Extend `project-preferences.ts` (BranchTypeRule, BaseRule, RegexSource, additive fields, `guardedBranches.min(1)`).
   - Add `baseBranch`/`prBase` to `LucaWorkflowState`.
   - New `src/util/branch-template.ts` + tests.
2. **Wave 2 — Tool refactor**
   - Add 4 new actions (`assert-not-default`, `consult`, `resolve`, `apply`).
   - Resolver: ordered branchTypes match → fallback → tool defaults. Pure function, exported for tests.
   - apply mutates git + writes `baseBranch`/`prBase` to state.
   - Keep `status|create|rename` intact (back-compat). Update `status` to role-based output.
3. **Wave 3 — Instruction files**
   - architect.md Step 1 rewrite: `consult→resolve→(ask_user if needsConfirmation)→apply`. Remove BRANCH_TYPES enum. Fix line 50 misleading comment.
   - executor.ts and finalize.md: switch `status` calls to `assert-not-default`.
   - execute.md: add pre-commit reminder paragraph.
4. **Wave 4 — Tests**
   - Extend `ensure-feature-branch.test.ts` (4 new actions, 8+ categories).
   - Add fixtures: (a) luca-framework single-rule fallback, (b) ENG/PT multi-rule.
   - PT-12458 regression test: on `ENG-1428--release` with PT-12458 ticket → resolve returns `PT-12458-...` branch, base `ENG-1428--release`, prBase `ENG-1428--release`.

## Open Questions

- `confirmBaseBeforeCreate` carve-out from G-DX-003 oversight rules — architect.md prose phrasing (settle in plan review).
- gh-prepare integration with `state.prBase` — explicitly deferred to a separate todo.
- Whether `apply` should return the written `baseBranch`/`prBase` for easier executor logging — recommend yes (already in scope).
