---
phase: 1
plan: 4
type: feature
autonomous: true
wave: 2
depends_on: [1, 2, 3]
---

# Phase 1 Plan 4: Registration and Barrel Updates

## Objective

Register all three new adapters (Cursor, Windsurf, VS Code) in the adapter registry and update the top-level adapters barrel to export their factory functions. This is the final integration step that makes the adapters discoverable by the build pipeline and auto-detection system.

## Context

@src/adapters/**helpers/register-builtins.ts (existing registration: Claude + API)
@src/adapters/**helpers/adapter-registry.ts (DETECTION_ORDER already includes cursor, windsurf, vscode)
@src/adapters/index.ts (top-level barrel with Claude + API exports)
@src/adapters/cursor/index.ts (Cursor barrel from Plan 1)
@src/adapters/windsurf/index.ts (Windsurf barrel from Plan 2)
@src/adapters/vscode/index.ts (VS Code barrel from Plan 3)

## Tasks

### 1. Register new adapters in register-builtins.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/adapters/__helpers/register-builtins.ts` to import and register all three new adapters alongside the existing Claude and API adapters.

Add:

```typescript
import { createCursorAdapter } from "../cursor/cursor-adapter";
import { createWindsurfAdapter } from "../windsurf/windsurf-adapter";
import { createVscodeAdapter } from "../vscode/vscode-adapter";

registerAdapter(createCursorAdapter());
registerAdapter(createWindsurfAdapter());
registerAdapter(createVscodeAdapter());
```

**Files to create/edit:**

- `src/adapters/__helpers/register-builtins.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 5 adapters are registered: claude, api, cursor, windsurf, vscode
- Module-level JSDoc comment is updated to list all registered adapters

### 2. Update adapters barrel with new adapter exports

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/adapters/index.ts` to export the new adapter factory functions and their helper exports.

Add sections for:

```typescript
// --- Cursor Adapter ---
export { createCursorAdapter } from "./cursor";
export { CURSOR_EVENT_MAP, translateCursorEvent } from "./cursor";

// --- Windsurf Adapter ---
export { createWindsurfAdapter } from "./windsurf";
export { WINDSURF_EVENT_MAP, translateWindsurfEvent } from "./windsurf";

// --- VS Code Adapter ---
export { createVscodeAdapter } from "./vscode";
export { VSCODE_TOOL_MAP, translateVscodeToolName } from "./vscode";
export { VSCODE_EVENT_MAP, translateVscodeEvent } from "./vscode";
```

**Files to create/edit:**

- `src/adapters/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All new exports are importable from `~/adapters`
- Barrel remains a pure re-export file (no logic)

### 3. Verify DETECTION_ORDER alignment

**Type:** auto
**TDD:** false
**Depends on:** 1

Verify that `DETECTION_ORDER` in `src/adapters/__helpers/adapter-registry.ts` already has entries for cursor, windsurf, and vscode (it does per current code). Confirm that the `adapterName` values match the `config.name` values of the registered adapters:

- `"cursor"` matches `createCursorAdapter().config.name`
- `"windsurf"` matches `createWindsurfAdapter().config.name`
- `"vscode"` matches `createVscodeAdapter().config.name`

No file changes expected -- this is a verification-only task. If any mismatch is found, fix the adapter's `config.name`.

**Files to create/edit:**

- None (verification only; fix adapter config.name if mismatch found)

**Verification:**

- DETECTION_ORDER entries align with registered adapter names
- `detectAdapter(projectRoot)` can find each new adapter when its directory exists

## Verification

- `bunx --bun tsc --noEmit` passes with the full codebase
- `bun run scripts/check-domain-boundaries.ts` reports no violations
- All 5 adapters (claude, api, cursor, windsurf, vscode) are registered after importing register-builtins
- DETECTION_ORDER in adapter-registry.ts aligns with adapter config.name values
- Barrel `src/adapters/index.ts` remains a pure re-export file with no logic

## Success Criteria

- Importing `~/adapters/__helpers/register-builtins` registers all 5 adapters
- All new adapter factory functions and helpers are importable from `~/adapters`
- Auto-detection via `detectAdapter()` can discover Cursor, Windsurf, and VS Code environments
- No circular import issues between new adapter modules and the registry

## Output Specification

- Updated `src/adapters/__helpers/register-builtins.ts` -- registers 3 new adapters
- Updated `src/adapters/index.ts` -- exports new adapter factories and helpers
