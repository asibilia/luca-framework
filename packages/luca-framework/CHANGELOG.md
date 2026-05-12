# @alecsibilia/luca-framework

## 11.9.0-alpha.3

## 11.9.0-alpha.2

## 11.8.2-alpha.1

## 11.8.2-alpha.0

## 11.8.1

## 11.8.0

## 11.7.0

### Patch Changes

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

## 11.3.0-alpha.0

## 11.2.1

## 11.2.0

## 11.1.2

### Patch Changes

- 125364b: Bump mastra packages to latest: @mastra/core ^1.30.0, @mastra/memory ^1.17.4, mastracode ^0.16.2

## 11.1.1

### Patch Changes

- efcc377: Harden the `/pr-address` command with three new defensive steps that wire into the existing `prReview` tool, plus a small grammar fix in the caveman skill.

  **`/pr-address` enhancements** (`.mastracode/commands/pr-address.md`):
  - **Step 1.5 — Filter Stale Comments.** Calls `prReview(action: "filter-stale", ...)` immediately after fetching PR comments. Comments whose cited code has been rewritten, removed, or relocated by more than 5 lines are bucketed as `stale` and skipped from categorization; the agent posts a reply pointing at the addressing commit instead of treating them as actionable. Prevents wasted iteration cycles on already-fixed feedback.
  - **Step 2.5 — Detect Cross-Perspective Convergence.** Calls `prReview(action: "detect-convergence", findings, lineTolerance: 2)` over the categorized comments combined with findings from other perspectives (claim-verifier output, reviewer-agent MUST-FIX/SHOULD-FIX entries). When two or more independent reviewers flag the same location, severity is auto-promoted to **must-fix** regardless of original category. Surfaces convergence count in the audit summary.
  - **Step 7 — Iteration-N Regression Check.** Snapshots `iterationStartSha` at Step 1, then after fixes are pushed re-fetches comments and runs `prReview(action: "regression-check", before, after, fromSha, toSha)`. New findings introduced by fix commits block iteration completion and re-enter Step 3 (Plan Fixes) with the regressions as input. Cycle is bounded: 3 consecutive failed iterations escalate to the user. Catches fix-induced regressions that would otherwise only surface in the next review pass.
  - Old "Step 7 — Store Learnings" renumbered to Step 8.

  **Caveman skill** (`.mastracode/skills/caveman/SKILL.md`): single-word grammar fix in the destructive-op resume example to match caveman speech pattern (`exists` → `exist`).

## 11.1.0

### Minor Changes

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

### Patch Changes

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

### Patch Changes

