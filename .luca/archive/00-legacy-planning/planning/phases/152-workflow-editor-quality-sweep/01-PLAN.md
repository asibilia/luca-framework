---
id: 152-01
title: Workflow Editor Quality Sweep
phase: 152
wave: 1
gap_closure: true
tags: [quality, accessibility, conventions, dry]
---

# Plan 152-01: Workflow Editor Quality Sweep

## Objective

Address all code quality findings from the v4.3.0 milestone audit (6 HIGH, 14 MEDIUM, 16 LOW) and post-audit review agents (3 HIGH, 9 MEDIUM, 6 LOW). This is a pure quality pass — no functional changes, no new features.

**Scope:** `packages/luca-observer/` only

## Context

- @.planning/v4.3.0-MILESTONE-AUDIT.md
- @packages/luca-observer/lib/workflow-types.ts
- @packages/luca-observer/lib/workflow-topology.ts
- @packages/luca-observer/components/workflow-editor/workflow-canvas.tsx
- @packages/luca-observer/components/workflow-editor/auto-layout.ts
- @packages/luca-observer/components/workflow-editor/edge-styles.ts
- @packages/luca-observer/components/workflow-editor/complexity-filter.tsx
- @packages/luca-observer/components/workflow-editor/workflow-stats-bar.tsx
- @packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx
- @packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx
- @packages/luca-observer/components/workflow-editor/nodes/gate-node.tsx
- @packages/luca-observer/components/workflow-editor/nodes/skill-node.tsx
- @packages/luca-observer/components/workflow-editor/nodes/stage-group-node.tsx
- @packages/luca-observer/hooks/use-workflow-graph.ts

## Tasks

### Task 1: Dead code removal and rename

**Goal:** Remove all vestigial "step" references, dead dependency, and misleading function name.

**Steps:**

1. Remove `"step"` from `WorkflowNodeTypeSchema` in `workflow-types.ts`
2. Remove `"invokes"` from the edge type schema in `workflow-types.ts`
3. Remove `NODE_WIDTH["step"]` and `NODE_HEIGHT["step"]` from `auto-layout.ts`
4. Remove `"step"` entry from `NODE_TYPE_LABELS` in `workflow-sidebar.tsx`
5. Remove the `data.node_type === "step"` render branch in `workflow-sidebar.tsx`
6. Rename `applyDagreLayout` to `applyGroupedColumnLayout` in `auto-layout.ts`
7. Update the import in `workflow-canvas.tsx` to use `applyGroupedColumnLayout`
8. Remove `@dagrejs/dagre` from `package.json` and run `bun install`
9. Update stale JSDoc on `app/workflow-editor/page.tsx` — replace "Router → Planner → Executor → Verifier" with actual 7-stage pipeline description

**Verification:**

- `bunx --bun tsc --noEmit` passes in `packages/luca-observer`
- `grep -r '"step"' packages/luca-observer/components/workflow-editor/ packages/luca-observer/lib/workflow-types.ts` returns no matches
- `grep -r 'applyDagreLayout' packages/luca-observer/` returns no matches
- `grep -r '@dagrejs/dagre' packages/luca-observer/` returns no matches

### Task 2: Extract shared constants

**Goal:** Eliminate DRY violations by creating a single source of truth for tier display config and node type colors.

**Steps:**

