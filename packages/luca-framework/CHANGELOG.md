# @alecsibilia/luca-framework

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
