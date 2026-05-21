---
phase: 146
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 146 Plan 1: Foundation & React Flow Setup

## Objective

Install `@xyflow/react` into luca-observer and create the workflow editor page with a minimal hardcoded graph (Router, Planner, Executor, Verifier nodes) to prove React Flow v12 works with React 19 + Next.js 15 App Router. This establishes the foundation that all subsequent workflow editor phases build on.

## Context

Read these files before executing:

- @.planning/phases/146-foundation-react-flow/146-CONTEXT.md (locked decisions)
- @.planning/phases/146-foundation-react-flow/146-RESEARCH.md (patterns, pitfalls, code examples)
- @packages/luca-observer/app/knowledge-graph/page.tsx (page pattern to mirror)
- @packages/luca-observer/components/knowledge-graph/graph-canvas.tsx (dynamic import pattern)
- @packages/luca-observer/lib/constants.ts (NAV_ITEMS array to modify)
- @packages/luca-observer/components/layout/sidebar.tsx (ICON_MAP to modify)

## Tasks

### 1. Install @xyflow/react dependency

**Type:** auto
**TDD:** false
**Depends on:** none

Install the React Flow v12 package into the Observer app.

```bash
cd packages/luca-observer && bun add @xyflow/react
```

After installation, verify the dependency appears in `packages/luca-observer/package.json` and that `@xyflow/react` has `react: ">=17"` as its peer dependency (confirming React 19 compatibility).

**Files to create/edit:**

- `packages/luca-observer/package.json` (modified by bun add)

**Verification:**

- `grep "@xyflow/react" packages/luca-observer/package.json` shows the dependency
- `ls packages/luca-observer/node_modules/@xyflow/react/package.json` exists

### 2. Create workflow-canvas.tsx client component

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the React Flow wrapper component as a `"use client"` file that imports React Flow, its CSS, and renders 4 hardcoded nodes (Router, Planner, Executor, Verifier) with edges forming a cycle. This follows the single-file approach recommended in RESEARCH.md (matching graph-canvas.tsx pattern).

Key implementation details from research:

- Import `@xyflow/react/dist/style.css` at the top of the client component (Pitfall 1: invisible nodes without it)
- Use `colorMode="dark"` prop on ReactFlow (Observer defaults to dark mode)
- Use `fitView` prop to auto-zoom to fit all nodes
- Include `<Background variant="dots" />` and `<Controls />` from `@xyflow/react`
- Define `initialNodes` and `initialEdges` as module-level constants (Pitfall 4: inline nodeTypes causes re-renders)
- Use `Position.Bottom` / `Position.Top` for sourcePosition/targetPosition on nodes
- Do NOT use `useNodesState`/`useEdgesState` -- static data for Phase 146
- Do NOT use `ReactFlowProvider` -- no hooks needed outside the ReactFlow tree
- Export a named `WorkflowCanvas` function component

Node layout (diamond pattern):

- Router: `{ x: 250, y: 0 }` (top center)
- Planner: `{ x: 100, y: 150 }` (left middle)
- Executor: `{ x: 250, y: 300 }` (bottom center)
- Verifier: `{ x: 400, y: 150 }` (right middle)

Edges: Router->Planner, Planner->Executor, Executor->Verifier, Verifier->Router (cyclic workflow).

**Files to create/edit:**

- `packages/luca-observer/components/workflow-editor/workflow-canvas.tsx` (create)

**Verification:**

- File exists at the expected path
- File contains `"use client"` directive
- File contains `import "@xyflow/react/dist/style.css"`
- File exports `WorkflowCanvas`
- `initialNodes` and `initialEdges` are defined outside the component body

### 3. Create workflow-editor page with dynamic import

**Type:** auto
**TDD:** false
**Depends on:** 2

Create the page shell at `app/workflow-editor/page.tsx` following the PageContainer + ErrorBoundary pattern. Use `next/dynamic` with `ssr: false` to load WorkflowCanvas (Pitfall 2: SSR crash without dynamic import).

Key implementation details:

- `"use client"` directive (dynamic import needs client context)
- Dynamic import: `dynamic(() => import("~/components/workflow-editor/workflow-canvas").then(m => m.WorkflowCanvas), { ssr: false, loading: ... })`
- Loading placeholder: match the graph-canvas.tsx pattern (centered "Loading workflow editor..." text)
- Wrap canvas in `<ErrorBoundary name="WorkflowCanvas">`
- Container div needs explicit height: `h-[calc(100vh-12rem)]` (Pitfall 3: 0x0 canvas without explicit dimensions)
- PageContainer title: "Workflow Editor", subtitle: "Visual workflow graph editor"
- No actions bar needed for Phase 146 (no refresh/reset functionality yet)

