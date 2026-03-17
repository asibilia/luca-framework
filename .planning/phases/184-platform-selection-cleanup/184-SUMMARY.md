# Phase 184 Summary: Platform Selection Cleanup

## Objective

Remove Cursor and Pi platform options from the wizard, presets, file generation, and type definitions so that Claude is the sole supported harness platform.

## Tasks Completed

### Task 1: Remove platform multiselect from wizard and hardcode Claude

- **Commit:** `5c45b1d2`
- **File:** `packages/luca-framework/src/utils/wizard.ts`
- Reduced `VALID_HARNESSES` to `["claude"]` only
- Changed `DEFAULT_HARNESSES` from `["claude", "cursor"]` to `["claude"]`
- Removed the interactive harness multiselect prompt from `runWizard()`; hardcoded `harnesses: ["claude"]`
- Updated `loadConfigFromFile()` default comment

### Task 2: Update preset defaults to Claude-only

- **Commit:** `8bba7582`
- **File:** `packages/luca-framework/src/utils/presets.ts`
- Changed `standard` preset harnesses from `["claude", "cursor"]` to `["claude"]`
- Changed `full` preset harnesses from `["claude", "cursor", "pi"]` to `["claude"]`
- Updated preset descriptions to reference "Claude Code" instead of multi-platform names
- Updated `getPresetDefaults()` JSDoc example

### Task 3: Remove non-Claude directory creation and hook installation

- **Commit:** `d9c08375`
- **File:** `packages/luca-framework/src/utils/files.ts`
- Removed `.cursor/` directory creation block (Step 1)
- Removed `.pi/` directory creation block (Step 1)
- Removed framework file copy to `.cursor/luca/` (Step 4)
- Removed Cursor hooks installation (Step 4.6)
- Updated JSDoc to remove `.cursor/` directory references
- Updated harness default from `["claude", "cursor"]` to `["claude"]`

### Task 4: Narrow HarnessId type to Claude-only

- **Commit:** `dba80ab6`
- **File:** `packages/luca-framework/src/types.ts` (plus cascading fixes in 8 other files)
- Changed `HarnessId` from `"claude" | "cursor" | "pi"` to `"claude"`
- Updated JSDoc comments removing Cursor/Pi references

## Deviations

### [Rule 3 - Blocking] Cascading type errors from HarnessId narrowing

Narrowing `HarnessId` to `"claude"` caused TypeScript errors in 8 additional files beyond the plan's 4 target files. All contained fallback defaults like `?? ["claude", "cursor"]` that became type-incompatible. Fixed all in Task 4 commit:

- `src/commands/status.ts` -- 2 fallback defaults updated
- `src/commands/update.ts` -- 5 fallback defaults updated
- `src/commands/add-skill.ts` -- 2 fallback defaults updated
- `src/commands/vault-init.ts` -- removed Cursor/Pi display mapping
- `src/utils/manifest.ts` -- 2 fallback defaults updated, JSDoc cleaned
- `src/utils/tour.ts` -- removed Cursor/Pi display blocks, 1 default updated
- `src/utils/detect.ts` -- removed Cursor/Pi detection, fixed `hasLuca` check from `.cursor/luca` to `.planning`
- `src/utils/doctor/checks/harness-installation.ts` -- removed Cursor/Pi entries from expected dirs/files records

## Verification

- `bunx --bun tsc --noEmit` passes with no errors (excluding pre-existing `dist/plugin/` build artifact errors)
- No string literals `"cursor"` or `"pi"` remain in the 4 target files (wizard.ts, presets.ts, files.ts, types.ts)
- `HarnessId` type is `"claude"` only
- All three presets have `harnesses: ["claude"]`
- `runWizard()` no longer prompts for harness selection

## Files Modified

| File                                                                      | Change                                |
| ------------------------------------------------------------------------- | ------------------------------------- |
| `packages/luca-framework/src/utils/wizard.ts`                             | Removed multiselect, hardcoded Claude |
| `packages/luca-framework/src/utils/presets.ts`                            | All presets Claude-only               |
| `packages/luca-framework/src/utils/files.ts`                              | Removed Cursor/Pi scaffolding         |
| `packages/luca-framework/src/types.ts`                                    | Narrowed HarnessId type               |
| `packages/luca-framework/src/commands/status.ts`                          | Updated defaults                      |
| `packages/luca-framework/src/commands/update.ts`                          | Updated defaults                      |
| `packages/luca-framework/src/commands/add-skill.ts`                       | Updated defaults                      |
| `packages/luca-framework/src/commands/vault-init.ts`                      | Removed Cursor/Pi mapping             |
| `packages/luca-framework/src/utils/manifest.ts`                           | Updated defaults                      |
| `packages/luca-framework/src/utils/tour.ts`                               | Removed Cursor/Pi display             |
| `packages/luca-framework/src/utils/detect.ts`                             | Removed Cursor/Pi detection           |
| `packages/luca-framework/src/utils/doctor/checks/harness-installation.ts` | Claude-only records                   |
