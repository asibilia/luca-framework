# @alecsibilia/luca-mastracode

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
