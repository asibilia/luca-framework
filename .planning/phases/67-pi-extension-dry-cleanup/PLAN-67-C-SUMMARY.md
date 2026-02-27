# PLAN-67-C Summary: Unify Build Config to Single Source of Truth

## Status: COMPLETE

## What Was Done

The build configuration in `scripts/build-shared.ts` was previously refactored to use two single-source-of-truth constants:

### PI_EXTENSION_FILES

Single constant listing all 11 Pi extension files. Used by both:
- `generatePiSettings()` — generates the `extensions` array in `.pi/settings.json`
- `generatePiOutputs()` — copies extension files from `src/hooks/pi-extensions/` to `.pi/extensions/`

Eliminates the drift risk where the two functions could list different extensions.

### PI_HELPER_FILES

Single constant listing all shared helper files. Used by `generatePiOutputs()` to copy `__helpers/` from source to `.pi/extensions/__helpers/`.

**Fix applied this session:** Added `index.ts` to `PI_HELPER_FILES` (barrel file was missing from the copy list).

### Verification

- `__helpers/` directory with all 7 files (including index.ts barrel) is copied to `.pi/extensions/__helpers/`
- Extensions resolve `__helpers` imports correctly at runtime via relative paths
- No separate extension lists exist outside `PI_EXTENSION_FILES` and `PI_HELPER_FILES`

---

_Completed: 2026-02-27_
