# @alecsibilia/luca-mastracode

## 11.9.0-alpha.4

### Patch Changes

- 2fecc3f: Add subagent invocation telemetry (`subagent.invoke` / `subagent.complete` kinds).
  - New `record-subagent` workflowState action with Zod-validated schema (role, correlationId, tokens, durationMs, success, model)
  - `clampTokens` helper: non-finite/negative/>10M values coerced to null; zero preserved
  - Prose instrumentation in all 5 spawn-site instruction files (execute, architect, research, review, finalize)
  - `shared-prefix.ts`: subagents self-report usage via `<!-- usage: {...} -->` comment
  - Length caps on role (64), correlationId (128), model (64) to preserve PIPE_BUF atomicity
  - 8 new tests (record-subagent action) + 5 presence-scan tests (subagent-telemetry-prose.test.ts)

## 11.9.0-alpha.3

### Patch Changes

- 60f5b25: Add `mode.start` / `mode.end` telemetry records emitted from `switch-mode` in `workflow-state.ts`. Captures outer pipeline loop durations (triage, research, architect, execute, review, finalize) that were missing from the v1 telemetry foundation (PR #239). Extends `TelemetryRecord.kind` union, adds `currentModeStartedAt` to `LucaWorkflowState`.

## 11.9.0-alpha.2

### Minor Changes

- 4448b79: Add per-phase wave duration telemetry — foundation for the Wave 1 telemetry program.

  `workflowState` now emits structured JSONL records at phase/wave boundaries to `.planning/telemetry/<runId>.jsonl`. Four event kinds at v1 schema: `phase.start`, `wave.start`, `wave.end`, `phase.end`. Each record carries `runId`, phase name + slug, wave number, complexity, oversight, and `durationMs` on closing events.

  New module `src/state/telemetry.ts` exports:
  - `appendTelemetry(kind, meta?, overrides?)` — fail-safe writer, never throws
  - `buildTelemetryRecord(...)` — pure record builder
  - `readTelemetry(runId)` — per-run reader with Zod validation
  - `TelemetryRecord` + `TelemetryRecordSchema` — locked v1 contract for follow-on consumers

  Also: `PhaseResult.waveStartedAt` tracks wave start time across `startPhase` (new + RESUME branches) and `advanceWave`. `ROOT_WHITELIST_DIRS` now includes `'telemetry'`.

  This is the foundation for 4 follow-on telemetry todos (subagent invocation costs, `muninn_recall` hit/miss, review iteration convergence, cross-run aggregator skill).

## 11.8.2-alpha.1

### Patch Changes

- 6b7c02d: Add `/memory-audit` skill — paginated LLM-judged retro pass over MuninnDB vault.
  - New `skills/memory-audit/SKILL.md` walks the active vault via hybrid pagination (`muninn_get_enrichment_candidates` cursor + semantic recall complement), judges each engram against the trust-tier discipline, and applies corrections via `muninn_trust`.
  - New `commands/memory-audit.md` slash command shim with `--dry-run` (default), `--apply`, `--vault`, `--resume`, `--limit`, `--auto` flags.
  - Resumable cursor state at `.planning/audits/memory/state.json`; per-run reports at `.planning/audits/memory/<ISO>.md`.
  - `repo-cleanup.ts` ROOT_WHITELIST_DIRS now includes `audits` so complete-phase doesn't flag the audit directory.
  - Hard prohibition on 11 MuninnDB write/mutation tools (`muninn_remember`, `muninn_remember_batch`, `muninn_forget`, `muninn_consolidate`, `muninn_evolve`, `muninn_link`, `muninn_state`, `muninn_decide`, `muninn_add_child`, `muninn_remember_tree`, `muninn_restore`) enforced by a fenced block and asserted by tests — audit only mutates trust tier via `muninn_trust`.

## 11.8.2-alpha.0

### Patch Changes

- 3289efa: Add write-time trust-tier discipline at all `muninn_remember` callsites. New `MEMORY_TIER_DISCIPLINE` constant (single source of truth) is injected into both the mode-agent prefix (`agent-constraints.ts`) and the subagent prefix (`subagents/shared-prefix.ts`). Verified-tier writes get an explicit `muninn_trust` follow-up via the 2-RPC pattern (`muninn_remember` returns id → `muninn_trust(id, "verified", vault)`). Three prose-snapshot tests guard the contract: `memory-tier-prefix` (constant + dual injection), `memory-tier-callsite` (every `muninn_remember(` site has a tier marker within 30 lines preceding), and `memory-tier-verified-followup` (every verified marker has a `muninn_trust(` follow-up within 50 lines).

## 11.8.1

### Patch Changes

- baa11d9: Add `/luca-init` slash command shim. The `luca-init` skill (added in v11.7.0) was previously not invocable via slash command despite its description claiming otherwise. This adds the missing `commands/luca-init.md` shim so users can activate the skill with `/luca-init`.

## 11.8.0

### Minor Changes

- 4779294: **Phase C: PR/Release/Commit Conventions Consult Preferences**

  Replace luca-framework-specific PR/release/commit conventions hardcoded across rules, skills, and instruction files with `projectPreferences.consult-section()` calls. Extend `ProjectPreferencesSchema` additively with 9 new optional fields for PR templates, commit conventions, and tracker link formats.

  ### Deliverables
  - Schema extension with 9 new optional fields for PR, commits, and tracker sections
  - Mode registration — plan stock mode now registered with consult/consult-section actions
  - Seeded preferences — .planning/preferences.json committed with canonical Zod-valid field names
  - Prose refactor across rules/pr-title-format.md, skills/gh-prepare/SKILL.md, instruction files, and commands/gh-pr-address.md
  - Extended tests with schema roundtrip parse, mode-coverage, and no-luca-leak grep assertions
  - Boilerplate elimination — vault-resolution prose deduped via tool encapsulation

  ### Key Patterns
  - consult(fallback: true) returns full preferences
  - consult-section(fallback: true) returns one section with graceful-degradation
  - Schema and memory field names must match exactly
  - alwaysApply rules must verify target mode is registered

  ### Impact

  Framework-distributed files can now be deployed to projects with different PR/release/commit conventions without forking the codebase.

## 11.7.0

### Minor Changes

- 5dff46a: Project preferences foundation: consult conventions instead of hardcoded defaults

  ## What's new
  - **projectPreferences Mastra tool** — actions: `consult`, `consult-section`, `seed`, `update` for reading and seeding project conventions (branching strategy, commit convention, PR title format, release tool, issue tracker kind) to local cache.
  - **luca-init skill** — probing wizard that runs on first triage when preferences not yet seeded. Detects branching/commit/release conventions from git history, asks user to confirm, seeds to local cache and MuninnDB.
  - **ProjectPreferencesSchema (Zod)** — structured type with sections: branching (types, template, default, guarded branches), commits (convention, scopes), pr (titleFormat, baseBranch), release (tool, versionBump), tracker (kind, issuePrefix). All fields optional with sensible defaults.
  - **Triage sentinel (Step 1.6)** — new early step in triage mode calls `projectPreferences(action: 'consult', fallback: false)`. If prefs missing and `preferencesSeeded !== true`, invokes `/luca-init` skill. Otherwise proceeds to complexity classification.
  - **Vault helper** — moved `sanitizeVaultName()` to shared mastracode package, both packages import from there. `resolveProjectVault()` reads vault name from config with fallback.

  ## Key design decisions
  1. **Loop-safe consult**: after successful seed, `preferencesSeeded: true` flag ensures that if the on-disk preferences file is removed or unparseable, consult returns `DEFAULT_PREFERENCES` instead of `null`, preventing infinite re-init loops.
  2. **Tool vs skill division**: Tool manages local cache and `preferencesSeeded` state flag (TS layer). Skill handles all MuninnDB I/O and user interaction (agent layer), since tools cannot invoke MCP.
  3. **Backward compat**: `DEFAULT_PREFERENCES.branching.types` matches existing `BRANCH_TYPES` array from ensure-feature-branch.ts; `consult(fallback: true)` returns these defaults when no prefs file exists, so existing repos continue to work.
  4. **Security**: all free-form preference fields (branching template, commit scopes, PR title format, etc.) that flow into agent instructions are validated against allowlist regex (alphanumeric + whitespace + structural punctuation, max 64 chars). Prevents prompt injection from malicious git history in cloned repos.

  ## Files changed

  New:
  - `packages/luca-mastracode/src/state/vault.ts` — vault resolution helpers
  - `packages/luca-mastracode/src/state/project-preferences.ts` — schema, defaults, load/write
  - `packages/luca-mastracode/src/tools/project-preferences.ts` — consult/seed/update actions
  - `packages/luca-mastracode/skills/luca-init/SKILL.md` — detection and seeding skill
  - `packages/luca-mastracode/src/__tests__/project-preferences.test.ts` — comprehensive test coverage including sentinel-loop safety

  Modified:
  - `packages/luca-framework/src/utils/vault-setup.ts` — re-export sanitizeVaultName from mastracode
  - `packages/luca-mastracode/src/tools/tool-manifest.ts` — register projectPreferences with mode-scoped permissions
  - `packages/luca-mastracode/src/tools/index.ts` — export projectPreferences tool
  - `packages/luca-mastracode/src/instructions/triage.md` — inject Step 1.6 sentinel
  - `packages/luca-mastracode/src/state/luca-store.ts` — add preferencesSeeded field to LucaWorkflowState
  - `packages/luca-framework/src/commands/init.ts` — document /luca-init skill in help text
  - `README.md` — add /luca-init reference

  ## Review notes

  Phase A passed 2 code review iterations:
  - Iteration 1: 5 MUST-FIX findings (prompt-injection hardening, type safety, runtime scope guard). All resolved in commit 5443aad92.
  - Iteration 2: clean gate, all MUST-FIX verified resolved, no regressions.

  Tests: 133/133 pass, tsc clean, rule gate clean. Phase B (branching policy refactor) and Phase C (PR/release/commit conventions) build on this foundation.

- 5dff46a: Phase B — branching policy refactor (consult preferences + PT-12458 fix)

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

## 11.6.0

### Minor Changes

- 0f8a3eb: Harden feature-branch creation so the pipeline can never commit directly to the default branch.
  - **New `ensureFeatureBranch` tool** with `status` / `create` / `rename` actions. `create` switches to `<type>/<issue>-<slug>` from the default branch, validates against local + remote name collisions, and persists `branchName` + `issueNumber` to `luca-state.json`. Default-branch detection prefers `origin/HEAD` and falls back to `main`/`master`/`trunk`.
  - **Architect Step 1** now calls `ensureFeatureBranch({ action: "create", ... })` instead of relying on the agent to shell out to `git switch -c` correctly.
  - **Executor pre-commit guard**: before the first commit of a session, the executor calls `ensureFeatureBranch({ action: "status" })` and aborts with `BRANCH_NOT_CREATED` if HEAD is on the default branch or detached. Catches every regression where Architect Step 1 is skipped (e.g. fast-mode shortcuts).
  - **Finalize pre-push guard**: before pushing and opening the PR, finalize re-runs the status check so a draft PR can never be opened against the default branch.
  - **Co-Authored-By trailer** changed from `Luca <noreply@luca.dev>` (domain doesn't resolve, breaks GitHub linkback) to `Claude <noreply@anthropic.com>` until the `luca.dev` domain is owned and wired up.
  - **Pre-commit MuninnDB recall hook** in the executor subagent and `instructions/execute.md` Step 6, so prior commit-related learnings (message conventions, trailer format, files to exclude) are surfaced before staging.
  - **Pre-changeset MuninnDB recall hook** in `instructions/finalize.md` Step 5b.1 and the `gh-prepare` skill, so prior changeset-authoring learnings (frontmatter shape, bump-level rules, package-name canonicalisation) are surfaced before writing the changeset.

## 11.5.0

### Minor Changes

- a3fcbdc: feat(pipeline): write run artifacts into `.planning/phases/<slug>/` instead of top-level

  Introduces phase-scoped artifact storage. All session artifacts (PLAN.md, CONTEXT.md, RESEARCH.md, REVIEW-\*.md, POSTMORTEM.md, CONFIDENCE-JOURNAL.md, verification-result.json, SUGGESTED-RULES.md, checks-convergence.json) now write to `.planning/phases/<phaseSlug>/` instead of `.planning/`. Cross-phase state (luca-state.json, ROADMAP.md, todos/, session-ledger.jsonl, routing-history.jsonl, verification-history.jsonl) stays at the `.planning/` root.

  **New module**: `util/phase-paths.ts` — single source of truth for all `.planning/` path computations. Exports `phaseDir`, `phasePath`, `deriveSlug`, `resolveAvailableSlug`, and 10 root path constants.

  **State schema**: `currentPhaseSlug?: string` added to `LucaWorkflowState`. Derived at triage from intent + ticket ID, immutable once set, survives mode transitions.

  **Migration**: existing repos with loose `.planning/` artifacts can run `workflowState(action: "archive-loose")` to move them into a phase directory. The finalize `complete-phase` action now blocks if straggler artifacts are detected at the root.

  **Security**: `claim-verifier.ts` `resolveArtifactPath` hardened — traversal guard runs before `existsSync` to prevent normalised-escape bypass; absolute-path inputs constrained to repo boundary.

  Closes #220

## 11.4.1

### Patch Changes

- f926b83: Fix: custom slash commands followed by multi-line pasted text no longer fail with "Unknown command". Upstream's slash dispatcher parses with a single-line regex (`/^(\/\/?)(.*)$/`, no `s` flag), so any newline in the input caused the regex to miss and the dispatcher fell through to the unknown-command branch. Added an upstream patch that monkey-patches `tui.handleSlashCommand` to collapse newline-spanning whitespace in slash inputs to single spaces before dispatch — matches the behavior of `processSlashCommand`'s `args.join(' ')` arg substitution, so no information is lost.

## 11.4.0

### Minor Changes

- db859c3: Refactor: zero-footprint bundled assets — commands/skills are now symlinked from the package instead of copied into the user's repo, and rules are read directly from the package with no install step at all.

  **Before**: every fresh `luca run` copied ~60 framework files (commands/, skills/, rules/) into the user's `.mastracode/` directory. Updates required re-running luca to propagate.

  **After**: only 2 symlinks land in `.mastracode/` (commands → `<pkg>/commands`, skills → `<pkg>/skills`). Rules read from `<pkg>/rules/` directly via the `rules-loader.ts` fallback. Updates are automatic via `npm update -g`.
  - `installRules()` removed entirely — `loadAlwaysApplyRules()` already falls back to the bundled rules dir when `.mastracode/rules/` doesn't exist
  - `installSlashCommands()` and `installSkills()` rewritten to use `symlinkSync` with idempotent re-runs and migration from legacy real-directory installs
  - Windows: uses `'junction'` symlink type for directories (no admin/Developer Mode required)
  - Failure modes wrapped with `console.warn` so install errors don't abort startup

  Toward zero-footprint bundled assets (#213). Upstream limitations that prevent fully eliminating the symlinks are tracked in #173.

### Patch Changes

- db859c3: Fix: Move `installSlashCommands()`, `installSkills()`, and `installRules()` to before `createMastraCode()` in launch.ts so harness workspace scanners see bundled assets on the very first `luca run` in a fresh cwd. Closes #212.

## 11.4.0-alpha.0

### Minor Changes

- db859c3: Refactor: zero-footprint bundled assets — commands/skills are now symlinked from the package instead of copied into the user's repo, and rules are read directly from the package with no install step at all.

  **Before**: every fresh `luca run` copied ~60 framework files (commands/, skills/, rules/) into the user's `.mastracode/` directory. Updates required re-running luca to propagate.

  **After**: only 2 symlinks land in `.mastracode/` (commands → `<pkg>/commands`, skills → `<pkg>/skills`). Rules read from `<pkg>/rules/` directly via the `rules-loader.ts` fallback. Updates are automatic via `npm update -g`.
  - `installRules()` removed entirely — `loadAlwaysApplyRules()` already falls back to the bundled rules dir when `.mastracode/rules/` doesn't exist
  - `installSlashCommands()` and `installSkills()` rewritten to use `symlinkSync` with idempotent re-runs and migration from legacy real-directory installs
  - Windows: uses `'junction'` symlink type for directories (no admin/Developer Mode required)
  - Failure modes wrapped with `console.warn` so install errors don't abort startup

  Toward zero-footprint bundled assets (#213). Upstream limitations that prevent fully eliminating the symlinks are tracked in #173.

### Patch Changes

- db859c3: Fix: Move `installSlashCommands()`, `installSkills()`, and `installRules()` to before `createMastraCode()` in launch.ts so harness workspace scanners see bundled assets on the very first `luca run` in a fresh cwd. Closes #212.

## 11.3.0

### Minor Changes

- e1f2021: Restructure package internals and upgrade mastracode to v0.17.0.

  **Refactoring:**
  - Reorganize `src/` root (28 files → 6 layered subdirectories: `state/`, `orchestration/`, `analysis/`, `integration/`, `util/`, `constants/`)
  - Rename `pr-review/` → `review-analysis/`, `rules/` → `rule-engine/`; add barrel exports
  - Consolidate `build-mode-tools.ts` + `mode-permissions.ts` → `tool-manifest.ts` (single source of truth for all 15 tools and per-mode permissions)
  - Extract upstream patches and read-only enforcement from `launch.ts` into dedicated modules (`launch.ts` reduced from 1185 → 700 lines)

  **Dependencies:**
  - Upgrade `mastracode` 0.16.2 → 0.17.0, `@mastra/core` 1.30.0 → 1.31.0, `@mastra/libsql` 1.9.0 → 1.9.1
  - Migrate `authStorage` API: removed from `LaunchOptions`, now retrieved via `harness.getAuthStorage()`

  **Documentation:**
  - Add package `README.md` (dual-layer pattern guide, directory map, add-tool/add-mode checklists)
  - Add `ARCHITECTURE.md` (layer dependency graph, subdirectory inventory, design decisions)

## 11.3.0-alpha.0

### Minor Changes

- e1f2021: Restructure package internals and upgrade mastracode to v0.17.0.

  **Refactoring:**
  - Reorganize `src/` root (28 files → 6 layered subdirectories: `state/`, `orchestration/`, `analysis/`, `integration/`, `util/`, `constants/`)
  - Rename `pr-review/` → `review-analysis/`, `rules/` → `rule-engine/`; add barrel exports
  - Consolidate `build-mode-tools.ts` + `mode-permissions.ts` → `tool-manifest.ts` (single source of truth for all 15 tools and per-mode permissions)
  - Extract upstream patches and read-only enforcement from `launch.ts` into dedicated modules (`launch.ts` reduced from 1185 → 700 lines)

  **Dependencies:**
  - Upgrade `mastracode` 0.16.2 → 0.17.0, `@mastra/core` 1.30.0 → 1.31.0, `@mastra/libsql` 1.9.0 → 1.9.1
  - Migrate `authStorage` API: removed from `LaunchOptions`, now retrieved via `harness.getAuthStorage()`

  **Documentation:**
  - Add package `README.md` (dual-layer pattern guide, directory map, add-tool/add-mode checklists)
  - Add `ARCHITECTURE.md` (layer dependency graph, subdirectory inventory, design decisions)

## 11.2.1

### Patch Changes

- 523448a: Fix gh-prepare skill spec: use defaultBranch variable consistently, add branch-f reset after checkout, replace brittle ls|grep with find, align frontmatter with draft PR behavior

## 11.2.0

### Minor Changes

- 6c98787: New skills (gh-prepare, gh-issue-triage, grill-me, bug-diagnose), gh-\* naming consolidation, and vertical slice guidance in architect/execute modes

## 11.1.2

## 11.1.1

### Patch Changes

- efcc377: Harden the `/pr-address` command with three new defensive steps that wire into the existing `prReview` tool, plus a small grammar fix in the caveman skill.

  **`/pr-address` enhancements** (`.mastracode/commands/pr-address.md`):
  - **Step 1.5 — Filter Stale Comments.** Calls `prReview(action: "filter-stale", ...)` immediately after fetching PR comments. Comments whose cited code has been rewritten, removed, or relocated by more than 5 lines are bucketed as `stale` and skipped from categorization; the agent posts a reply pointing at the addressing commit instead of treating them as actionable. Prevents wasted iteration cycles on already-fixed feedback.
  - **Step 2.5 — Detect Cross-Perspective Convergence.** Calls `prReview(action: "detect-convergence", findings, lineTolerance: 2)` over the categorized comments combined with findings from other perspectives (claim-verifier output, reviewer-agent MUST-FIX/SHOULD-FIX entries). When two or more independent reviewers flag the same location, severity is auto-promoted to **must-fix** regardless of original category. Surfaces convergence count in the audit summary.
  - **Step 7 — Iteration-N Regression Check.** Snapshots `iterationStartSha` at Step 1, then after fixes are pushed re-fetches comments and runs `prReview(action: "regression-check", before, after, fromSha, toSha)`. New findings introduced by fix commits block iteration completion and re-enter Step 3 (Plan Fixes) with the regressions as input. Cycle is bounded: 3 consecutive failed iterations escalate to the user. Catches fix-induced regressions that would otherwise only surface in the next review pass.
  - Old "Step 7 — Store Learnings" renumbered to Step 8.

  **Caveman skill** (`.mastracode/skills/caveman/SKILL.md`): single-word grammar fix in the destructive-op resume example to match caveman speech pattern (`exists` → `exist`).

- efcc377: Remove dead writeFileTool FileNotFoundError patch from launch.ts

  The patch targeted an upstream `@mastra/core@1.28.0` bug where `FileNotFoundError`
  lacked a `code` property, causing `isEnoentError()` to fail during the `expectedMtime`
  precheck for new file writes. This bug was fixed in `@mastra/core@1.29.0` — both
  installed versions (1.29.0 and 1.29.1) have the fix. The patch's fallback path was
  also broken (AI SDK never populates `context.workspace`), making it fully dead code.

## 11.1.0

### Minor Changes

- 9579c69: Defend against doc-claim drift — when changesets, PR bodies, and PLAN.md cite symbols, file paths, or quantitative counts that don't match the shipped code.

  **New `claimVerifier` tool** (`tools/claim-verifier.ts`, `claim-verifier.ts`) — extracts factual claims from any text artifact:
  - `symbol` — backtick-wrapped identifiers (`` `myFunction` ``)
  - `file-path` — repo-relative paths matching common project layouts
  - `quantitative` — `<N> <countable-noun>` patterns from a small allow-list of countable nouns

  For each claim, it greps the working tree (`git grep --untracked` for tracked + new files; filesystem fallback for non-git repos) and reports failures with stable evidence strings. Tolerance ±1 on quantitative counts. 30s total budget, 5s per claim, with timeout failures explicit.

  Three actions:
  - `verify-text` — verify an inline string (e.g. PR body draft).
  - `verify-file` — verify a file on disk (resolves to repo root, then `.planning/`).
  - `gate` — verify multiple inputs; returns `code: "CLAIM_VERIFICATION_FAILED"` if any input has unverifiable claims.

  Every call appends a `claim-verifier-run` ledger event for postmortem visibility.

  **Finalize integration** (`instructions/finalize.md`):
  - **Step 3c** (PLAN.md reconciliation) — runs `claimVerifier(action: "verify-file", path: ".planning/PLAN.md")` during gap detection; failures attached to _complete_ tasks block re-entry to execute, failures on incomplete tasks are allowed.
  - **Step 5b.1** (write release artifacts AFTER review iteration converged) — moves changeset/release-note authoring to _after_ the final review iteration. Writing release artifacts before this point is the upstream cause of doc-drift; only the post-convergence tree is a trustworthy source for descriptions of shipped work.
  - **Step 5b.2** (verify artifact claims) — runs `claimVerifier(action: "gate", paths: [...], texts: [...])` over the changeset and PR body draft before `gh pr create`. The gate blocks the PR until every cited symbol, path, and count is verified against the working tree.

  **Review-mode advisory** (`instructions/review.md`) — non-blocking self-check: reviewers may run `claimVerifier(action: "verify-text", ...)` over their own MUST-FIX/SHOULD-FIX entries to catch hallucinated symbols early.

  **Mode permissions** (`tools/mode-permissions.ts`):
  - `luca:5-review`: `verify-text`, `verify-file` (advisory).
  - `luca:6-finalize`: full access (gate before PR).

  Catches the failure class where changesets cite renamed/removed symbols, design docs drift from shipped code, or PR bodies describe quantities that don't match the diff — failure modes that previously were only caught post-merge by reviewers.

- 9579c69: Harden the `/pr-address` command loop against three measured failure modes: stale Copilot comments, missed cross-perspective convergence, and fixes that introduce new regressions.

  **Stale-comment filter** (`pr-review/stale-filter.ts`)

  Across the PR-review corpus, ~57% of inline comments on iterated PRs are stale — they cite code that has already been changed by an earlier fix iteration. Treating them as still-actionable burns iteration cycles and produces confused replies.

  The filter classifies each comment by re-reading the cited file, parsing the `diff_hunk`, and locating the post-state anchor lines in the current working tree. A comment is stale when:
  - The cited file no longer exists.
  - The diff hunk's anchor lines (context + added) cannot be found within ±50 lines of the cited line.
  - The anchor location has drifted by more than 5 lines.
  - The cited commit_id is older than HEAD AND the path was modified between commit_id and HEAD AND fewer than 85% of anchors match.

  Verified on PR #195 (which had fixes pushed after Copilot's review): correctly classified 9 of 10 comments as stale and left 1 still-actionable.

  **Cross-perspective convergence** (`pr-review/convergence.ts`)

  Today, when Copilot, the reviewer agent, and the project's claim verifier each flag the same line, the harness treats the three findings as independent SHOULD-FIX items. They should be MUST-FIX.

  The detector groups findings by `(path, line ± lineTolerance)`. Findings authored by ≥2 distinct perspectives in the same group get severity promoted to `must-fix`. Findings already at must-fix are tagged with `must-fix-converged` for evidence rendering. Single-perspective groups are pass-through.

  **Iteration-N regression check** (`pr-review/regression.ts`)

  Catches the case where a fix commit introduces a new finding — currently, that's only detected on the _next_ review pass, costing another iteration cycle.

  Given pre-iteration findings, post-iteration findings, and the list of paths the iteration touched (or `fromSha`/`toSha` to compute it), the check returns:
  - `regressions` — new findings on touched paths, or severity escalations of persistent findings
  - `resolved` — findings present before, gone after (the iteration's wins)
  - `unchanged` — present in both
  - `newButUntouched` — new findings on paths the iteration didn't modify (likely external; not blocking)

  Any regressions block iteration completion and re-enter the fix loop.

  **Tool surface** (`tools/pr-review.ts`)

  New `prReview` Mastra tool with three actions: `filter-stale`, `detect-convergence`, `regression-check`. Every call appends a `pr-review-run` ledger event for postmortem visibility. Available in `build` and `fast` modes (where slash commands run).

  **`/pr-address` integration** (`commands/pr-address.md`)
  - Step 1.5: filter stale comments before categorization.
  - Step 2.5: detect convergence and promote severity before planning fixes.
  - Step 7: regression check after push, blocking iteration completion if fixes introduced new findings. Bounded retry (3 iterations) before escalating to user.

  The command also now snapshots the iteration-start SHA at Step 1 so the regression check can compute the precise iteration delta.

- 9579c69: Add a repo-local rule-pack engine plus recurrence-driven rule suggestion. Closes the gap between "we keep flagging this in PR review" and "we have a machine-checkable invariant."

  **Why**

  Repos accumulate "house rules" that exist only in PR-review folklore — Convex anti-patterns, auth invariants, internal RPC conventions, naming rules. These get caught manually in every PR review, forever, because there is no encoding for them outside of human memory.

  This phase ships the engine. Zero domain rules ship in `luca-mastracode` itself — every rule is repo-local in `.luca/rules/*.ts`.

  **Engine: `defineRule` + runner**
  - `rules/define-rule.ts` — author API. `defineRule({ id, severity, description, scope, category, exclude, check })`. Schema validates id and check function at definition time.
  - `rules/runner.ts` — discovery and execution.
    - Walks `.luca/rules/` recursively for `*.ts`/`*.mts`/`*.js`/`*.mjs` files (skips `.test.ts`, `.spec.ts`, dotfiles, `node_modules`).
    - Dynamically imports each file and pulls every `RuleDefinition` from default + named exports + arrays.
    - Resolves `scope` globs via `Bun.Glob`, applies `exclude`, builds one `RuleFile` per candidate.
    - Calls `rule.check(file)` and collects `RuleFinding[]`.
  - Hybrid `RuleFile` API: `content: string` for cheap regex checks, lazy `ast(): ts.SourceFile | null` for AST-level matching.
    - AST parse is cached per file across rules (multiple rules processing the same file pay parse cost once).
    - `typescript` is loaded via `createRequire` at call time — repos without `typescript` installed get `ast() === null` and regex-only rules keep working.
  - Resilience: rule throws are caught and reported as `RuleExecutionError`; rule-file syntax errors are caught and reported as `RuleLoadError`. A single broken rule never crashes the run.
  - Findings are typed compatibly with `pr-review/convergence.ts`'s `ReviewFinding`, so rule output flows through the existing convergence detector as a first-class reviewer perspective.

  **Tool: `runRules`**

  Four actions:
  - `list` — discover rules and return their metadata without executing them.
  - `run` — execute all rules; non-blocking; returns the full report.
  - `gate` — execute and block (`success: false`, `code: RULE_VIOLATIONS_DETECTED`) when any finding has severity `must-fix`.
  - `suggest` — see "Recurrence-driven promotion" below.

  Every call appends a `rules-run` ledger event. Available in `build`, `fast`, `luca:4-execute`, `luca:5-review`, `luca:6-finalize` modes.

  **Recurrence-driven promotion: `rules/recurrence.ts`**

  The hard part of a rule engine is not running rules — it's deciding what rules to write. This module surfaces candidates.
  - Iterates every available run (current + archived) via `listRuns()`/`listArchivedRuns()` + `analyzeRun()`.
  - Groups violations by `ViolationCode`, counts the number of _distinct runs_ each code appeared in (not total occurrences — a single noisy run shouldn't promote a rule).
  - Codes meeting `threshold` (default 3) are flagged as recurring.
  - For each, renders a draft `.luca/rules/<slug>.ts` template with the rule scaffolding, sample violation message in a comment, and TODO matcher body.
  - Renders the full set to a `SUGGESTED-RULES.md` artifact under the planning directory for human review.

  Drafts are **never** auto-applied. Generated rules are inevitably approximate; auto-applying would produce false-positive overload. The user reads the rendered file, decides which patterns are mechanically detectable, fills in the matcher, and commits.

  **Mode integration**
  - `instructions/execute.md` — new Step 2.5 runs `runRules(gate)` after `runChecks` reports `resolved`, before `Verify`. Must-fix rule findings block wave advance. Tool Coordination updated to reflect the new gate.
  - `instructions/finalize.md` — new Step 4.5 runs `runRules` with the `suggest` action after the postmortem gate, advisory only. The Tool Coordination sequence numbers up by one.

  **Verification**
  - Type check clean.
  - Build clean.
  - Smoke tests pass:
    - Two-rule fixture (regex `no-todo`, AST `no-any`): correctly identified findings on dirty fixture, none on clean.
    - Throwing rule: surfaced in `executionErrors`, did not affect other rules.
    - Syntax-broken rule file: surfaced in `loadErrors`, runner continued.
    - Recurrence detection on the framework's own ledger: 0 recurring pitfalls (expected — postmortem is clean), markdown renderer correctly returned the empty-state message.

- 9579c69: Close the silent-skip hole in full-auto pipeline runs (the incident where execute mode didn't fire but finalize moved every todo to `done`).

  **Hard gates** — bad state transitions are now blocked at the tool layer, not just by LLM instructions:
  - `workflowState(complete-phase)` rejects with `EMPTY_PHASE_BLOCKED` when a phase has zero file changes and zero commits and no `phase-empty-justification` ledger entry exists. New `justify-empty-phase` action lets the agent declare an intentional no-op (e.g. docs-only-in-MuninnDB).
  - `workflowState(advance-wave)` rejects with `WAVE_ADVANCE_NO_VERIFICATION` when no `verification-result.json` exists for the current wave.
  - `manageTodos(move|move-batch → done)` requires a `verificationRef` pointing to a passing criterion in `verification-history.jsonl`; rejects with `TODO_DONE_UNVERIFIED` otherwise.

  **Diff-based phase proof** (`phase-diff.ts`) snapshots the working tree at `start-phase` and computes the diff at `complete-phase`, surfacing it via the new `phase-diff-summary` ledger event.

  **Run identity & archiving** (`session-ledger.ts`) — every ledger entry is now stamped with a per-run `runId`. Pipeline reset archives prior `session-ledger.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl`, and `routing-history.jsonl` to `.planning/runs/<priorRunId>/`.

  **Postmortem analyzer & gate** (`postmortem.ts`, `tools/run-postmortem.ts`) — new `runPostmortem` Mastra tool with `analyze | render | gate | list-runs` actions. Reads the four append-only JSONL artifacts and produces a structured report covering empty phases, unverified todo completions, forced transitions, low-confidence decisions, missing wave verifications, pipeline re-entries, and idle-bypass anomalies. Returns pre-formatted MuninnDB pitfall payloads for the agent to forward to the `default` vault so future runs can recall recurring failure modes.

  **Finalize wiring** — new Step 4.5 "Postmortem Gate" calls `runPostmortem(action: "gate")` before PR creation; critical violations block the PR and re-enter the pipeline. Step 6 calls `runPostmortem(action: "render")` to write `.planning/POSTMORTEM.md` for the PR body.

  **Pipeline guard idle-bypass logging** (`pipeline-guard.ts`) — when the guard bypasses enforcement because `pipelineStep === 'idle'` or is missing, it now emits a one-time-per-turn `pipeline-guard-idle-bypass` ledger event so postmortem can surface stale-state contamination. Previously this bypass was silent.

  **`luca retro` CLI** — new command prints `.planning/POSTMORTEM.md` (or lists archived runs under `.planning/runs/` with `--list`) so users can inspect retrospective reports without launching the harness.

  **Stale verification-result.json hardening** — `archivePriorRun()` now also moves `.planning/verification-result.json` (not just JSONL histories) so a prior run's PASS snapshot can't satisfy the new run's wave/phase guards. Belt-and-braces: results are now stamped with `runId` on write, and `readVerificationResult()` returns `null` when the stamped runId doesn't match the current run — so the silent-skip hole stays closed even if reset wasn't called between runs.

## 11.0.10

### Patch Changes

- 058b0c6: Bump bundled `mastracode` from `^0.15.2` to `^0.16.0` and align peer Mastra versions to match.

  `mastracode@0.16.0` pins `@mastra/core@1.29.0`, `@mastra/libsql@1.9.0`, and `@mastra/memory@1.17.2`. Our catalog ranges (`@mastra/core: ^1.28.0`, `@mastra/memory: ^1.17.1`) were satisfied by the older pins, which caused Bun to keep two copies of `@mastra/core` in `node_modules` after upgrading mastracode and produced TS2322 `Agent<...>` identity errors in `launch.ts` (different `Agent` classes from `1.28.0` vs `1.29.0`). Bumping the catalog ranges to `^1.29.0` / `^1.17.2` deduplicates the install and restores a clean `tsc --noEmit`.

  **Heads up for consumers — new transitive Mastra packages:** `mastracode@0.16.0` also pulls in `@mastra/duckdb@1.2.0` and `@mastra/observability@1.10.1` as new transitive dependencies. `@mastra/duckdb` brings the `@duckdb/node-api` native binding, which increases install footprint and means the harness now has a platform-native dependency — installs will need to resolve a prebuilt DuckDB binary for the host (or fall back to building one). `@mastra/observability` is pure JS and has no native deps. No action is required from `@alecsibilia/luca-framework` consumers, but expect a slightly larger `node_modules` and an extra postinstall step on first install of `@alecsibilia/luca-mastracode`.

## 11.0.9

### Patch Changes

- 8223e89: docs: correct READMEs across the monorepo
  - Rewrite `packages/luca-framework/README.md` (the npm-facing README) — replace fake `bun x create-luca` install command with the real `bun add -g @alecsibilia/luca-framework`, align the description with what the CLI actually does, and add a complete CLI Reference (`init`, `vault:init`, `run`, `doctor`, `version`).
  - Fix root `README.md` tool count (10 → 11, added missing `confidenceJournal`), document the previously-missing `luca doctor` and `luca version` commands, and clarify the difference between global `luca run` and in-repo `bun run mastracode`.
  - Replace `docs/README.md` with an index that matches actual file contents (most prior links pointed to non-existent docs).
  - Update `packages/luca-studio/lib/README.md` to include the 6 files added since it was last updated (`compile-events.ts`, `file-watcher.ts`, `git-types.ts`, `muninn-helpers.ts`, `observation-helpers.ts`, `request-guards.ts`).

## 11.0.8

## 11.0.7

## 11.0.6

## 11.0.5

## 11.0.4

## 11.0.3

### Patch Changes

- f3bbb39: Re-publish to ship the DX audit refactor of the bundled `luca-mastracode` harness — extraction of `index.ts` into focused modules (`branding`, `rules-loader`, `agent-constraints`, `create-static-agent`, `install-bundled-assets`, `continuation-messages`, `tui-text-helpers`, `mastracode-config`, `launch`), splits of `tools/run-checks.ts` and `tools/repo-cleanup.ts`, and review-feedback fixes for `applyGitignore` whole-line matching and `graphemeWidth` emoji coverage.

  The previous release of these changes only bumped `luca-mastracode`, but `luca-mastracode` is `private: true` and bundled into the framework tarball at build time, so the published `luca-framework` artifact never picked them up. With the new `fixed` config in `.changeset/config.json`, this changeset bumps both packages together so the framework actually ships the refactored harness.

## 10.5.0

### Minor Changes

- 5aedce5: Subagents now inherit MCP tools from the harness's `mcpManager`.

  Previously, mode agents merged MCP tools (firecrawl, muninn, etc.) at request time via `mcpManagerRef` in `create-static-agent.ts`, but subagents (researcher, executor, planner, …) only saw the static `tools` field on their `HarnessSubagent` definition — which was empty. Skills loaded into the subagent prompt referenced tools the subagent couldn't actually call, so e.g. `firecrawl_search` invocations hung indefinitely and `muninn_*` calls silently no-op'd.

  Each opted-in subagent now exposes a Proxy on `definition.tools` that forwards `ownKeys` / `getOwnPropertyDescriptor` / `get` / `has` to `mcpManager.getTools()`. The harness materializes tools at subagent execute time via `{ ...definition.tools }`, so the Proxy resolves to whatever MCP servers are connected at that moment — no init-timing race with mastracode's own `tui.init()` MCP wire-up, no startup delay, and mid-session MCP reloads are reflected automatically.

  Inheriting subagents: `researcher`, `discussion`, `planner`, `executor`, `verifier`, `reviewer`, `learner`. Filesystem-only subagents (`plan-reviewer`, `shadow-scanner`) keep their narrower toolset.

### Patch Changes

- 5aedce5: Refactor luca-mastracode internal module layout from the DX audit. No behavior changes — pure mechanical extraction.

  `src/index.ts` had grown to 1,869 lines containing nine distinct concerns despite the convention that `index.ts` should only re-export. The entry point is now a 62-line shim (executable boot sequence + public API barrel), with implementation split across:
  - `branding.ts` — `loadBranding`, `resolveLucaVersion`
  - `rules-loader.ts` — alwaysApply rule frontmatter parsing/loading
  - `agent-constraints.ts` — `CORE_OPERATING_RULES`, `HARD_CONSTRAINTS`, `RECENCY_REMINDERS`, `getAgentConstraints`
  - `create-static-agent.ts` — Mode agent factory
  - `install-bundled-assets.ts` — `installSlashCommands` / `installSkills` / `installRules`
  - `continuation-messages.ts` — `buildContinuationMessage`
  - `mastracode-config.ts` — Settings path + pack-model resolution
  - `tui-text-helpers.ts` — ANSI / grapheme / visible-width helpers
  - `launch.ts` — `main()` orchestration + monkey-patches

  Two oversized tools were also split:
  - `tools/run-checks.ts` (484 → 169 lines) → `check-runner.ts` (subprocess execution), `check-parsers.ts` (fingerprinting), `check-convergence.ts` (iteration state tracking)
  - `tools/repo-cleanup.ts` (315 → 197 lines) → `cleanup-report.ts` (shadow-scan output validation), `cleanup-fixes.ts` (delete/move/gitignore remediations)

  Finally, the four duplicate-named module pairs (`confidence-journal`, `session-ledger`, `verification-result`, `shadow-scanner`) now carry 2-line header comments on the wrapper file pointing back to the data layer, so it's instantly obvious which side owns the schemas vs. the tool/subagent definition.

## 10.4.3

### Patch Changes

- b9cd777: Workaround for upstream `mastracode@0.15.2` bug: long `ask_user` option labels crashed the TUI.

  The inline `AskQuestionInlineComponent` does not wrap or truncate option labels, so any caller-supplied label wider than the bordered box's inner width tripped pi-tui's `Rendered line N exceeds terminal width` assertion in `doRender()` and killed the entire `luca run` process. The question text on the same component IS wrapped via `wrapTextWithAnsi`, so this is just a missing wrap step on the option labels (`chunk-YEHNNDZZ.js:88-99`).

  After constructing `MastraTUI` we wrap `state.pendingAskUserComponents.set` so the first time mastracode registers a streaming `ask_user` instance we capture its constructor and monkey-patch `prototype.updateArgs` and `prototype.activate` to truncate any `option.label` whose visible width would overflow the current terminal (matching pi-tui's `cols - TERM_WIDTH_BUFFER(3) - box(4) - prefix(3) - headroom(1)` budget; appends `…`). Idempotent via `Symbol.for('luca.ask_user.label_truncate')`. Patch errors are logged but never block the question dialog.

  Long labels now render visibly clipped instead of crashing the process. Tracked in #173 alongside any other upstream workarounds.

## 10.4.2

### Patch Changes

- 6cf154d: Sync TUI status bar model display with our dynamic mode model resolution.

  The mastracode harness persists per-mode model IDs in thread settings and a model pack system. Our custom pipeline modes (luca:discuss, luca:1-triage through luca:6-finalize) are not part of any model pack, so the TUI status bar would show stale model IDs after upgrades — even though API calls were correctly using the dynamic model resolver and sending the right model.

  Now we call `harness.switchModel()` on every `mode_changed` event with the result of our resolver function, forcing the harness internal state (and status bar display) to stay in sync with what we send to the API.

  The mode-to-model mapping is restricted to custom `luca:*` pipeline modes only — stock modes (`build` / `plan` / `fast`) intentionally remain on the mastracode model-pack system so the user's `/models` selection is preserved.

  Also includes a workaround for an upstream `@mastra/core@1.28.0` bug where `LocalFilesystem.writeFile()` rethrows `FileNotFoundError` from its `expectedMtime` precheck for new files (the upstream `isEnoentError` check compares `err.code === 'ENOENT'` but the custom error has no `code` property). We catch the precheck failure and fall back to calling the workspace filesystem's `writeFile()` directly. Tracked in #173 alongside any other upstream workarounds.

## 10.4.1

### Patch Changes

- 6e8e5b7: Upgrade default model from Claude Opus 4.6 to Claude Opus 4.7 across all model routing and mode configurations.

  **Changed files:**
  - `model-routing.ts` — `capable` tier now resolves to `anthropic/claude-opus-4-7`
  - `modes/build.ts` — `resolveBuildModel()` and `defaultModelId`
  - `modes/architect.ts` — `defaultModelId`
  - `modes/execute.ts` — `defaultModelId`

## 10.4.0

### Minor Changes

- 7dca589: Add Confidence Journal to the execute step

  Introduces a running confidence journal that tracks decision-making certainty during execution. When an executor encounters ambiguity, makes on-the-fly decisions, or lacks sufficient plan detail, it logs a structured entry with a confidence score, category, alternatives considered, and risk assessment.
  - New backing module (`confidence-journal.ts`) with append-only JSONL storage and Markdown rendering
  - New `confidenceJournal` tool with actions: `log`, `read`, `summary`, `render`
  - Execute mode has full access; Review gets `read`/`summary`; Finalize gets `read`/`summary`/`render`
  - Executor subagent instructions updated with confidence logging guidelines
  - Execute mode instructions updated with when/how to log and Learn step integration
  - Review mode now loads the journal and prioritizes review of low-confidence areas
  - Human-readable `.planning/CONFIDENCE-JOURNAL.md` auto-generated with summary table and grouped entries
