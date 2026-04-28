# @alecsibilia/luca-framework

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
