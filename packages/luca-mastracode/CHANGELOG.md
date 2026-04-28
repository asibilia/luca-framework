# @alecsibilia/luca-mastracode

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
