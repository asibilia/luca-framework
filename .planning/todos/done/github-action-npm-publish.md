---
title: GitHub Action to auto-publish @alecsibilia/luca-framework to npm on release
area: ci-cd
created: 2026-03-17
source: conversation
---

## Context

Successfully published `@alecsibilia/luca-framework` to private npm registry (`--access restricted`). Currently publishing is manual via `bun run publish:framework`. Want to automate this so new releases trigger a publish automatically.

## Task

Set up a GitHub Actions workflow that auto-publishes the `packages/luca-framework` sub-package to npm whenever a new GitHub release is created.

- Workflow triggers on `release` event (type: `published`)
- Uses `NPM_TOKEN` secret (user will create and add to repo secrets)
- Runs `bun install`, builds, and publishes with `--access restricted`
- Should version-bump the package (or use the release tag version)
- Consider: should the workflow also run typecheck before publishing?

## Notes

- Package is ESM-only (no CJS output)
- Build uses `unbuild` via `bun run build`
- `prepublishOnly` script handles build automatically
- Bun runtime required (not Node)
- The monorepo root is `private: true`; only the sub-package publishes
