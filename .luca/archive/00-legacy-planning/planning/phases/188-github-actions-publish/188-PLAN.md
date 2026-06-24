# Phase 188: GitHub Actions Publish Workflow

## Objective

Automate npm publishing of `@alecsibilia/luca-framework` when a GitHub release is created, ensuring type safety via pre-publish typecheck and secure authentication via repository secrets.

## Requirements

- **REQ-13**: GitHub Actions workflow must auto-publish to npm on GitHub release (type: published)
- **REQ-14**: Publish workflow must run typecheck (`bunx --bun tsc --noEmit`) before publishing
- **REQ-15**: Publish workflow must use `NPM_TOKEN` repository secret for authentication
- **REQ-16**: Publish workflow must publish with `--access restricted` flag

## Context

- Package: `@alecsibilia/luca-framework` at `packages/luca-framework/`
- Current version: 2.4.0
- Package has `prepublishOnly` script that builds before publish
- Monorepo uses Bun as runtime and package manager

## Tasks

### Task 1: Create publish workflow and npmrc

Create `.github/workflows/publish.yml` with:

- Trigger: `release.types: [published]`
- Steps: checkout, setup-bun, install, typecheck, publish
- Auth: `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`
- Flag: `--access restricted`

Create `packages/luca-framework/.npmrc` for registry auth token mapping.

### Task 2: Create plan and summary documentation

Create `188-PLAN.md` and `188-SUMMARY.md` in `.planning/phases/188-github-actions-publish/`.

## Verification

- [ ] `.github/workflows/publish.yml` exists with correct trigger and steps
- [ ] `packages/luca-framework/.npmrc` maps `NODE_AUTH_TOKEN` to npm registry
- [ ] Typecheck step runs before publish step
- [ ] `--access restricted` flag is present on publish command
- [ ] No new TypeScript errors introduced

## Success Criteria

- Workflow will trigger on any GitHub release creation
- Typecheck gates publishing (fails fast if types are broken)
- NPM_TOKEN secret provides authentication
- Package publishes with restricted access