- a4c94f2: Republish to actually exercise OIDC trusted publishing end-to-end.

  Root cause for the long string of `ENEEDAUTH` failures (v11.0.4 through v11.0.7) was finally pinned down by comparing against another repo where OIDC publishing is known to work: the npm Trusted Publisher for `@alecsibilia/luca-framework` is configured with **Environment name: `npm-publish`**, but the publish job in `.github/workflows/release.yml` did not declare `environment: npm-publish`. Because the OIDC token GitHub Actions mints only carries an `environment` claim when the job declares an environment, the token had no environment claim, npm rejected the token exchange, and per [npm/cli#9088](https://github.com/npm/cli/issues/9088) the CLI surfaced that silent rejection as the misleading `ENEEDAUTH`.

  Add `environment: npm-publish` to the publish job. Single-line change. Everything else (Trusted Publisher repo, workflow filename, `id-token: write` permission, `repository.url` in `package.json`, removal of stale `.npmrc`) is already correct from earlier rounds.

## 11.0.7

### Patch Changes

- 2b612ee: Republish to exercise the OIDC publish pipeline now that the npm-side configuration is correct.

  The OIDC publish job has been failing since v11.0.4. The most recent run (v11.0.6) made it through pack and provenance signing, then died with the misleading `npm error code ENEEDAUTH`. Root cause turned out to be on the npm side: the Trusted Publisher on `npmjs.com` was configured for `alecsibilia/luca-framework` (the npm scope name), but the actual GitHub repo is `asibilia/luca-framework`. The OIDC token from GitHub Actions carried `repository: asibilia/luca-framework` as a claim, which never matched the trusted-publisher config, so npm refused the token exchange. Per [npm/cli#9088](https://github.com/npm/cli/issues/9088), the npm CLI surfaces silent OIDC failures as `ENEEDAUTH`, which is what we kept seeing.

  This release also fixes a separate, smaller bug in `packages/luca-framework/package.json`: `repository.url` was pointing at `https://github.com/alecsibilia/luca-framework.git` (extra `lec`) when it should be `https://github.com/asibilia/luca-framework.git`. With the trusted-publisher config now matching the real repo, npm's provenance step would have validated the package's `repository.url` against that config on the next attempt and rejected it with a 422 — fixing the typo here pre-empts that.

## 11.0.6

### Patch Changes

- 8a3bd90: Republish to fix the OIDC publish job, which failed at the registry `PUT` on v11.0.5 (provenance was signed and pushed to sigstore, but the tarball never landed).

  The publish step runs `cd packages/luca-framework && npm publish ./.pack/*.tgz`, and **two** sources were injecting `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into the npm config:
  1. `actions/setup-node` was configured with `registry-url: https://registry.npmjs.org`, which makes setup-node write that auth-token line into the runner-level `.npmrc`.
  2. `packages/luca-framework/.npmrc` was checked into the repo (a leftover from the original token-based publish workflow) with the same line.

  With no real `NPM_TOKEN` provided, `NODE_AUTH_TOKEN` resolved to setup-node's literal placeholder (`XXXXX-XXXXX-XXXXX-XXXXX`). npm uses **any** configured `_authToken` in preference to OIDC trusted publishing — so it tried to authenticate with the placeholder and got back `404 Not Found - PUT https://registry.npmjs.org/@alecsibilia%2fluca-framework`.

  The fix removes both sources:
  - Drop `registry-url` from `actions/setup-node` so it doesn't write the runner-level `.npmrc`.
  - Delete `packages/luca-framework/.npmrc`. It was added in 2024 to wire up token-based publishing in CI and is obsolete under OIDC trusted publishing — local development doesn't need it either.

  With no `_authToken` configured at publish time, npm falls through to OIDC: it exchanges the GitHub Actions ID token via the configured Trusted Publisher and publishes normally. npm's default registry is `https://registry.npmjs.org/` anyway.

## 11.0.5

### Patch Changes

- debef3e: Republish to fix the OIDC publish job, which failed on the previous release (v11.0.4 was tagged on GitHub but never reached npm).

  The publish job was running on Node 22 and trying to globally upgrade the bundled npm (10.9.x) to satisfy trusted publishing's 11.5.1+ requirement. The in-place self-upgrade left module resolution in a broken state (`Cannot find module 'promise-retry'`). It turns out the entire Node 22 LTS line never crossed into npm 11.x — the highest bundled npm there is 10.9.7. Bump the runner to Node 24 LTS, which ships with npm 11.12.x out of the box, and drop the manual npm upgrade entirely.

## 11.0.4

### Patch Changes

- 456e7bc: Publish `@alecsibilia/luca-framework` with public access, and migrate the release pipeline to npm OIDC trusted publishing.
  - The package was being re-marked private on every release: `.github/workflows/release.yml` invoked `bun publish --access restricted` and `.changeset/config.json` had `"access": "restricted"`. Both flip to `public`, and `packages/luca-framework/package.json` now sets `publishConfig.access: "public"` as a defense-in-depth default.
  - The publish job no longer uses a long-lived `NPM_TOKEN` secret. It authenticates via GitHub Actions OIDC against the npm Trusted Publisher configured for this package, and emits signed provenance attestations on every release.
  - Because `bun publish` does not yet support npm OIDC ([oven-sh/bun#22423](https://github.com/oven-sh/bun/issues/22423)), the publish step packs the tarball with `bun pm pack` (which resolves `catalog:` and `workspace:*` protocols) and hands the resulting tarball to `npm publish --provenance`.

## 11.0.3

### Patch Changes

- f3bbb39: Re-publish to ship the DX audit refactor of the bundled `luca-mastracode` harness — extraction of `index.ts` into focused modules (`branding`, `rules-loader`, `agent-constraints`, `create-static-agent`, `install-bundled-assets`, `continuation-messages`, `tui-text-helpers`, `mastracode-config`, `launch`), splits of `tools/run-checks.ts` and `tools/repo-cleanup.ts`, and review-feedback fixes for `applyGitignore` whole-line matching and `graphemeWidth` emoji coverage.

  The previous release of these changes only bumped `luca-mastracode`, but `luca-mastracode` is `private: true` and bundled into the framework tarball at build time, so the published `luca-framework` artifact never picked them up. With the new `fixed` config in `.changeset/config.json`, this changeset bumps both packages together so the framework actually ships the refactored harness.

## 11.0.2

### Patch Changes

- 6cf154d: Sync TUI status bar model display with our dynamic mode model resolution.

  The mastracode harness persists per-mode model IDs in thread settings and a model pack system. Our custom pipeline modes (luca:discuss, luca:1-triage through luca:6-finalize) are not part of any model pack, so the TUI status bar would show stale model IDs after upgrades — even though API calls were correctly using the dynamic model resolver and sending the right model.

  Now we call `harness.switchModel()` on every `mode_changed` event with the result of our resolver function, forcing the harness internal state (and status bar display) to stay in sync with what we send to the API.

  The mode-to-model mapping is restricted to custom `luca:*` pipeline modes only — stock modes (`build` / `plan` / `fast`) intentionally remain on the mastracode model-pack system so the user's `/models` selection is preserved.

  Also includes a workaround for an upstream `@mastra/core@1.28.0` bug where `LocalFilesystem.writeFile()` rethrows `FileNotFoundError` from its `expectedMtime` precheck for new files (the upstream `isEnoentError` check compares `err.code === 'ENOENT'` but the custom error has no `code` property). We catch the precheck failure and fall back to calling the workspace filesystem's `writeFile()` directly. Tracked in #173 alongside any other upstream workarounds.

## 11.0.1

### Patch Changes

- 6e8e5b7: Upgrade default model from Claude Opus 4.6 to Claude Opus 4.7 across all model routing and mode configurations.

  **Changed files:**
  - `model-routing.ts` — `capable` tier now resolves to `anthropic/claude-opus-4-7`
  - `modes/build.ts` — `resolveBuildModel()` and `defaultModelId`
  - `modes/architect.ts` — `defaultModelId`
  - `modes/execute.ts` — `defaultModelId`

## 11.0.0

### Major Changes

- Version jump from 10.0.5 → 11.0.0 to escape the version namespace collision with old `luca-mastracode`-era releases. Between April 9–18, the old `publish.yml` workflow derived the npm version from the GitHub release tag name. Releases created for the internal `luca-mastracode` package (v10.1.0–v10.3.2) inadvertently published `@alecsibilia/luca-framework` at those same version numbers. Versions 10.1.0 through 10.3.2 are permanently claimed on npm. Starting fresh at 11.0.0 avoids any future collisions.

### Minor Changes

- 83e9a22: Add a `move-batch` action to the `manageTodos` tool so multiple todos can be transitioned between `pending` / `backlog` / `done` in a single, index-shift-safe call.

  Previously, marking N todos done required N sequential `move` calls. The numeric `#index` on each todo is reassigned every time the backlog is listed (order is `pending → backlog → done`), so as soon as the first item moves, every later index in the agent's plan now points at a different todo. Agents would either silently mark the wrong items done, or have to fall back to per-item slug lookups.

  Changes:
  - New `manageTodos(action: "move-batch", items: [{ identifier, targetStatus }, …])` action. Identifiers may be numeric indices or slug strings; mixing is allowed. All identifiers are resolved against a single backlog snapshot before any filesystem moves run, so the indices captured from a prior `list` remain valid for the entire batch.
  - New `moveBatch({ items })` export from `src/todos.ts`. Returns both `moved` and `missing` so callers can surface partial-success errors instead of aborting.
  - `assignBatch` now delegates to `moveBatch`, making it index-shift-safe as well.
  - Updated execute / finalize mode instructions and the README tool table to recommend `move-batch` whenever multiple todos change status.

## 10.0.5

### Patch Changes

- fa66b1c: Bump `luca-mastracode` runtime dependencies to their latest releases in the workspace catalog.

  Picks up the `claude-opus-4-7` sampling-parameter fix in `@ai-sdk/anthropic@3.0.71` (transitive via `mastracode`), which strips the harness's default `temperature: 1` before calling the Anthropic API. Without this, Opus 4.7 rejects requests with a 400 (`temperature is deprecated for this model`).

  Upgraded catalog entries:
  - `@mastra/core`: `^1.26.0` → `^1.28.0`
  - `@mastra/libsql`: `^1.8.1` → `^1.9.0`
  - `@mastra/memory`: `^1.15.1` → `^1.17.1`
  - `mastracode`: `^0.15.0` → `^0.15.2`

## 10.0.4

### Patch Changes

- c78a645: Consolidate the release + npm publish pipeline into a single workflow.

  The previous setup split the flow across two workflows: `release.yml` created the GitHub Release, and `publish.yml` listened for `release: published` and pushed to npm. That chaining never fired, because GitHub intentionally suppresses downstream workflow triggers for events created by the default `GITHUB_TOKEN` — a recursion-prevention measure. The result: GitHub releases were being cut for every merged Version PR, but nothing ever reached npm.
  - Merged the publish job into `release.yml` as a dependent job gated on the changesets action's `published` output.
  - Deleted `publish.yml`.
  - Updated `.github/scripts/create-release.ts` to emit the `New tag: <pkg>@<version>` line that `changesets/action` parses out of the publish command's stdout to set `published=true`.
  - Disabled the action's built-in `createGithubReleases` behavior so it doesn't duplicate what `create-release.ts` already does (custom `vX.Y.Z` tag format + CHANGELOG-sourced release notes).

## 10.0.3

### Patch Changes

- bc599e6: Bundle the `luca-mastracode` harness into the framework's published tarball.

  Fixes `luca run` for users who install `@alecsibilia/luca-framework` from npm. Previously the command tried to resolve the harness at `$CWD/node_modules/@alecsibilia/luca-mastracode/…`, but that package is intentionally private and is never published, so the harness was never present on disk and `luca run` bailed with "Could not locate luca-mastracode harness."
  - Added a `build:done` hook to `build.config.ts` that copies the sibling `luca-mastracode` package (`src/`, `commands/`, `rules/`, `skills/`) into `dist/mastracode/`, preserving the layout the harness expects from `import.meta.url`.
  - Added the harness's runtime deps (`@mastra/core`, `@mastra/libsql`, `@mastra/memory`, `mastracode`) to the framework's `dependencies` so they resolve from the framework's own install.
  - Reworked `run.ts` installed-mode resolution to point at `<luca-framework>/dist/mastracode/src/index.ts` via a new `resolveFrameworkPackageRoot()` helper, instead of the user's cwd `node_modules`. Workspace/dev resolution is unchanged.

## 10.0.2

### Patch Changes

- def291d: Update harness lookup path and adopt repo-wide eslint config.
  - `luca run` now resolves the mastracode harness at `node_modules/@alecsibilia/luca-mastracode/...` (the harness package was renamed from `luca` to `@alecsibilia/luca-mastracode`). Workspace and global installs that previously fell through to the old path will now find the harness correctly.
  - Added per-package `eslint.config.mjs` extending the new root config (typescript-eslint recommended, prettier with 4-space indent, no semicolons, single quotes, `import/order`). All source files were reformatted accordingly via `bun run lint:fix` — purely cosmetic, no behavior change.
  - Added `lint` and `lint:fix` scripts to the package.
