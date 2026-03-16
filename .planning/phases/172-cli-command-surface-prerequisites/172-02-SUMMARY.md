# Plan 172-02 Summary: Wire New Commands into CLI and Restructure Init

## Status: COMPLETE

## Tasks Completed

| #   | Task                                                       | Commit      | Status |
| --- | ---------------------------------------------------------- | ----------- | ------ |
| 1   | Register vault:init, reinit, version subcommands in cli.ts | `e0e7d806`  | Done   |
| 2   | Restructure init.ts as global setup orchestrator           | `23a2751e`  | Done   |
| 3   | Verify export contract preservation                        | (read-only) | Done   |

## Changes Made

### Files Modified (2)

- **`packages/luca-framework/src/cli.ts`** -- Added 3 new subcommand entries (`vault:init`, `reinit`, `version`) to the `subCommands` object, placed after `init` and before `update`. No changes to `runMain` or `runInit` exports.

- **`packages/luca-framework/src/commands/init.ts`** -- Complete restructure from per-project wizard to global setup orchestrator:
  - Removed old args: quick, config, name, prefix, stack, tracker, harness, preset, no-tour
  - Added new args: `skip-prerequisites`, `skip-vault`
  - New flow: intro -> detectRuntimeContext -> checkPrerequisites -> promptBunInstall (if needed) -> ensureLucaHome -> success message -> suggest vault:init
  - Removed `hasLuca` guard (now lives in vault-init.ts)
  - Preserved `initCommand` and `runInit` exports (contract intact)

### Export Contract Verification

| Export        | Source                        | Consumer           | Status    |
| ------------- | ----------------------------- | ------------------ | --------- |
| `initCommand` | init.ts                       | cli.ts subCommands | Preserved |
| `runInit`     | init.ts -> cli.ts -> index.ts | bin/luca.js        | Preserved |
| `runMain`     | cli.ts -> index.ts            | bin/luca.js        | Preserved |

### CLI Subcommand Count

- **Before**: 7 subcommands (init, update, status, doctor, add-skill, run:claude, run:cursor)
- **After**: 10 subcommands (init, vault:init, reinit, version, update, status, doctor, add-skill, run:claude, run:cursor)

## Verification Results

- `bunx --bun tsc --noEmit`: Zero new errors (4 pre-existing errors in `dist/plugin/scripts/` unrelated to this plan -- they require `bun run build:all` to resolve)
- `git diff --stat`: Only expected files modified (`cli.ts`, `init.ts`)
- Export chain: index.ts -> cli.ts -> init.ts fully intact

## Deviations

None. All tasks executed as planned with no deviations.

## Notes

- The 4 pre-existing TypeScript errors in `dist/plugin/scripts/` are from generated output that needs `bun run build:all` to regenerate. Per project rules, `build:all` is not run during agent sessions.
- Wave 1 files (vault-init.ts, reinit.ts, version.ts, runtime-context.ts, prerequisites.ts, luca-home.ts) were already committed and available for import.
