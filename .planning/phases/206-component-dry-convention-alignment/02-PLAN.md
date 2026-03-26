---
phase: 206
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 206 Plan 2: Convention Fixes (Cmd+S, node:fs, cloneDeep)

## Objective

Apply mechanical convention fixes across luca-studio: remove the duplicate Cmd+S keyboard handler in use-pipeline-save.ts (centralized handler already exists in use-keyboard-shortcuts.ts), migrate node:fs/promises to Bun.file API in config-section-handler.ts, and replace JSON.parse(JSON.stringify()) deep clone with lodash cloneDeep in use-pipeline-save.ts.

## Context

@packages/luca-studio/hooks/use-pipeline-save.ts
@packages/luca-studio/hooks/use-keyboard-shortcuts.ts
@packages/luca-studio/lib/config-section-handler.ts
@packages/luca-studio/components/feedback/save-bar.tsx
@.planning/phases/206-component-dry-convention-alignment/01-CONTEXT.md

## Tasks

### 1. Remove duplicate Cmd+S handler from use-pipeline-save.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Remove the `useEffect` block at lines 124-136 of `use-pipeline-save.ts` that registers a duplicate Cmd+S keyboard handler.

**Why this is safe to remove:**

- `use-keyboard-shortcuts.ts` (lines 119-127) already registers a centralized Cmd+S handler via `saveCallback`
- The pipeline page registers `handleSave` as the `saveCallback` (confirmed in `app/pipeline/page.tsx`)
- The SaveBar component does NOT have its own Cmd+S handler -- it only shows the shortcut hint visually (line 220-221)
- Having two `keydown` listeners for the same shortcut means `handleSave` fires twice per Cmd+S press

**What to change:**

- Remove the `useEffect` block (lines 124-136)
- Remove `canSave` from the hook since it was only used by the removed useEffect
- Remove `useEffect` from the import if no other useEffect remains in the file (only `useCallback` is needed)
- Update the JSDoc to remove the "Cmd+S" bullet point

**Files to edit:**

- `packages/luca-studio/hooks/use-pipeline-save.ts`

**Verification:**

- TypeScript compiles without errors
- No `window.addEventListener("keydown"` in use-pipeline-save.ts
- `canSaveAtom` import removed (only used by the deleted useEffect)
- Centralized Cmd+S in use-keyboard-shortcuts.ts still works (unchanged)

### 2. Migrate node:fs/promises to Bun.file in config-section-handler.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Replace `node:fs/promises` imports with Bun.file API in `config-section-handler.ts`. This file is a Next.js API route handler (server-side only), so Bun APIs are available.

**Changes:**

1. Remove `import { access, readFile } from "node:fs/promises"` (line 27)
2. Replace `access(configPath).then(() => true, () => false)` (line 145-148) with `Bun.file(configPath).exists()`
3. Replace `readFile(configPath, "utf-8")` (line 151) with `Bun.file(configPath).text()`

**Before (lines 145-151):**

```typescript
const exists = await access(configPath).then(
  () => true,
  () => false,
);

if (exists) {
  rawFileContent = await readFile(configPath, "utf-8");
```

**After:**

```typescript
const exists = await Bun.file(configPath).exists();

if (exists) {
  rawFileContent = await Bun.file(configPath).text();
```

**Files to edit:**

- `packages/luca-studio/lib/config-section-handler.ts`

**Verification:**

- TypeScript compiles without errors
- No `node:fs/promises` import in the file
- Uses `Bun.file().exists()` and `Bun.file().text()` only

### 3. Replace JSON clone with lodash cloneDeep in use-pipeline-save.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace the `JSON.parse(JSON.stringify(serverConfig))` pattern at line 112 of `use-pipeline-save.ts` with `cloneDeep` from lodash.

**Before (line 111-113):**

```typescript
setConfigDraft(
  JSON.parse(JSON.stringify(serverConfig)) as Record<string, unknown>,
);
```

**After:**

```typescript
import cloneDeep from "lodash/cloneDeep";
// ...
setConfigDraft(cloneDeep(serverConfig) as Record<string, unknown>);
```

**Rationale:** JSON.parse(JSON.stringify()) is unsafe for non-serializable values (functions, Dates, undefined, Infinity, NaN). lodash cloneDeep handles all types correctly and is the project standard per the lodash-preference rule.

**Files to edit:**

- `packages/luca-studio/hooks/use-pipeline-save.ts`

**Verification:**

- TypeScript compiles without errors
- `import cloneDeep from "lodash/cloneDeep"` present at top of file
- No `JSON.parse(JSON.stringify(` pattern in the file

### 4. Fix JSDoc import ordering and add missing useCallback

**Type:** auto
**TDD:** false
**Depends on:** none

Scan the files listed in ROADMAP.md for this phase and fix:

- **JSDoc import ordering:** Ensure imports follow the standard: external libs → internal packages → relative imports → type-only imports, with blank lines between groups. Fix any files where JSDoc `@import` or type imports are interleaved with value imports.
- **Missing useCallback:** In config form components (`agent-config-form.tsx`, `skill-config-form.tsx`, `rule-config-form.tsx`), wrap any handler functions passed as dependencies in `useCallback` to prevent unnecessary re-renders. Check for `onChange`, `onToggle`, and similar handlers defined inline.

**Files to check/edit:**

- `packages/luca-studio/components/agents/agent-config-form.tsx`
- `packages/luca-studio/components/skills/skill-config-form.tsx`
- `packages/luca-studio/components/rules/rule-config-form.tsx`
- `packages/luca-studio/hooks/use-sse.ts`
- `packages/luca-studio/hooks/use-config-conflict.ts`

**Verification:**

- TypeScript compiles without errors
- Import groups are properly separated with blank lines
- Handler functions passed as deps are wrapped in useCallback

## Verification

1. Run `bunx --bun tsc --noEmit` -- zero type errors
2. Grep confirms no duplicate Cmd+S handler in use-pipeline-save.ts
3. Grep confirms no `node:fs/promises` import in config-section-handler.ts
4. Grep confirms no `JSON.parse(JSON.stringify(` in use-pipeline-save.ts
5. Centralized Cmd+S shortcut still works via use-keyboard-shortcuts.ts (unchanged file)
6. Import ordering follows standard grouping in all edited files
7. Config form handlers wrapped in useCallback

## Success Criteria

- use-pipeline-save.ts has no keydown event listener (Cmd+S handled centrally)
- config-section-handler.ts uses Bun.file API exclusively (no node:fs imports)
- use-pipeline-save.ts uses lodash cloneDeep instead of JSON round-trip
- Import ordering follows project standards in all edited files
- Config form handlers wrapped in useCallback where needed
- Zero TypeScript compilation errors across all changed files

## Output Specification

- `packages/luca-studio/hooks/use-pipeline-save.ts` (edited: remove Cmd+S handler, add cloneDeep)
- `packages/luca-studio/lib/config-section-handler.ts` (edited: node:fs to Bun.file migration)
- `packages/luca-studio/components/agents/agent-config-form.tsx` (edited: useCallback, import ordering)
- `packages/luca-studio/components/skills/skill-config-form.tsx` (edited: useCallback, import ordering)
- `packages/luca-studio/components/rules/rule-config-form.tsx` (edited: useCallback, import ordering)