1. Create `packages/luca-observer/lib/workflow-constants.ts`
2. Extract `TIER_DISPLAY_CONFIG` from `agent-node.tsx` and `workflow-sidebar.tsx` into the new file — include dot color (Tailwind class), header background, label, and description per tier
3. Extract `NODE_TYPE_COLORS` — include both hex (for minimap `nodeColor` function) and Tailwind class (for stats bar dots) per node type
4. Update `agent-node.tsx` to import `TIER_DISPLAY_CONFIG` from the shared file
5. Update `workflow-sidebar.tsx` to import `TIER_DISPLAY_CONFIG` from the shared file
6. Update `workflow-canvas.tsx` `minimapNodeColor()` to use `NODE_TYPE_COLORS`
7. Update `workflow-stats-bar.tsx` to use `NODE_TYPE_COLORS` Tailwind classes
8. Replace the inline SVG close button in `workflow-sidebar.tsx` with Lucide `X` icon: `import { X } from "lucide-react"` then `<X className="h-4 w-4" />`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -r 'TIER_CONFIG\|TIER_LABELS' packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx` shows only import, no local definition
- `grep -r '<svg' packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx` returns no matches

### Task 3: Convention compliance

**Goal:** Align with project conventions: lodash preference, cn() utility, typed edge styles, tier-derived colors.

**Steps:**

1. **Stats bar lodash + countBy:** In `workflow-stats-bar.tsx`, replace the four `.filter().length` calls with `lodash/countBy` on `node.data.node_type`:
   ```typescript
   import countBy from "lodash/countBy";
   const counts = countBy(nodes, (n) => n.data?.node_type);
   const stages = counts["stage-group"] ?? 0;
   const agents = counts["agent"] ?? 0;
   // etc.
   ```
2. **muninn-config.ts lodash:** Replace `.sort()` with `lodash/orderBy` and `.filter()` with `lodash/filter`
3. **cn() adoption:** In `complexity-filter.tsx`, `agent-node.tsx`, and `stage-group-node.tsx`, replace template literal ternaries with `cn()` from `~/lib/utils`
4. **Type EDGE_STYLES:** In `edge-styles.ts`, change `Record<string, EdgeStyleConfig>` to `Partial<Record<WorkflowEdgeType, EdgeStyleConfig>>` and import `WorkflowEdgeType` from `~/lib/workflow-types`
5. **Routing preset color:** In `agent-node.tsx` and `workflow-sidebar.tsx`, derive the routing_preset badge/text color from the tier system (TIER_DISPLAY_CONFIG) instead of hardcoding amber. Look up the preset's tier via `resolveTierAtComplexity()` to get the correct accent color for the current complexity level.

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -rn '\.filter(' packages/luca-observer/components/workflow-editor/workflow-stats-bar.tsx` returns no matches
- `grep -rn '\.sort(' packages/luca-observer/lib/muninn-config.ts` returns no matches
- `grep -rn 'text-amber-400' packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx` returns no matches (color now derived from tier)

### Task 4: Schema-first validation

**Goal:** Add Zod safeParse at API boundary and in node components per schema-first-parsing rule.

**Steps:**

1. In `use-workflow-graph.ts`, replace the `as WorkflowTopologyResponse` cast with `WorkflowTopologyResponseSchema.safeParse(data)`. On failure, set the error state with validation details.
2. In each of the 4 node components (`agent-node.tsx`, `gate-node.tsx`, `skill-node.tsx`, `stage-group-node.tsx`), add `WorkflowNodeDataSchema.safeParse(data)` at the top. On failure, render a minimal fallback card showing the node ID and "Invalid data".
3. Import the schemas from `~/lib/workflow-types`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -rn 'safeParse' packages/luca-observer/hooks/use-workflow-graph.ts` returns a match
- `grep -rn 'safeParse' packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx` returns a match
- No `as WorkflowTopologyResponse` cast remains in `use-workflow-graph.ts`

### Task 5: Accessibility

**Goal:** Add proper ARIA semantics and focus management for keyboard/screen reader users.

**Steps:**

1. In `complexity-filter.tsx`:
   - Add `role="radiogroup"` and `aria-label="Complexity level"` to the button container
   - Add `role="radio"` and `aria-checked={isSelected}` to each button
   - Add `tabIndex={isSelected ? 0 : -1}` for roving tabindex pattern
   - Add arrow key handler to move between options
2. In `workflow-sidebar.tsx`:
   - Add a `ref` to the sidebar panel or close button
   - Use `useEffect` to focus the close button when `selectedNode` changes from null to a value
   - Add `aria-label="Node details"` to the sidebar panel
   - Ensure focus returns to canvas on close (store previous `activeElement`)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -rn 'role="radiogroup"' packages/luca-observer/components/workflow-editor/complexity-filter.tsx` returns a match
