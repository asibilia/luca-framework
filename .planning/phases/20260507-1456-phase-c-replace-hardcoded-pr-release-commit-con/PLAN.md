# Plan: Phase C — PR/Release/Commit Conventions Consult Preferences

## Objective

Replace luca-framework-specific PR/release/commit conventions hardcoded in `rules/pr-title-format.md`, `skills/gh-prepare/SKILL.md`, `src/instructions/finalize.md`, `src/instructions/execute.md`, `commands/gh-pr-address.md` with `projectPreferences.consult-section` calls. Extend schema additively, evolve canonical memory, commit `.planning/preferences.json`, register `plan` mode, add no-leak grep test + permission-coverage test.

## Context

Phase A built the tool/skill/sentinel; Phase B used the consult-pattern for branching. Research found 4 critical prerequisites; iteration 1 review surfaced 2 BLOCKING + 6 ADVISORY items. CONTEXT.md D1–D12 + this revision address all.

Key clarifications from review:
- **Seed semantics**: `projectPreferences(action:"seed")` writes the file AND returns `muninnInstruction` blob. The agent then executes `mcp__muninn__muninn_remember` (or `muninn_evolve` for existing memory). `op_id: project-preferences:${vault}` deterministic. To update existing memory `01KR1BMR4M1M6MR496C80KC6WS` cleanly, use `muninn_evolve` (preserves ULID + provenance).
- **PR strategy**: Wave 1 + Wave 2 land in a SINGLE PR (atomic). The no-leak test is committed as `test.todo` placeholder in Task 1.1.4 and flipped to active in Wave 2's final task (Task 1.2.6) — so every intermediate commit stays green (`test.todo` is a passing/pending state, not a failure). Each commit lands a coherent slice; only the final task activates the assertion.
- **Pattern-3 caveat (G-DX-PATTERN3-LITMUS-001)**: the no-leak test's pattern 3 (bump-rule prose) is single-line. If Task 1.2.2 rewrites the bump prose into multi-line form, pattern 3 will silently miss stale luca-framework content. Task 1.2.2 verification therefore includes a manual grep check `grep -i 'feat.*minor'` returning no hits in `gh-prepare/SKILL.md` body.

## Phases

### Phase 1: Foundation + prose edits (single phase, two waves, single atomic PR)

#### Wave 1: Schema, manifest, seeded prefs file, tests scaffolded

- [ ] **Task 1.1.1**: Extend `ProjectPreferencesSchema` additively + JSDoc precedence
  - Files: `packages/luca-mastracode/src/state/project-preferences.ts`
  - Adds (all `.optional()`, no breaking changes): `pr.titleTemplate?: SAFE_FREEFORM` (with JSDoc: "preferred when present; `titleFormat` retained for backward compat"), `pr.titleExamples?: string[].max(5)` (each `SAFE_FREEFORM`), `pr.forbidden?: { pattern: RegexSource, reason: SAFE_FREEFORM }[].max(10)`, `pr.bodyTemplate?: SAFE_FREEFORM`, `pr.draftByDefault?: boolean`, `commits.types?: string[].max(20)` (each `SAFE_FREEFORM`; JSDoc: "governs commit-message `type:` slot. Distinct from `branching.types` which governs branch-name prefix; consumers may set both equal but they MAY diverge for squash-merge repos"), `commits.trailers?: { coAuthor: boolean, issueRef: SAFE_FREEFORM }`, `commits.subjectMaxLength?: z.number().int().min(20).max(200)`, `tracker.linkFormat?: SAFE_FREEFORM`.
  - Verification: `bun test src/__tests__/project-preferences.test.ts` — all pre-existing tests still pass; new test parses a luca-framework-shaped payload (with all extended fields) and asserts every field round-trips. JSDoc visible in tsserver hover.

