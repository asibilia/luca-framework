# Plan 57-C: Absorb create-luca and Remove Old Packages

## Objective

Remove the create-luca package (already just a wrapper) and remove the empty luca-state package.

## Tasks

### 1. Remove create-luca package

The create-luca package just re-exports `runInit` from luca-framework. Its functionality is already in the `luca init` command. Remove the entire `packages/create-luca/` directory.

### 2. Remove luca-state package (after files moved)

Remove the now-empty `packages/luca-state/` directory.

### 3. Update root workspace

Update root package.json workspaces field if needed (it's `["packages/*"]` so it auto-discovers — but verify no issues with removed packages).

### 4. Update bun.lock

Run `bun install` to regenerate the lock file with the updated workspace.

## Verification

- Only `packages/luca-framework/` remains as a workspace package
- `bun install` succeeds
- No broken imports