- `grep -rn 'aria-checked' packages/luca-observer/components/workflow-editor/complexity-filter.tsx` returns a match
- `grep -rn 'useRef\|focus' packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx` returns matches for focus management

### Task 6: Visual consistency and NodeCard extraction

**Goal:** Standardize visual details across node types and extract shared card wrapper.

**Steps:**

1. **Handle styling:** Standardize all node Handle elements to use `!bg-muted-foreground/40 !border-border/40` (or a shared constant). Update agent-node, skill-node, gate-node to use the same pattern. If gate handles intentionally differ (amber accent), add a comment explaining why.
2. **Stage-group min-size:** Add `min-h-[120px] min-w-[300px]` to the stage-group-node outer div as fallback sizing alongside `h-full w-full`.
3. **Font size floor:** Replace all `text-[9px]` with `text-[10px]` in agent-node, skill-node, gate-node, and workflow-sidebar (badge labels).
4. **Page height comment:** Add a comment to `app/workflow-editor/page.tsx` explaining the `12rem` calc: `{/* 12rem = nav (4rem) + page header (4rem) + vertical padding (4rem) */}`
5. **NodeCard extraction:** Create `components/workflow-editor/nodes/node-card.tsx` with a shared wrapper component that provides:
   - Rounded card with border and background
   - Header slot (colored bar with title)
   - Body slot (content area)
   - Configurable accent color
6. Refactor `agent-node.tsx`, `gate-node.tsx`, and `skill-node.tsx` to use `NodeCard` instead of duplicating the card structure.

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `grep -rn 'text-\[9px\]' packages/luca-observer/components/workflow-editor/` returns no matches
- `grep -rn 'NodeCard' packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx` confirms usage
- Stage-group node renders at minimum 300x120px even without explicit dimensions

### Task 7: Documentation

**Goal:** Document known duplication risks to prevent silent drift.

**Steps:**

1. In `workflow-topology.ts`, add prominent `// DUPLICATION NOTE:` block comments above `ROUTING_PRESETS` and `AGENTS`:
   ```
   // DUPLICATION NOTE: This is a read-only mirror of MODEL_ROUTING_TABLE
   // from src/complexity/__helpers/model-routing.ts.
   // Canonical source: src/complexity/__helpers/model-routing.ts
   // These cannot be imported directly (Next.js build boundary).
   // Keep in sync manually when routing presets change.
   ```
2. Add similar note above the AGENTS array:
   ```
   // DUPLICATION NOTE: Agent definitions mirrored from src/agents/ and src/skills/.
   // Canonical sources: src/agents/*/*.agent.ts, src/skills/*/*.skill.ts
   // Update when agents/skills are added, removed, or change stages.
   ```

**Verification:**

- `grep -rn 'DUPLICATION NOTE' packages/luca-observer/lib/workflow-topology.ts` returns 2 matches

## Success Criteria

- [ ] Zero TypeScript errors (`bunx --bun tsc --noEmit`)
- [ ] No dead "step"/"invokes" references remain
- [ ] No `@dagrejs/dagre` dependency
- [ ] TIER_DISPLAY_CONFIG and NODE_TYPE_COLORS defined in exactly one place
- [ ] All array operations use lodash (stats-bar, muninn-config)
- [ ] All conditional classNames use cn() (complexity-filter, agent-node, stage-group-node)
- [ ] API response validated with safeParse (hook + 4 node components)
- [ ] ARIA radiogroup on complexity filter
- [ ] Focus management on sidebar open/close
- [ ] Consistent Handle styling across all node types
- [ ] No text-[9px] remaining
- [ ] NodeCard wrapper used by all 3 card node types
- [ ] Duplication risk documented in topology file
- [ ] Routing preset badge color derived from tier system
- [ ] Visual rendering unchanged (verified at http://localhost:3456/workflow-editor)
