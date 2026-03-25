---
phase: 7
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 7 Plan 1: Editor Components (CodeMirrorWrapper, ModelRoutingGrid, EntityTree)

## Objective

Build three P1 shared editor components used across the Pipeline, Agents, Skills, and Rules pages. These are reusable editing surfaces that must exist before any feature page work begins in Phase 8. P2 editor components (ConfigSection, DiffPreview, FieldEditor) are deferred.

## Context

@packages/luca-studio/components/editor/ (new directory -- all files created here)
@packages/luca-studio/stores/entity-atoms.ts (per-entity draft atoms consumed by EntityTree)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom for dirty dots in EntityTree)
@packages/luca-studio/stores/config-atoms.ts (routingTableAtom/routingDraftAtom for ModelRoutingGrid)
@packages/luca-studio/lib/constants.ts (COMPLEXITY_LEVELS for ModelRoutingGrid column headers)
@docs/brainstorm/observer-studio-rework/3.ui-architecture.md (detailed component specs)
@packages/luca-studio/package.json (CodeMirror 6, Shiki already installed)

## Tasks

### 1. Create CodeMirrorWrapper component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a configured CodeMirror 6 editor component at `packages/luca-studio/components/editor/code-mirror-wrapper.tsx`.

Requirements:

- "use client" directive (CodeMirror needs DOM)
- Wrap `@codemirror/view` EditorView with React lifecycle (useRef + useEffect pattern, no classes)
- Custom Luca theme using CSS variables from the app (`--background`, `--foreground`, `--primary`, `--muted`, `--border`) so it adapts to light/dark mode
- `@codemirror/lang-markdown` for markdown language mode with syntax highlighting
- Word wrap enabled by default (`EditorView.lineWrapping`)
- JetBrains Mono font (via CSS class, font already available via Tailwind config or Google Fonts)
- Controlled value via `value` prop + `onChange` callback (convert EditorView updates to string)
- Optional `readOnly` prop that disables editing
- Optional `placeholder` prop
- Toolbar strip above the editor with:
  - Format buttons: Bold (`**`), Italic (`*`), Code (backtick) -- insert markdown syntax around selection
  - Insert Template Variable button (inserts `{{variable}}` placeholder)
  - Character count and estimated token count (chars / 4 approximation) displayed at right end of toolbar
- Toolbar hidden when `readOnly` is true
- Expose `ref` for imperative access if needed (focus, scroll)

**Files to create/edit:**

- `packages/luca-studio/components/editor/code-mirror-wrapper.tsx`

**Verification:**

- Component renders a CodeMirror editor with markdown syntax highlighting
- Custom theme picks up app CSS variables
- Toolbar buttons insert markdown formatting around selected text
- Character/token count updates as user types
- `readOnly` mode disables editing and hides toolbar
- `onChange` fires with updated string value on every edit

### 2. Create ModelRoutingGrid component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a compact 5-column editable routing grid at `packages/luca-studio/components/editor/model-routing-grid.tsx`.

Requirements:

- "use client" directive
- Props: `value` (record mapping complexity levels to model tiers), `onChange` callback, optional `readOnly`
- Renders a single-row grid with 5 columns: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
- Column headers use labels from `COMPLEXITY_LEVELS` constant
- Each cell is a small dropdown (shadcn Select or native select) with three options: "fast", "balanced", "capable"
- Cells color-coded by selected tier:
  - fast: muted/gray background
  - balanced: blue/info background
  - capable: amber/warning background
- If the current 5-value combination matches a known routing preset name, display the preset name above the grid (e.g., "Preset: ORCHESTRATOR")
- Import the 7 named presets from `src/complexity/__helpers/model-routing.ts` or define them inline as a constant if cross-package import is not feasible (luca-studio is a separate package)
- Compact sizing: cells ~80px wide, font-size text-xs, total width ~450px
- `readOnly` mode renders text instead of dropdowns

**Files to create/edit:**

- `packages/luca-studio/components/editor/model-routing-grid.tsx`

**Verification:**

- Grid renders 5 labeled columns with tier dropdowns
- Selecting a tier updates the value and calls onChange
- Cells display correct color per tier
- Preset name appears when combination matches a known preset
- readOnly mode renders static text

### 3. Create EntityTree component

**Type:** auto
**TDD:** false
**Depends on:** none

Build a tree view component for browsing agents, skills, and rules at `packages/luca-studio/components/editor/entity-tree.tsx`.

Requirements:

- "use client" directive
- Props:
  - `entities`: array of `{ name: string; directory: string; type: "agent" | "skill" | "rule" }` objects
  - `selectedName`: currently selected entity name (or null)
  - `onSelect`: callback when entity is clicked
  - `onContextAction`: callback for context menu actions (receives `{ action: "new" | "duplicate" | "delete"; entity?: EntityItem }`)
- Groups entities by `directory` field (e.g., "general/", "luca/", "profiles/")
- Each directory group is a collapsible section (use shadcn Collapsible or simple disclosure)
- Search/filter input at top of tree -- filters entity names and collapses empty groups
- Right-click context menu on entities with: New, Duplicate, Delete (use shadcn DropdownMenu or ContextMenu)
- Right-click on empty area or group header shows: New only
- Dirty indicator: 6px amber dot next to entity names that appear in `dirtySetAtom`
- Selected entity highlighted with `bg-accent` background
- Compact tree rows: ~28px height, text-sm, proper indentation
- Lucide icons per entity type: Bot for agents, Hexagon for skills, Shield for rules

**Files to create/edit:**

- `packages/luca-studio/components/editor/entity-tree.tsx`

**Verification:**

- Tree groups entities by directory with collapsible sections
- Search input filters entities and hides empty groups
- Right-click opens context menu with New/Duplicate/Delete
- Amber dirty dot appears next to entities with unsaved changes
- Clicking an entity calls `onSelect` with the entity name
- Selected entity is visually highlighted

### 4. Create editor barrel export

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Create the barrel index file for the editor components directory.

**Files to create/edit:**

- `packages/luca-studio/components/editor/index.ts`

**Verification:**

- All three components are re-exported from the barrel
- Import `{ CodeMirrorWrapper, ModelRoutingGrid, EntityTree } from "@/components/editor"` resolves correctly

## Verification

- All three components render without errors in a Next.js page
- `bunx --bun tsc --noEmit` passes with no type errors in the new files
- Components use Jotai atoms (not local useState) for dirty tracking integration
- No classes used -- functional components with hooks only
- All files follow kebab-case naming convention
- CodeMirror editor loads without hydration errors (client-only rendering)

## Success Criteria

- CodeMirrorWrapper provides a fully functional markdown editor with toolbar
- ModelRoutingGrid enables inline editing of model tier routing per complexity level
- EntityTree provides browsable, searchable, context-menu-equipped entity navigation
- All three components are independently importable and have no circular dependencies
- Components are ready to be composed into feature pages in Phase 8

## Output Specification

- `packages/luca-studio/components/editor/code-mirror-wrapper.tsx`
- `packages/luca-studio/components/editor/model-routing-grid.tsx`
- `packages/luca-studio/components/editor/entity-tree.tsx`
- `packages/luca-studio/components/editor/index.ts`
