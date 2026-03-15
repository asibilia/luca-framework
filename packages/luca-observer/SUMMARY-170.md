# Phase 170 — Observer Component DRY Cleanup

## Objective

Eliminate five categories of code duplication in `packages/luca-observer/`.

## Tasks Completed

### OBS-001: zoneColor extracted to lib/format.ts

- Removed from `session-status-hero.tsx` and `memory-timeline.tsx`
- Added `export function zoneColor(zone: string): string` to `lib/format.ts`
- Both components now import from `~/lib/format`

### OBS-002: formatAge extracted to lib/format.ts

- Removed from `session-status-hero.tsx` and `memory-health-indicator.tsx`
- Two versions had different null return values (`"--"` vs `""`); `"--"` chosen as canonical
- `memory-health-indicator.tsx` now guards with `data.checkpointAge !== null ? formatAge(...) : null` to preserve the "hide when no age" behaviour
- Added `export function formatAge(seconds: number | null): string` to `lib/format.ts`

### OBS-003: coherenceColor extracted to lib/format.ts (also covers percentColor)

- Removed local `coherenceColor` from `health-dashboard.tsx`, `context-usage-bar.tsx`, `memory-health-indicator.tsx`
- Removed local `percentColor` from `recall-effectiveness.tsx` (identical implementation — replaced with `coherenceColor`)
- Added `export function coherenceColor(score: number): string` to `lib/format.ts`

### OBS-004: BrainEngram exported from brain-panel.tsx

- Added `defaultExpanded?: boolean` prop (default `true`) to preserve existing behaviour
- Removed the verbatim copy in `enhanced-brain-tree.tsx` (was annotated "Copied from brain-panel.tsx")
- `enhanced-brain-tree.tsx` passes `defaultExpanded={false}` to match its original collapsed-by-default behaviour
- Removed unused `ChevronDown`, `ChevronRight` imports from `enhanced-brain-tree.tsx`

### OBS-005: KnowledgeGraphMini refactored to accept props

- Created `hooks/use-entity-clusters.ts` with `useEntityClusters(topN, minCount)` hook
- Removed internal fetch state from `KnowledgeGraphMini`; component now accepts `{ clusters, loading, error }` props
- `app/memory/page.tsx` wires `useEntityClusters()` and passes data down — consistent with all sibling sections

## Commits

1. `6bc60c28` — refactor(observer): extract zoneColor/formatAge/coherenceColor to lib/format.ts
2. `83ff6bdc` — refactor(observer): export BrainEngram from brain-panel, remove duplicate in enhanced-brain-tree
3. `736ddc47` — refactor(observer): lift KnowledgeGraphMini fetch into page via useEntityClusters hook

## Verification

- `bunx --bun tsc --noEmit` — no errors
- Net change: −262 lines added, +183 lines removed (net −79 lines) across 12 files
