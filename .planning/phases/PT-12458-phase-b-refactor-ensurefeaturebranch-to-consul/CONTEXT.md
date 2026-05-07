# Context — Phase B: ensureFeatureBranch Refactor (consult projectPreferences.branching)

**Oversight**: full-auto. Decisions below are reasonable defaults derived from RESEARCH.md and prior art (PT-12458 root cause, Phase A vault-resolution pattern, BranchTypeRule research engram `01KR1GGSSZMZHWW9YDW29W151R`).

## Decisions

| ID | Decision | Rationale | Alternative-Considered | Status |
|----|----------|-----------|------------------------|--------|
| D1 | Add 4 NEW actions (`assert-not-default`, `consult`, `resolve`, `apply`) **additive** to existing (`status`, `create`, `rename`). `status` upgraded to role-based output (`default\|guarded\|feature\|unknown`) but outer `{ok,status,message}` shape preserved. | Back-compat: 3 callers (architect/executor/finalize) currently use `status\|create\|rename`. Additive avoids breaking concurrent branches mid-refactor. Role enrichment is non-breaking — existing `ok/status/message` consumers unaffected. | Replace `create`/`rename` outright. Rejected — forces all callers to change in one PR, increases blast radius. | Accepted |
| D2 | `resolve` is **pure read-only**: reads prefs+git, returns `{branchName, base, prBase, role, needsConfirmation}`, performs **no** writes and **no** git mutations. `apply` does git switch/-c **and** state writes (git first, state second — existing invariant). | Separation of concerns: enables architect prose to insert `ask_user` between resolve and apply when `needsConfirmation:true`. Pure `resolve` is trivially testable with fixtures (no git mocking for the read path). | Single combined `resolve-and-apply`. Rejected — couples confirmation gate to mutation, regresses G-DX-003 carve-out (D3). | Accepted |
| D3 | `confirmBaseBeforeCreate` is a **HARD STOP carve-out** independent of oversight mode. Even in full-auto: `resolve` returns `needsConfirmation:true`; `apply` refuses without explicit confirm token. Architect.md prose **must** call `ask_user` before `apply` when flag is set. Documented as **G-DX-003 carve-out**. | Branching mistakes are expensive and silent (wrong base → wrong PR target → polluted release branch). User-elected guardrail must override automation default. Mirrors existing G-DX-003 pattern (governance overrides DX shortcuts). | Honor oversight=full-auto and skip confirmation. Rejected — defeats the purpose of the preference; user opted in deliberately. | Accepted |
| D4 | `guardedBranches` defense-in-depth: schema `.min(1)` **AND** runtime fallback to `['main']` when array missing/empty/undefined. | Two independent failure modes: (a) malformed config bypasses schema (older state files), (b) schema validated but downstream code receives empty array. Both must fail-safe to "treat as guarded". Cheap belt-and-suspenders. | Schema-only validation. Rejected — older state JSON pre-dating the constraint would slip through; runtime guard costs ~3 lines. | Accepted |
| D5 | Multi-rule dispatch: **ordered first-match wins**. Iterate `branchTypes[]` top-to-bottom, first `match` regex hit returns the rule. Fallback `BranchTypeRule` used when no rule matches. Built-in tool defaults applied when no preferences at all. | Deterministic, predictable, easy to reason about. JSDoc warns authors about catch-all-first hazard. Matches industry norm (eslint, webpack loaders). | Specificity scoring / longest-match. Rejected — non-obvious ordering, harder to debug, no real-world wins for branch matching. | Accepted |
| D6 | Schema additivity: `BranchTypeRule`, `BaseRule`, `RegexSource`, `branchTypes[]`, `fallback`, `confirmBaseBeforeCreate` all **OPTIONAL**. `schemaVersion` stays at **1**. | Existing `projectPreferences` documents remain valid without migration. Phase A consumers continue to work. Bumping schemaVersion would force migration logic for a purely additive change. | Bump to schemaVersion 2. Rejected — no removed/renamed fields, no semantic change to existing fields. | Accepted |
| D7 | State additions: `baseBranch?: string`, `prBase?: string` on `LucaWorkflowState`. Written by `apply`. Read by `finalize` for `gh pr create --base`. | Decouples branch creation context from PR creation moment. PR base must survive across executor/finalize boundary. Optional fields keep older state files valid. | Recompute prBase at finalize time. Rejected — git state may have moved (rebase, force-push); decision must be locked at creation. | Accepted |
| D8 | Slug standardization: drop inline slugify in `ensure-feature-branch.ts`, route through existing `slugifySegment` from `phase-paths.ts` (48-char limit). | DRY — two slugifiers diverge over time (already happening per RESEARCH.md). Phase-paths slugify is the canonical battle-tested impl. 48-char limit aligns with filesystem-safe phase dirs. | Keep separate slugifiers. Rejected — invites drift, doubles test surface. | Accepted |
| D9 | New module `src/util/branch-template.ts` with `renderTemplate(tpl, vars)`. Supports **only** `{type}`, `{issue}`, `{slug}`. Unknown vars **throw at render**. | Tight allow-list prevents accidental injection of unrelated state into branch names. Throw-at-render gives loud, early failure during preferences authoring; a silent placeholder leak would only surface in production branch names. | Allow arbitrary `{var}` interpolation from a context bag. Rejected — surface area for typos and leaks; YAGNI. | Accepted |
| D10 | `gh-prepare` skill is **OUT OF SCOPE** for Phase B. Phase B `finalize.md` already reads `state.prBase` for `gh pr create --base`. Tracked as known gap. | Phase B is large enough; gh-prepare currently still uses `git symbolic-ref` HEAD-based logic and doesn't yet honor state.prBase. Separate phase keeps PR reviewable. | Bundle gh-prepare update. Rejected — exceeds phase scope, blocks Phase B on skill markdown changes that have their own review cycle. | Accepted |
| D11 | `architect.md:50` misleading comment **"(only seen via action='status')"** must be rewritten. New prose must avoid implying status→skip-create coupling. | PT-12458 latent regression risk: a future contributor reading the comment could re-introduce the buggy "status returned on-feature → skip create" path that caused the original incident. Defensive doc-debt cleanup. | Leave comment alone, rely on tests. Rejected — comment is documentation that actively misleads, tests don't fix prose. | Accepted |
| D12 | Tests: extend `ensure-feature-branch.test.ts`; add `branch-template.test.ts`; two preferences fixtures: (a) **luca-framework single-rule fallback**, (b) **ENG/PT multi-rule**. Add **PT-12458 regression test**: on `ENG-1428--release` branch with ticket `PT-12458` → `resolve` returns `PT-12458-*` branch with `base=ENG-1428--release` and `prBase=ENG-1428--release`. | Regression test pins the exact bug; fixtures lock the multi-rule resolver behavior; pure `resolve` (D2) makes fixture testing trivial — no git stubs needed for the resolution path. | Snapshot tests on entire tool output. Rejected — brittle, hides which behavior changed when output shifts. | Accepted |

