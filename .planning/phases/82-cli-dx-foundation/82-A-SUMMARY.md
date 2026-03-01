# Phase 82-A: CLI/DX Foundation - Execution Summary

**Status:** Complete
**Branch:** 36--v2.5.0-operational-intelligence
**GitHub Issue:** #36

## Tasks Completed

### Task 1: Create `bun luca status` command

- Created `packages/luca-framework/src/commands/status.ts`
- Reads manifest, displays version/stack/harnesses/workTracker/file counts
- Supports `--json` flag for CI pipelines
- Exits code 1 if not a Luca project
- Registered in `packages/luca-framework/src/index.ts` subCommands

### Task 2: Replace node-version check with bun-runtime check

- Created `packages/luca-framework/src/utils/doctor/checks/bun-runtime.ts`
- Checks `Bun.version >= 1.0.0` with semver comparison
- Deleted `packages/luca-framework/src/utils/doctor/checks/node-version.ts`
- Updated `checks/index.ts` and `doctor/index.ts` imports

### Task 3: Add per-harness file validation and drift detection

- Enhanced `harness-installation.ts` with `HARNESS_FILES` map for key file checks
- Created `packages/luca-framework/src/utils/doctor/checks/drift-detection.ts`
- Drift check compares manifest hashes against current file state
- Reports modified/deleted files as warnings with fix suggestions
- Registered in `checks/index.ts` and `doctor/index.ts`

### Task 4: Create progressive config presets

- Added `PresetId` type (`"starter" | "standard" | "full"`) to `types.ts`
- Added `preset?: PresetId` field to `LucaConfig` interface
- Created `packages/luca-framework/src/utils/presets.ts` with:
  - `PRESETS` record with starter/standard/full configurations
  - `VALID_PRESETS` array for validation
  - `DEFAULT_PRESET` constant ("standard")
  - `getPresetDefaults()` function returning safe copies
- Integrated preset selection into wizard flow (between stack and harness steps)
- Pre-fills harness defaults from selected preset
- Exported `PresetId` from `packages/luca-framework/src/index.ts`

### Task 5: Wire preset into init and update commands

- Added `--preset` / `-p` arg to init command
- Updated `createConfigFromArgs()` to accept, validate, and apply preset defaults
- Preset defaults flow to harnesses and workTracker when not explicitly overridden
- Added `--preset` / `-p` arg to update command for post-init preset changes
- Update command validates preset and applies defaults to config before scaffolding

### Task 6: Add tests

- `__tests__/packages/luca-framework/src/commands/status.test.ts` (6 tests)
- `__tests__/packages/luca-framework/src/utils/doctor/checks/bun-runtime.test.ts` (4 tests)
- `__tests__/packages/luca-framework/src/utils/presets.test.ts` (16 tests)
- Deleted obsolete `node-version.test.ts`
- All 26 tests pass, `tsc --noEmit` clean

## Files Created

| File                                                                            | Description                  |
| ------------------------------------------------------------------------------- | ---------------------------- |
| `packages/luca-framework/src/commands/status.ts`                                | Status command               |
| `packages/luca-framework/src/utils/doctor/checks/bun-runtime.ts`                | Bun runtime doctor check     |
| `packages/luca-framework/src/utils/doctor/checks/drift-detection.ts`            | Drift detection doctor check |
| `packages/luca-framework/src/utils/presets.ts`                                  | Progressive config presets   |
| `__tests__/packages/luca-framework/src/commands/status.test.ts`                 | Status command tests         |
| `__tests__/packages/luca-framework/src/utils/doctor/checks/bun-runtime.test.ts` | Bun runtime tests            |
| `__tests__/packages/luca-framework/src/utils/presets.test.ts`                   | Presets tests                |

## Files Modified

| File                                                                      | Change                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/luca-framework/src/index.ts`                                    | Added status subCommand, exported PresetId                                |
| `packages/luca-framework/src/types.ts`                                    | Added PresetId type, preset to LucaConfig                                 |
| `packages/luca-framework/src/utils/wizard.ts`                             | Added preset imports, wizard step, createConfigFromArgs preset support    |
| `packages/luca-framework/src/commands/init.ts`                            | Added --preset arg                                                        |
| `packages/luca-framework/src/commands/update.ts`                          | Added --preset arg with validation and config override                    |
| `packages/luca-framework/src/utils/doctor/index.ts`                       | Replaced nodeVersionCheck with bunRuntimeCheck, added driftDetectionCheck |
| `packages/luca-framework/src/utils/doctor/checks/index.ts`                | Updated barrel exports                                                    |
| `packages/luca-framework/src/utils/doctor/checks/harness-installation.ts` | Added HARNESS_FILES map and file checks                                   |

## Files Deleted

| File                                                                             | Reason                          |
| -------------------------------------------------------------------------------- | ------------------------------- |
| `packages/luca-framework/src/utils/doctor/checks/node-version.ts`                | Replaced by bun-runtime.ts      |
| `__tests__/packages/luca-framework/src/utils/doctor/checks/node-version.test.ts` | Replaced by bun-runtime.test.ts |

## Test Results

```
26 pass, 0 fail, 64 expect() calls
Ran 26 tests across 3 files. [36.00ms]
tsc --noEmit: clean (0 errors)
```

## Deviations from Plan

- None. All 6 tasks executed as specified.