**Files to create/edit:**

- `packages/luca-observer/app/workflow-editor/page.tsx` (create)

**Verification:**

- File exists at the expected path
- File uses `next/dynamic` with `ssr: false`
- File contains `h-[calc(100vh-12rem)]` container height
- File uses `PageContainer` and `ErrorBoundary`

### 4. Add nav item and sidebar icon

**Type:** auto
**TDD:** false
**Depends on:** none

Register the workflow editor page in the sidebar navigation.

**4a. Add NAV_ITEMS entry in lib/constants.ts:**

Insert after the Knowledge Graph entry (currently at index 5, which is `{ href: "/knowledge-graph", ... }`). The new entry goes at index 6:

```typescript
{ href: "/workflow-editor", label: "Workflow Editor", icon: "Workflow" },
```

This pushes Semantic Search and subsequent items down by one.

**4b. Add Workflow icon to sidebar.tsx:**

Add `Workflow` to the lucide-react import statement and add `Workflow` to the ICON_MAP record. Without this, the sidebar will render the fallback text instead of an icon.

**Files to create/edit:**

- `packages/luca-observer/lib/constants.ts` (modify)
- `packages/luca-observer/components/layout/sidebar.tsx` (modify)

**Verification:**

- `grep "workflow-editor" packages/luca-observer/lib/constants.ts` shows the nav entry
- `grep "Workflow" packages/luca-observer/components/layout/sidebar.tsx` shows the import and ICON_MAP entry

### 5. Type check and visual verification

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1, 2, 3, 4

Run the TypeScript type checker to confirm zero compilation errors, then visually confirm the page renders correctly.

```bash
cd packages/luca-observer && bunx --bun tsc --noEmit
```

After type check passes, start the dev server and verify:

- Navigate to `/workflow-editor` in the browser
- Sidebar shows "Workflow Editor" with the Workflow icon in the correct position (after Knowledge Graph)
- Page title reads "Workflow Editor" with subtitle "Visual workflow graph editor"
- React Flow canvas renders with 4 visible nodes (Router, Planner, Executor, Verifier)
- 4 edges connect the nodes in a cycle
- Background shows dot pattern
- Controls panel (zoom in/out/fit) appears in bottom-left corner
- Canvas supports pan (drag background) and zoom (scroll wheel)
- `fitView` auto-zooms so all nodes are visible on load
- Dark mode theming looks correct (no white/light artifacts)

**Files to create/edit:**

- None (verification only)

**Verification:**

- `bunx --bun tsc --noEmit` exits with code 0
- Visual inspection confirms 4 nodes, 4 edges, dark theme, controls, background dots
- No console errors related to React Flow, hydration, or missing CSS

## Verification

After all tasks complete, the following must be true:

1. **Dependency installed**: `@xyflow/react` appears in `packages/luca-observer/package.json` dependencies
2. **Type check passes**: `cd packages/luca-observer && bunx --bun tsc --noEmit` exits 0
3. **Page route works**: `/workflow-editor` renders without errors
4. **React Flow renders**: 4 nodes and 4 edges visible on the canvas
5. **Navigation works**: Sidebar shows "Workflow Editor" link with Workflow icon after Knowledge Graph
6. **Dark mode correct**: `colorMode="dark"` produces appropriate theming with no light-mode artifacts
7. **No SSR crashes**: Page loads without "window is not defined" or hydration mismatch errors

## Success Criteria

- React Flow v12 is proven compatible with React 19 + Next.js 15 App Router in the Observer app
- The workflow editor page follows established Observer patterns (PageContainer, ErrorBoundary, dynamic import)
- 4 hardcoded nodes render correctly with edges, background, and controls
- The page is accessible from the sidebar navigation
- Zero TypeScript errors across the entire Observer codebase

## Output Specification

- 2 files created: `app/workflow-editor/page.tsx`, `components/workflow-editor/workflow-canvas.tsx`
- 2 files modified: `lib/constants.ts` (NAV_ITEMS entry), `components/layout/sidebar.tsx` (Workflow icon)
- 1 file auto-modified: `package.json` (dependency added by bun add)
- All files under `packages/luca-observer/`
