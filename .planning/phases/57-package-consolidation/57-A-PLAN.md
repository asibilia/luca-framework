# Plan 57-A: Audit and Map All Cross-References

## Objective

Before moving files, map every reference to luca-state paths and create the target directory structure.

## Tasks

### 1. Find all bridge.ts path references

Search for all occurrences of:

- `packages/luca-state/src/bridge.ts` (the most common pattern)
- `packages/luca-state/` (any path reference)
- `luca-state` (package name references)
- `from 'luca-state'` or `from "luca-state"` (import references)

### 2. Map target paths

All references to `packages/luca-state/src/bridge.ts` will become `packages/luca-framework/src/state/bridge.ts`.

### 3. Prepare target directory

Create `packages/luca-framework/src/state/` directory structure.

### 4. Update luca-framework package.json

Add luca-state's dependencies (xstate, zod — lodash already exists):

- `xstate@^5.28.0`

## Verification

- Directory structure created
- All references catalogued
