# Plan 57-B: Move luca-state Source Into Unified Package

## Objective

Move all luca-state source files into `packages/luca-framework/src/state/` and update internal imports.

## Tasks

### 1. Move source files

Move `packages/luca-state/src/*` → `packages/luca-framework/src/state/`

Files to move:

- machine.ts, types.ts, guards.ts, actions.ts
- bridge.ts, persistence.ts, snapshot.ts
- cli.ts, defaults.ts, events.ts, sanitize.ts
- suspend-checkpoint.ts
- index.ts (barrel)
- actors/ directory
- utils/ directory

### 2. Move test files

Move `packages/luca-state/__tests__/*` → `__tests__/packages/luca-state/` (keep in existing test structure)

### 3. Update internal imports within state files

State files import from each other with relative paths — these stay the same.
But the index.ts barrel needs to be verified.

### 4. Update luca-framework barrel

Add re-exports from state in `packages/luca-framework/src/index.ts`.

### 5. Update build config

Add `src/state/bridge` as a second entry point in `packages/luca-framework/build.config.ts`.

## Verification

- All state source files present in new location
- Internal imports resolve correctly
- TypeScript compiles
