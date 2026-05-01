# @alecsibilia/luca-mastracode

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
