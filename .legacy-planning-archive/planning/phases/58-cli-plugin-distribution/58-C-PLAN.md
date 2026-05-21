# Plan 58-C: Package Metadata and npm pack Validation

## Objective

Update package.json metadata, verify `npm pack` produces a clean publishable package.

## Tasks

### 1. Update package.json

- Update version to 2.0.0
- Update name to @alecsibilia/luca-framework (scoped)
- Ensure `bin`, `exports`, `files` fields are correct
- Add `dist/plugin` to files array

### 2. Test npm pack

Run `npm pack --dry-run` to verify package contents.

### 3. Run full validation

- bun test
- bunx --bun tsc --noEmit
- bun run build:all
- bun run check:drift

## Verification

- npm pack includes all necessary files
- All tests pass
- No drift