- [ ] **Task 1.1.2**: Register `plan` mode + add permission-coverage test (G-ARCH-PLAN-MODE-001)
  - Files: `packages/luca-mastracode/src/tools/tool-manifest.ts:240-253`; NEW test `packages/luca-mastracode/src/__tests__/preferences-mode-coverage.test.ts`
  - Manifest: add `plan: ['consult', 'consult-section']` (literal stock-mode key, between line 252 and 253).
  - Test: enumerate `ALL_REGISTERED_MODES` (from `mode-ids.ts`); assert every mode has `MODE_PERMISSIONS[mode]['projectPreferences']` resolving to at least `['consult-section']` (or `'*'`). Fails if a future mode is added without preference access.
  - Verification: `MODE_PERMISSIONS.plan.projectPreferences === ['consult','consult-section']`. New test passes.

- [ ] **Task 1.1.3**: Seed `.planning/preferences.json` for luca-framework + evolve canonical memory (G-ARCH-SEED-001)
  - Files: NEW `.planning/preferences.json` (committed); UPDATE memory `01KR1BMR4M1M6MR496C80KC6WS`
  - **Step 1** — Build canonical payload object using ONLY schema-valid field values: `pr.titleFormat: '{type}({scope}): {description}'` (legacy retained), `pr.titleTemplate: '{type}({scope}): {version} #{issue} {description}'` (NEW preferred), `pr.titleExamples: [...]`, `pr.forbidden: [{pattern: '\\(#\\d+\\)', reason: 'Never use (#issue) as scope'}]`, `pr.bodyTemplate: 'what-why-how-testplan'`, `pr.draftByDefault: true`, `release.versionBump: {feat:'minor', fix:'patch', chore:'patch', refactor:'patch', docs:'patch', test:'patch', style:'patch'}`, `release.tool: 'changesets'`, `commits.convention: 'conventional'` (NOT `'conventional-commits'` — schema enum), `commits.types: [feat,fix,refactor,chore,docs,test,style]`, `commits.scopes: [framework,mastracode,studio,config,docs,repo]`, `commits.trailers: {coAuthor: true, issueRef: 'Closes #'}`, `commits.subjectMaxLength: 72`, `tracker.kind: 'github'` (NOT `'github-issues'`), `tracker.linkFormat: 'Closes #{issue}'`, `tracker.issuePrefix: ''`.
  - **Step 2** — Call `projectPreferences(action: "seed", payload: <canonical>)` → writes `.planning/preferences.json`, sets `state.preferencesSeeded: true`, returns `muninnInstruction` blob (op_id `project-preferences:luca-framework`).
  - **Step 3** — UPDATE existing canonical memory in place via `muninn_evolve(id: "01KR1BMR4M1M6MR496C80KC6WS", new_content: <stringified canonical payload>, reason: "Phase C — schema-valid field names + extended fields (titleTemplate, forbidden, titleExamples, trailers, subjectMaxLength, linkFormat)")`. This preserves the ULID, provenance chain, and entity links. Do NOT call `muninn_remember` from the seed instruction (would create a duplicate ULID); the canonical memory is the existing one.
  - Verification: `loadProjectPreferences()` returns object containing all extended fields. `git ls-files .planning/preferences.json` returns the file. `muninn_read("01KR1BMR4M1M6MR496C80KC6WS")` returns updated content with `titleTemplate`, `forbidden`, `trailers`, `linkFormat`. `op_id` collision: not relevant — we evolve directly, never re-call muninn_remember.

