# Plan 75-A: Update Command & Doctor

## Objective

Make `update.ts` harness-aware (collect per-harness templates during update), populate harnesses field in manifest, add per-harness verification to doctor.

## Tasks

### T1: Update manifest.ts to store harnesses

- `createManifest()` should accept and store `config.harnesses` in the manifest

### T2: Make update.ts harness-aware

- `getNewFrameworkFiles()`: Loop over `config.harnesses` to collect templates from `templates/harness/{id}/`
- Config construction: Include `harnesses` from manifest (fallback to `["claude", "cursor"]`)
- `updateManifestAfterUpdate()`: Preserve harnesses field in updated manifest

### T3: Add per-harness doctor check

- New check: `harness-installation.ts` in `utils/doctor/checks/`
- For each harness in manifest: verify directory exists, core subdirs present, hook scripts executable
- Register in `doctor/index.ts`

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun test` passes
- Manifest now includes harnesses field

## Requirements Addressed

R5.1, R5.2, R5.3
