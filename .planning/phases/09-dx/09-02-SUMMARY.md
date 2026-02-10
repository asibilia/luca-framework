# Plan 09-02 Summary: Doctor Command — Verbose Mode, Fix Commands, and Deep Config Validation

**Status:** COMPLETE
**Phase:** 09-DX (Developer Experience)
**Tickets:** DX-006 (HIGH), DX-007 (HIGH), DX-010 (HIGH), DX-011 (MEDIUM)

## Changes Made

### Task 1: Wire --verbose flag through to executeDoctor() [DX-006]
**File:** `packages/luca-framework/src/commands/doctor.ts`

- Changed `async run()` to `async run({ args })` to destructure citty command arguments
- Passed `args.verbose` through to `executeDoctor({ verbose: args.verbose })`
- The `--verbose` / `-v` flag was already defined in the `args` block but was not being consumed

### Task 2: Update executeDoctor() to accept and use verbose option [DX-006]
**File:** `packages/luca-framework/src/utils/doctor/index.ts`

- Changed signature from `executeDoctor()` to `executeDoctor(options: { verbose?: boolean } = {})`
- Destructures `verbose` with default `false` for backward compatibility
- Details are now shown conditionally: always for non-passing checks, only when `--verbose` for passing checks
- The "Run with --verbose for more details" message is conditionalized: shown only when not already in verbose mode

### Task 3: Fix non-existent --force and --repair fix commands [DX-007, DX-011]
**File:** `packages/luca-framework/src/utils/doctor/checks/config-validation.ts`

- Replaced `'npx luca init --force'` with `'Delete .planning/ directory, then run: npx luca init'` (3 occurrences: missing fields, branding validation failure, catch block)
- Replaced `'npx luca update --repair'` with `'npx luca update'`
- Enhanced catch block to detect JSON escape/parse errors and provide specific guidance about backslash escaping in regex patterns

**Test update:** Updated `config-validation.test.ts` assertion from `toContain('--repair')` to `toContain('npx luca update')` to match the corrected fix command.

### Task 4: Deep branding validation and workTracker validation [DX-010]
**File:** `packages/luca-framework/src/utils/doctor/checks/config-validation.ts`

- Imported `validateBranding` from `../../branding`
- After top-level required field check passes, validates branding sub-fields using `validateBranding()`
- Returns detailed error messages listing each invalid branding field and its specific validation error
- Added `workTracker` enum validation against allowed values: `['jira', 'github', 'none']`
- Both validations run before the manifest check, providing early failure with actionable messages

## Test Results

- **Doctor tests (isolated):** 26 pass, 0 fail
- **Full suite:** 433 pass, 6 fail (all 6 are pre-existing mock.module ordering issues when doctor tests run after update.test.ts mocks `fs`)
- **No regressions introduced**

## Files Modified
1. `packages/luca-framework/src/commands/doctor.ts` (lines 17-19)
2. `packages/luca-framework/src/utils/doctor/index.ts` (lines 4-5, 39, 67-72)
3. `packages/luca-framework/src/utils/doctor/checks/config-validation.ts` (lines 5, 39, 44-71, 79, 91-101)
4. `__tests__/packages/luca-framework/src/utils/doctor/checks/config-validation.test.ts` (line 121 — test assertion update)