- [ ] **Task 1.1.4**: Add scoped no-luca-leak test (G-DX-LEAK-001)
  - Files: NEW `packages/luca-mastracode/src/__tests__/no-luca-leak.test.ts`
  - Implementation: scan `packages/luca-mastracode/{rules,skills,src/instructions}` recursively (`.md` files only). For each file, check three patterns and fail if any match:
    1. **Literal scope-list** — exact regex `/\b(framework\|mastracode\|studio\|config\|docs\|repo)\b/` (with the literal pipe character — only matches scope-enum prose, not bare path references)
    2. **Title-format example with luca version** — exact regex `/feat\(mastracode\):\s*v\d+\.\d+\.\d+\s*#\d+/` (only matches the example PR title, not legitimate scope mentions)
    3. **Bump-rule prose** — exact regex `/\bfeat\b\s*(?:→|-->)?\s*\bminor\b.*\bfix\b\s*(?:→|-->)?\s*\bpatch\b/i`
  - Allowlist (skip these files entirely): `packages/luca-mastracode/src/__tests__/`, any path containing `fixtures`, files matching `**/CHANGELOG.md`. Path-reference `mastracode` in `packages/luca-mastracode/...` mentions are NOT matched by pattern 1 (the literal pipe requirement).
  - Wave-1 expectation: test PASSES today (rule has unanchored prose, but anchored patterns also match on rule line 15 — `framework|mastracode|studio|config|docs|repo` literal pipe). Verified: rule body line 15 contains `framework\|mastracode\|studio\|config\|docs\|repo.` → pattern 1 matches → test FAILS pre-Wave-2. **Test stays active throughout this PR** (no `test.skip`); Wave 1 test commit must include `test.todo` placeholder until Wave 2's prose lands. Since we land both waves in one PR (single atomic), the test ends green at PR push time. (G-DX-WAVE1-FAILS-001: atomic PR strategy.)
  - Concretely: Task 1.1.4 commits a `test.todo('no luca-framework conventions in rules/skills/instructions')` placeholder; Task 1.2.6 (last task of Wave 2) flips it to a real test.
  - Verification: at PR push, the real test PASSES. CI green.

#### Wave 2: Prose edits (vertical slices, single file each)

- [ ] **Task 1.2.1**: Rewrite `rules/pr-title-format.md` (alwaysApply rule)
  - Files: `packages/luca-mastracode/rules/pr-title-format.md`
  - New body (≤30 lines): instruct agent to call `projectPreferences({action: "consult-section", section: "pr", fallback: true})` AND `projectPreferences({action: "consult-section", section: "tracker", fallback: true})`; apply `pr.titleTemplate ?? pr.titleFormat` as the title template; reject titles matching any pattern in `pr.forbidden[]`; build issue refs via `tracker.linkFormat`. Note that `fallback:true` returns schema defaults if unseeded — non-triage modes never invoke `/luca-init` directly; preferences are seeded by triage Step 1.6. Drop ALL luca-framework tokens.
  - Verification: pattern 1 of no-leak test no longer matches this file.

- [ ] **Task 1.2.2**: Refactor `skills/gh-prepare/SKILL.md`
  - Files: `packages/luca-mastracode/skills/gh-prepare/SKILL.md`
  - Step 3 (changeset bump): single `consult-section('release', fallback:true)` call near top of skill; use `release.versionBump[type]` for bump level (replaces line 100 prose).
  - Step 5 (linked issue): use `tracker.linkFormat` instead of literal `Closes #<N>` (replaces lines 130, 144, 174, 196).
  - Step 6 (PR title): `consult-section('pr', fallback:true)`; render `pr.titleTemplate ?? pr.titleFormat` (replaces line 137 hardcoded title example, line 163 "conventional commit format" prose).
  - PR body template: drive `Closes` line from `tracker.linkFormat`.
  - Keep existing free-form `muninn_recall` Step 3.2 (D4: supplement, not replace).
  - Verification: patterns 1, 2, 3 of no-leak test do not match this file.

- [ ] **Task 1.2.3**: Refactor `src/instructions/finalize.md`
  - Files: `packages/luca-mastracode/src/instructions/finalize.md`
  - Step 5a: KEEP `muninn_recall` (historical learnings) AND add `consult-section('pr', fallback:true)` + `consult-section('release', fallback:true)`. Remove example string `type(scope): vX.Y.Z #issue description` (line 298).
  - Step 5b.3: Title (line 347) → render via `pr.titleTemplate`. Description (line 349) → `Closes` line via `tracker.linkFormat`.
  - Vault-resolution boilerplate on the `muninn_recall` site stays (D12 — recall remains).
  - Verification: patterns 1, 2 of no-leak test do not match.

