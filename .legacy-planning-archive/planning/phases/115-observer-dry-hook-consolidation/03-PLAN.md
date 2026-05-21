---
id: "115-03"
title: "Consolidate module_bindings from 3 Copies to Single Canonical Location"
wave: 1
phase: 115
gap_closure: true
depends_on: []
---

# Plan 03 — Consolidate module_bindings from 3 Copies to Single Canonical Location

## Objective

Eliminate the triplication of SpacetimeDB-generated `module_bindings/` by designating one canonical location and replacing the other two copies with references (symlinks or gitignore + generate script).

## Context

### Current State: 3 Identical Copies

There are 3 identical copies of the auto-generated SpacetimeDB module_bindings directory (42 files each, 1308 lines total per copy):

1. **`packages/luca-observer/module_bindings/`** — Used by the Next.js observer app via `~/module_bindings` path alias
2. **`packages/luca-spacetime/luca-observer/module_bindings/`** — Appears to be the SpacetimeDB CLI output location
3. **`packages/luca-spacetime/spacetimedb/luca-observer/module_bindings/`** — Another copy, nested under the spacetimedb server module

All three directories contain the same 42 files and are byte-for-byte identical (verified via `diff -rq`).

### Source of Truth

The canonical generation source is:

- **Server schema:** @file packages/luca-spacetime/spacetimedb/src/schema.ts (defines all 17 tables)
- **Server entry:** @file packages/luca-spacetime/spacetimedb/src/index.ts (defines reducers)
- **Generation command:** `spacetime generate --lang typescript --out-dir <out> --module-path packages/luca-spacetime/spacetimedb`

### Observer Configuration

The observer app resolves `~/module_bindings` via the `~/*` path alias in:
@file packages/luca-observer/tsconfig.json — `"paths": { "~/*": ["./*"] }`

This means the observer imports `~/module_bindings` which resolves to `packages/luca-observer/module_bindings/`.

## Tasks

### Task 1: Determine the canonical location

The canonical location should be `packages/luca-observer/module_bindings/` because:

- It's the only location that is actually imported by application code
- The observer's tsconfig `~/*` path alias resolves here
- The other two copies (`packages/luca-spacetime/luca-observer/module_bindings/` and `packages/luca-spacetime/spacetimedb/luca-observer/module_bindings/`) are artifacts of the `spacetime generate` command's output directory configuration

**Decision:** Keep `packages/luca-observer/module_bindings/` as canonical.

### Task 2: Delete the two redundant copies

Remove the duplicate directories:

```bash
rm -rf packages/luca-spacetime/luca-observer/module_bindings/
rm -rf packages/luca-spacetime/spacetimedb/luca-observer/module_bindings/
```

If `packages/luca-spacetime/luca-observer/` becomes empty after removing `module_bindings/`, remove the parent directory too:

```bash
rmdir packages/luca-spacetime/luca-observer/ 2>/dev/null || true
```

Similarly for `packages/luca-spacetime/spacetimedb/luca-observer/`:

```bash
rmdir packages/luca-spacetime/spacetimedb/luca-observer/ 2>/dev/null || true
```

**Verification:**

- `find packages/ -type d -name module_bindings` returns exactly one result: `packages/luca-observer/module_bindings/`

### Task 3: Add a generate script to regenerate bindings in the correct location

Add a `generate` script to `packages/luca-spacetime/spacetimedb/package.json` (or update the root package.json) that generates bindings directly to the observer's location:

**Option A — Script in `packages/luca-observer/package.json`:**

Add to the `scripts` section:

```json
"generate:bindings": "spacetime generate --lang typescript --out-dir ./module_bindings --module-path ../luca-spacetime/spacetimedb"
```

**Option B — Script in root `package.json`:**

Add to root scripts:

```json
"generate:observer-bindings": "spacetime generate --lang typescript --out-dir packages/luca-observer/module_bindings --module-path packages/luca-spacetime/spacetimedb"
```

Choose the approach that best fits the existing script organization. Both accomplish the same thing: generating directly to the canonical location.

**Verification:**

- The generate script runs successfully
- `packages/luca-observer/module_bindings/index.ts` exists after generation
- No other `module_bindings/` directories are created

### Task 4: Add .gitignore entries to prevent re-duplication

Add the following to `packages/luca-spacetime/.gitignore` (create if it doesn't exist):

```gitignore
# SpacetimeDB CLI generates bindings here by default.
# Canonical location is packages/luca-observer/module_bindings/.
# Regenerate with: bun run generate:bindings (from packages/luca-observer/)
luca-observer/module_bindings/
spacetimedb/luca-observer/
```

**Verification:**

- File exists at `packages/luca-spacetime/.gitignore`
- `git status` does not show the removed directories as changes if they were previously committed (they will show as deleted, which is correct)

### Task 5: Add a comment in the canonical module_bindings location

The `module_bindings/index.ts` file is auto-generated and already has a header comment saying "THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB". No additional comment is needed, but verify this comment is present.

**Verification:**

- The first line of `packages/luca-observer/module_bindings/index.ts` contains the auto-generation warning

## Success Criteria

1. Only ONE `module_bindings/` directory exists: `packages/luca-observer/module_bindings/`
2. The two copies under `packages/luca-spacetime/` are deleted
3. A script exists to regenerate bindings to the correct location
4. `.gitignore` prevents accidental re-duplication
5. TypeScript compilation of the observer passes: `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json`
6. No imports are broken — all `~/module_bindings` imports still resolve correctly