## Constraints

- **Schema**: `schemaVersion` MUST stay at 1. All new fields optional. No migration code.
- **Back-compat**: `status`, `create`, `rename` actions must keep current behavior for existing callers until separate cutover phase.
- **Vault resolution**: `consult` action MUST use identical vault-resolution logic as Phase A (read `.planning/config.json` → `muninn.vault`, fallback `'default'`) — see prior-art memory `01KR1CMYMCWYZPC2SSN194AEXN`.
- **Invariant**: in `apply`, git mutation happens **before** state write (existing project invariant — preserve).
- **G-DX-003 carve-out**: `confirmBaseBeforeCreate=true` overrides oversight=full-auto. Hard stop, no exceptions.

## Scope

### In Scope
- `src/tools/ensure-feature-branch.ts` — new actions + resolver + base resolution
- `src/state/project-preferences.ts` — additive schema (BranchTypeRule, BaseRule, RegexSource)
- `src/state/luca-store.ts` — `baseBranch?`, `prBase?` on `LucaWorkflowState`
- `src/util/branch-template.ts` — NEW
- `src/agents/modes/{architect,execute,finalize}.md` — prose updates
- `src/agents/subagents/executor.ts` — switch `status` → `assert-not-default`
- `src/tool-manifest.ts` — register new actions per mode
- Tests: extend ensure-feature-branch; new branch-template; fixture-driven resolver

### Out of Scope
- `gh-prepare` skill update (D10) — tracked as known gap
- Removing `status`/`create`/`rename` actions — separate cutover phase
- Schema version bump (additive only)
- Phase A `projectPreferences` tool changes — Phase A is frozen

## Preferences

- Test style: fixture-driven for resolver, unit tests for `renderTemplate`. Pure `resolve` enables fixture-only tests.
- Error shape: preserve existing `{ ok, status, message, ...payload }` convention across all actions.
- Tool action contract: flat `z.object` + `action: z.enum`, per-action runtime parse. **NEVER** `discriminatedUnion` (per project pattern).
- `ask_user` belongs to **architect prose**, never inside the tool body.

## Open Questions

- None blocking implementation. All decisions resolved with documented defaults.
- Planner should flag if any decision conflicts with current `tool-manifest.ts` mode-scoping rules at plan time.
