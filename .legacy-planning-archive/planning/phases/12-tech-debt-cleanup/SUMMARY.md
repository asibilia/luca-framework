# Phase 12 -- Tech Debt Cleanup

## Objective

Remove legacy code, add missing barrels, create schema drift tooling, and apply minor JSDoc/style fixes from the studio audit.

## Tasks Completed

### TD-2: Legacy workflow-editor/ cleanup

- **Moved 9 files** from `components/workflow-editor/` to `components/workflow/` (preserving git history via `git mv`):
  - `auto-layout.ts`, `edge-styles.ts`, `complexity-filter.tsx`, `workflow-stats-bar.tsx`
  - `nodes/node-card.tsx`, `nodes/agent-node.tsx`, `nodes/gate-node.tsx`, `nodes/skill-node.tsx`, `nodes/stage-group-node.tsx`
- **Deleted 2 dead files**: `workflow-canvas.tsx` (old canvas, replaced by `pipeline-canvas.tsx`), `workflow-sidebar.tsx` (only used by old canvas)
- **Updated 5 files** with new import paths: `pipeline-canvas.tsx`, `canvas-toolbar.tsx`, `nodes/agent-node.tsx`, `nodes/gate-node.tsx`, `nodes/skill-node.tsx`
- **Result**: `components/workflow-editor/` directory fully removed

### TD-3: Add barrel index.ts files

- `components/layout/index.ts` -- 13 exports (LayoutShell, DetailPanel, NavRail, ResizableSplit, NavContent, Header, etc.)
- `components/agents/index.ts` -- 4 exports (AgentConfigForm, AgentPreview, AgentTabContainer, ModelRoutingDisplay)
- `stores/index.ts` -- all atoms from 9 store modules (config-atoms, entity-atoms, dirty-tracking, layout, pipeline-atoms, session, vault, theme, filters)
- `lib/README.md` -- directory contract documenting all 23 modules and schema coupling policy (no barrel per tree-shaking concern)

### TD-4: Create check:studio-drift script

- Created `scripts/check-studio-drift.ts` -- compares Zod schema field names between studio mirrors and src/ originals
- Added `"check:studio-drift"` script to `package.json`
- Covers 4 schema pairs: LedgerEntrySchema, HarnessResultSnapshotSchema, CheckResultSnapshotSchema, ParsedErrorSnapshotSchema
- Reports drift, snake_case/camelCase differences, and missing patterns clearly

### LOW-1: Add missing JSDoc

- Added JSDoc to `minimapNodeColor()` in `pipeline-canvas.tsx`
- Added JSDoc to `NODE_WIDTH` and `NODE_HEIGHT` constants in `auto-layout.ts`
- Confirmed `SaveBarProps` already has complete JSDoc (no change needed)

### LOW-2: Deprecated export timeline

- Updated `@deprecated` JSDoc on `NAV_ITEMS` in `lib/constants.ts` to include: "Will be removed in v9.0.0."

### LOW-3: Fix destructuring defaults in CodeMirrorWrapper

- Extracted `DEFAULT_VALUE = ""` and `DEFAULT_READ_ONLY = false` as named constants
- Component now uses `rawValue ?? DEFAULT_VALUE` instead of destructuring defaults
- Updated JSDoc on props to document default values

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
- `bun run check:studio-drift` runs and produces expected output
- No remaining imports from `components/workflow-editor/`

## Deviations

None. All tasks executed as specified.
