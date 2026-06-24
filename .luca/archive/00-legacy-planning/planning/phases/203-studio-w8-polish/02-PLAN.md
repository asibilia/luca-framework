---
phase: 203
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 203 Plan 2: Keyboard Shortcuts + Progressive Disclosure

## Objective

Build a centralized keyboard shortcut system with input focus awareness, a command palette for discoverability, and apply progressive disclosure patterns across all Studio pages. This wave adds power-user affordances without disrupting the default editing experience.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

@packages/luca-studio/components/layout/layout-shell.tsx (mount point for keyboard shortcut hook)
@packages/luca-studio/stores/layout.ts (navRailExpandedAtom, detailPanelStateAtom for toggle shortcuts)
@packages/luca-studio/hooks/use-undo.ts (existing Cmd+Z/Shift+Cmd+Z -- will be superseded by centralized handler)
@packages/luca-studio/hooks/use-edit-mode.ts (exitEdit/enterEdit for Escape shortcut)
@packages/luca-studio/components/editor/code-mirror-wrapper.tsx (CodeMirror `.cm-editor` / `.cm-content` classes for focus guard)
@packages/luca-studio/components/feedback/save-bar.tsx (save trigger for Cmd+S)
@packages/luca-studio/stores/dirty-tracking.ts (canSaveAtom for Cmd+S guard)
@packages/luca-studio/app/agents/page.tsx (entity page pattern -- add progressive disclosure)
@packages/luca-studio/app/skills/page.tsx (entity page -- add progressive disclosure)
@packages/luca-studio/app/rules/page.tsx (entity page -- add progressive disclosure)
@packages/luca-studio/app/config/page.tsx (config page -- add progressive disclosure)
@packages/luca-studio/app/settings/page.tsx (settings page from Wave 1 -- verify integration)
@packages/luca-studio/components/layout/nav-rail.tsx (nav items for command palette routing)
@.planning/phases/203-studio-w8-polish/01-CONTEXT.md
@.planning/phases/203-studio-w8-polish/01-PREMORTEM.md

## Tasks

### 1. Build centralized keyboard shortcuts hook

**Type:** auto
**TDD:** false
**Depends on:** none

Create `hooks/use-keyboard-shortcuts.ts` -- a centralized hook that registers all global keyboard shortcuts at the LayoutShell level.

**7 shortcuts:**