- [ ] **Task 1.2.4**: Refactor `src/instructions/execute.md` Step 6
  - Files: `packages/luca-mastracode/src/instructions/execute.md`
  - Pre-commit guard untouched (Phase B's `assert-not-default`).
  - Step 6 Pre-commit recall (line 388-395): KEEP recall (D4). Insert `consult-section('commits', fallback:true)` BEFORE recall — gets types/scopes/trailers/subjectMaxLength.
  - Commit template (line 407): replace hardcoded `Refs: #<issue-number>` with `<commits.trailers.issueRef><issue-number>` (luca-framework's seeded value is `Closes #` + issue → `Closes #42`; keeping `Refs: #` would conflict with `tracker.linkFormat`'s `Closes #{issue}`. D6 retained the distinction in CONTEXT.md but iteration 1 review surfaced no concrete consumer needing differentiation. Use `commits.trailers.issueRef` here for consistency).
  - Types enum (line 409): replace with reference to `commits.types ?? branching.types` (G-ARCH-SCOPE-001 fallback strategy: prefer `commits.types`; fall back to `branching.types`).
  - Verification: pattern 1 of no-leak test does not match this file.

- [ ] **Task 1.2.5**: Audit + edit `commands/gh-pr-address.md`, `commands/milestone-new.md`, `commands/repo-cleanup.md`
  - Files: `packages/luca-mastracode/commands/gh-pr-address.md` (line ~128 prescriptive "conventional commit message" → replace with consult reference); `commands/milestone-new.md` and `commands/repo-cleanup.md` audit-only — only edit if hardcoded scope/title-format found via grep.
  - Verification: no-leak test passes for `commands/` (note: test only scans `rules/`, `skills/`, `src/instructions/` per Task 1.1.4 spec — explicitly excludes `commands/` since slash-commands are project-local-by-design and contain legitimate framework refs in install scripts).

- [ ] **Task 1.2.6**: Flip `no-luca-leak.test.ts` from `test.todo` to active
  - Files: `packages/luca-mastracode/src/__tests__/no-luca-leak.test.ts`
  - Replace `test.todo` with active `test()` body implementing the three patterns + allowlist from Task 1.1.4. After all preceding Wave-2 tasks land, this test passes.
  - Verification: `bun test no-luca-leak.test.ts` PASSES. `bun test` overall green.

## Verification Criteria

1. `bun test` in `packages/luca-mastracode` green; ≥3 new tests added (extended-schema parse, mode-coverage, no-leak).
2. `tsc --noEmit` clean.
3. `git ls-files .planning/preferences.json` returns the file (committed).
4. Reading `.planning/preferences.json` and parsing via `ProjectPreferencesSchema` produces an object containing `pr.titleTemplate`, `pr.forbidden`, `pr.titleExamples`, `tracker.linkFormat`, `commits.trailers.issueRef`, `commits.subjectMaxLength`.
5. `MODE_PERMISSIONS.plan.projectPreferences === ['consult','consult-section']`.
6. `muninn_read("01KR1BMR4M1M6MR496C80KC6WS")` returns updated content with new fields; ULID preserved.
7. No-leak test green: zero matches of patterns 1/2/3 across `rules/`, `skills/`, `src/instructions/`.

## Risks & Mitigations

- **Schema parse breakage on existing seeded preferences** — additive schema extension is non-breaking; existing files lacking new fields parse fine (all new fields optional).
- **muninn_evolve preserves provenance** — chosen over re-`remember` to keep ULID `01KR1BMR4M1M6MR496C80KC6WS` and entity links intact. If evolve fails (e.g. memory soft-deleted), fall back to `muninn_remember` with explicit acceptance of new ULID and `muninn_forget(01KR...)`.
- **alwaysApply rule still fails in non-registered consumer modes** — `plan` mode now registered; `preferences-mode-coverage.test.ts` catches future regressions for stock modes. Custom consumer modes that skip `projectPreferences` will hit the `fallback:true` graceful-degradation path: tool absent → message logged → agent proceeds with hardcoded fallback in prose.
- **No-leak test false negatives** — patterns are anchored; only matches the exact enum-list-with-pipe form, the exact `feat(mastracode): vX.Y.Z #N` example, and the bump-prose form. Future hardcodes in different forms could slip through; acceptable trade-off vs Iteration-1 false-positive rate.
- **`commits.trailers.issueRef` vs `tracker.linkFormat` confusion** — schema JSDoc clarifies: `issueRef` is the prefix for **commit trailers** (`Closes #` + number → `Closes #42`); `linkFormat` is the **PR-body template** (`Closes #{issue}` with `{issue}` substituted). luca-framework intentionally uses the same string for both — consumers may differ.