| Key           | Action                       | Dispatch target                                                   |
| ------------- | ---------------------------- | ----------------------------------------------------------------- |
| `Cmd+K`       | Open command palette         | `commandPaletteOpenAtom` (new)                                    |
| `Cmd+S`       | Save current page            | Page-specific save callback via atom                              |
| `Cmd+\`       | Toggle navigation rail       | `navRailExpandedAtom` toggle                                      |
| `Cmd+.`       | Toggle detail panel          | `detailPanelStateAtom` cycle: closed -> docked -> closed          |
| `Cmd+Z`       | Undo                         | Delegate to page-specific undo (keep existing `useUndo` per-page) |
| `Cmd+Shift+Z` | Redo                         | Delegate to page-specific redo                                    |
| `Escape`      | Close panel / exit edit mode | Close command palette > close detail panel > exit edit mode       |
| `Cmd+Shift+P` | Preview compiled output      | `compiledPreviewOpenAtom` (new)                                   |

**Implementation details:**

1. Single `useEffect` registering one `keydown` handler on `window`.
2. **PRE-MORTEM CONSTRAINT (focus guard):** Before dispatching any shortcut, check `document.activeElement`. Skip ALL global shortcuts when the active element is:
   - An `<input>` element
   - A `<textarea>` element
   - An element with `[contenteditable="true"]`
   - An element inside a `.cm-editor` container (CodeMirror) -- use `document.activeElement.closest('.cm-editor')` or check for `.cm-content` class
   - The hook MUST explicitly test for `.cm-editor` and `.cm-content` elements, not just rely on generic input detection.
3. Exception: `Escape` always fires (to close dialogs even from within editors).
4. Exception: `Cmd+S` fires even inside inputs/editors (save should always work).
5. Use `e.preventDefault()` to suppress browser defaults (Cmd+S save dialog, etc.).

**Shortcut action atoms:**

- Create `commandPaletteOpenAtom` (boolean) in `stores/layout.ts`
- Create `compiledPreviewOpenAtom` (boolean) in `stores/layout.ts`
- Create `globalSaveCallbackAtom` (write atom accepting `() => Promise<void>`) for page-specific save wiring

**Files to create/edit:**

- Create: `packages/luca-studio/hooks/use-keyboard-shortcuts.ts`
- Edit: `packages/luca-studio/stores/layout.ts` (add commandPaletteOpenAtom, compiledPreviewOpenAtom, globalSaveCallbackAtom)

**Verification:**

- Focus guard explicitly tests for `.cm-editor` and `.cm-content` (grep the source for both strings)
- `Cmd+\` toggles nav rail expanded state
- `Cmd+.` toggles detail panel
- `Cmd+K` sets commandPaletteOpenAtom to true
- Shortcuts do NOT fire when typing in an input, textarea, contenteditable, or CodeMirror editor (except Escape and Cmd+S)
- `bunx --bun tsc --noEmit` passes

### 2. Mount keyboard shortcuts in LayoutShell

**Type:** auto
**TDD:** false
**Depends on:** 1

Wire `useKeyboardShortcuts()` into `layout-shell.tsx` so it activates globally across all pages.

**Implementation:**

1. Import and call `useKeyboardShortcuts()` at the top of the `LayoutShell` component body.
2. The hook manages its own lifecycle (event listener setup/teardown via useEffect).
3. No props needed -- the hook reads all targets from Jotai atoms directly.

**Files to edit:**

- `packages/luca-studio/components/layout/layout-shell.tsx`

**Verification:**

- `useKeyboardShortcuts` is called inside LayoutShell
- Shortcuts work on every page (agents, skills, rules, config, settings, pipeline, memory pages)
- `bunx --bun tsc --noEmit` passes

### 3. Build command palette component

**Type:** auto
**TDD:** false
**Depends on:** 1

Build `components/layout/command-palette.tsx` -- a searchable command list overlay triggered by `Cmd+K`.

**Implementation:**

1. Read `commandPaletteOpenAtom` to show/hide.
2. Render as a centered modal overlay with backdrop blur (similar to VS Code / Raycast).
3. Top: search input with autofocus. Fuzzy filter as user types.
4. Command list (static entries):
   - **Navigate:** Home, Agents, Skills, Rules, Config, Pipeline, Memory, Settings (each navigates via `router.push`)
   - **Actions:** Save (triggers globalSaveCallbackAtom), Toggle Nav Rail, Toggle Detail Panel, Preview Compiled Output
   - **Shortcuts:** Show keyboard shortcut hint badge on each row (e.g., `Cmd+S`)
5. Fuzzy search: use simple `includes` matching on command name (no external library needed).
6. Arrow key navigation with highlighted selection. Enter to execute.
7. Escape or backdrop click closes the palette.
8. Render via a portal or as a fixed overlay in LayoutShell.

**Files to create:**

- `packages/luca-studio/components/layout/command-palette.tsx`

**Files to edit:**

- `packages/luca-studio/components/layout/layout-shell.tsx` (render CommandPalette component)

**Verification:**

- `Cmd+K` opens the palette with search input focused
- Typing filters commands by name
- Arrow keys navigate, Enter executes selected command
- Escape closes the palette
- Navigate commands route to correct pages
- `bunx --bun tsc --noEmit` passes

### 4. Wire page-specific save callbacks

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Connect each page's existing save function to the global `Cmd+S` shortcut via `globalSaveCallbackAtom`.

**Implementation:**

1. In each page component that has a save function (agents, skills, rules, config, settings), register the save callback on mount:
   ```ts
   const setSaveCallback = useSetAtom(globalSaveCallbackAtom);
   useEffect(() => {
     setSaveCallback(() => save);
     return () => setSaveCallback(null);
   }, [save, setSaveCallback]);
   ```
2. The keyboard shortcut hook reads `globalSaveCallbackAtom` and calls the callback when `Cmd+S` fires.
3. Pages without save (home, memory, pipeline) register nothing -- `Cmd+S` is a no-op there.

**Files to edit:**

- `packages/luca-studio/app/agents/page.tsx`
- `packages/luca-studio/app/skills/page.tsx`
- `packages/luca-studio/app/rules/page.tsx`
- `packages/luca-studio/app/config/page.tsx`
- `packages/luca-studio/app/settings/page.tsx`

**Verification:**

- `Cmd+S` on agents page triggers the agent save function
- `Cmd+S` on config page triggers the config save function
- `Cmd+S` on home page does nothing (no save registered)
- `bunx --bun tsc --noEmit` passes

### 5. Apply progressive disclosure across pages

**Type:** auto
**TDD:** false
**Depends on:** none

Apply progressive disclosure patterns to reduce visual complexity for new users while keeping power features accessible.

**Patterns to apply:**

1. **Collapsed sections:** Wrap advanced content in `Collapsible` (shadcn) components, collapsed by default:
   - Settings page: Vault Configuration section (already collapsed from Wave 1 Task 5, verify)
   - Config page: Add "(Advanced)" label to the Harness tab trigger
   - Entity detail panels: Collapse "Raw Frontmatter" or "Template Variables" sections if they exist

2. **Tooltips on technical terms:** Add shadcn `Tooltip` to technical labels:
   - Config page: "Loop Budgets", "Model Routing", "Fail-Closed Semantics" labels
   - Settings page: "ETag", "Dual-Vault Routing" labels
   - Entity pages: "Frontmatter", "Template Variables" labels

3. **"(Advanced)" labels:** Add visual "(Advanced)" badge (muted, smaller text) to:
   - Settings page: Vault Configuration section header
   - Config page: Harness tab name -> "Harness (Advanced)"
   - Pipeline page: Raw DAG JSON section (if it exists)

4. **Keyboard shortcut hints:** Add shortcut hint badges to:
   - Save buttons: show `Cmd+S` hint
   - Nav rail toggle button: show `Cmd+\` hint (in tooltip)

**Files to edit:**

- `packages/luca-studio/app/config/page.tsx` (Advanced label on Harness tab, tooltips)
- `packages/luca-studio/app/settings/page.tsx` (verify Advanced label, tooltips)
- `packages/luca-studio/components/feedback/save-bar.tsx` (Cmd+S hint badge)
- Other entity/config components as needed for tooltip additions

**Verification:**

- Harness tab shows "(Advanced)" label
- Vault Configuration section shows "(Advanced)" label and starts collapsed
- Technical terms have tooltips explaining them
- Save buttons show `Cmd+S` keyboard hint
- `bunx --bun tsc --noEmit` passes

### 6. Reconcile undo/redo keyboard handling

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

The existing `useUndo` hook registers its own `Cmd+Z` / `Cmd+Shift+Z` listeners per page. The centralized keyboard shortcuts hook should NOT duplicate these -- it should delegate to the existing per-page undo handlers.

**Implementation:**

1. In `use-keyboard-shortcuts.ts`, for `Cmd+Z` and `Cmd+Shift+Z`: do NOT call `e.preventDefault()` or dispatch any action. Let the event bubble to the page-level `useUndo` listeners that already handle it.
2. Alternatively, create an `undoCallbackAtom` / `redoCallbackAtom` pattern similar to `globalSaveCallbackAtom`, and have `useUndo` register its callbacks. Then the centralized hook dispatches to those atoms and existing `useUndo` listeners are removed.
3. Choose the approach that avoids double-dispatch. The simpler approach (option 1 -- let events bubble) is preferred unless it causes issues.

**Files to edit:**

- `packages/luca-studio/hooks/use-keyboard-shortcuts.ts` (ensure no undo/redo conflict)
- Possibly `packages/luca-studio/hooks/use-undo.ts` (if refactoring to callback atom pattern)

**Verification:**

- `Cmd+Z` undoes the last edit on agent/skill/rule pages (no double-undo)
- `Cmd+Shift+Z` redoes on those pages (no double-redo)
- No duplicate keydown listeners for the same shortcut
- `bunx --bun tsc --noEmit` passes

## Verification

1. **Keyboard shortcuts work** -- All 7 shortcuts fire correctly from any page
2. **Focus guard** -- Typing in inputs, textareas, contenteditable, and CodeMirror editors does NOT trigger shortcuts (except Escape and Cmd+S)
3. **CodeMirror guard** -- Specifically test: focus the raw config editor (CodeMirror), press `Cmd+K` -- command palette does NOT open
4. **Command palette** -- `Cmd+K` opens, fuzzy search works, navigation commands route correctly, Escape closes
5. **Cmd+S integration** -- Save shortcut works on each page with a save function, is a no-op on pages without save
6. **Undo/redo** -- No double-dispatch; undo/redo works exactly once per keypress
7. **Progressive disclosure** -- Advanced sections are collapsed by default, tooltips appear on hover over technical terms
8. **TypeScript** -- `bunx --bun tsc --noEmit` passes cleanly

## Success Criteria

- All 7 keyboard shortcuts function correctly with proper focus guard
- CodeMirror focus guard explicitly checks `.cm-editor` and `.cm-content` elements (pre-mortem Risk 3)
- Command palette provides fuzzy-searchable access to all navigation and action commands
- Progressive disclosure reduces visual noise without hiding functionality
- No regression in existing undo/redo behavior

## Output Specification

**Files created:**

- `packages/luca-studio/hooks/use-keyboard-shortcuts.ts`
- `packages/luca-studio/components/layout/command-palette.tsx`

**Files modified:**

- `packages/luca-studio/stores/layout.ts` (new atoms)
- `packages/luca-studio/components/layout/layout-shell.tsx` (mount hook + command palette)
- `packages/luca-studio/app/agents/page.tsx` (save callback registration)
- `packages/luca-studio/app/skills/page.tsx` (save callback registration)
- `packages/luca-studio/app/rules/page.tsx` (save callback registration)
- `packages/luca-studio/app/config/page.tsx` (save callback + progressive disclosure)
- `packages/luca-studio/app/settings/page.tsx` (save callback + progressive disclosure)
- `packages/luca-studio/components/feedback/save-bar.tsx` (Cmd+S hint)
- `packages/luca-studio/hooks/use-keyboard-shortcuts.ts` or `use-undo.ts` (undo reconciliation)
