# Phase 146: Foundation & React Flow Setup - Research

**Researched:** 2026-03-13
**Domain:** React Flow integration, Next.js dynamic import, Observer page patterns
**Confidence:** HIGH

## Summary

This phase installs `@xyflow/react` v12 into the Observer app and creates the initial workflow editor page following existing codebase patterns. The Observer already has an identical pattern for a graph visualization library (`react-force-graph-2d`) loaded via `next/dynamic` with `ssr: false`, making this a well-trodden path.

The existing codebase provides clear templates: the knowledge-graph page demonstrates the PageContainer/ErrorBoundary/LoadingSkeleton pattern, the graph-canvas.tsx demonstrates dynamic import with loading placeholder, and the sidebar navigation demonstrates how to add new pages. The phase is straightforward pattern-replication with a new library.

**Primary recommendation:** Mirror the knowledge-graph page pattern exactly. Use `next/dynamic` with `ssr: false` for the ReactFlow component wrapper, hardcode 4 test nodes (Router, Planner, Executor, Verifier) with edges, and use React Flow's `colorMode="dark"` for theme compatibility.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library       | Version  | Purpose                 | Why Standard                                                                                                              |
| ------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| @xyflow/react | ^12.10.1 | Node-based graph editor | Official React Flow v12; maintained by xyflow team; 20k+ GitHub stars; only serious React option for editable node graphs |
| react         | ^19      | UI framework            | Already in project                                                                                                        |
| next          | ^15      | App Router framework    | Already in project                                                                                                        |

### Supporting

| Library      | Version  | Purpose                       | When to Use                                                         |
| ------------ | -------- | ----------------------------- | ------------------------------------------------------------------- |
| lucide-react | ^0.577.0 | Icons (Workflow icon for nav) | Already in project; nav icon                                        |
| jotai        | ^2       | State management              | Already in project; future phases will use atoms for workflow state |

### Alternatives Considered

| Instead of    | Could Use           | Tradeoff                                                              |
| ------------- | ------------------- | --------------------------------------------------------------------- |
| @xyflow/react | react-flow-renderer | Old name, deprecated; @xyflow/react IS the current version            |
| @xyflow/react | vis-network         | Not React-native; lacks node editing/handle UX                        |
| @xyflow/react | d3 custom           | Massive effort; React Flow handles drag, zoom, handles, selection OOB |

**Installation:**

```bash
cd packages/luca-observer && bun add @xyflow/react
```

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-observer/
├── app/workflow-editor/
│   └── page.tsx                    # Page component (mirrors knowledge-graph/page.tsx)
├── components/workflow-editor/
│   └── workflow-canvas.tsx         # Dynamic-imported ReactFlow wrapper (mirrors graph-canvas.tsx)
├── hooks/
│   └── (future: use-workflow-editor.ts)  # Not needed in Phase 146 -- hardcoded data
├── lib/
│   └── constants.ts               # MODIFIED: add NAV_ITEMS entry
└── components/layout/
    └── sidebar.tsx                 # MODIFIED: add Workflow icon to ICON_MAP
```

### Pattern 1: Page Shell (PageContainer + ErrorBoundary + LoadingSkeleton)

**What:** Every Observer page wraps content in PageContainer with title/subtitle/actions, wraps data-dependent sections in ErrorBoundary, and shows LoadingSkeleton during loading.
**When to use:** Every page in the Observer app.
**Example:**

```typescript
// Source: app/decisions/page.tsx (simplest existing example)
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";

export default function WorkflowEditorPage() {
  return (
    <PageContainer
      title="Workflow Editor"
      subtitle="Visual workflow graph editor"
    >
      <ErrorBoundary name="WorkflowCanvas">
        <div className="h-[calc(100vh-12rem)]">
          <WorkflowCanvas />
        </div>
      </ErrorBoundary>
    </PageContainer>
  );
}
```

### Pattern 2: Dynamic Import with SSR: false

**What:** Client-only libraries that use DOM/Canvas APIs must be loaded via `next/dynamic` with `ssr: false` to prevent SSR crashes.
**When to use:** Any library that accesses `window`, `document`, Canvas API, or DOM measurement.
**Example:**

```typescript
// Source: components/knowledge-graph/graph-canvas.tsx:29
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <p className="font-mono text-xs text-muted-foreground">
        Loading graph engine...
      </p>
    </div>
  ),
});
```

For React Flow, the pattern is nearly identical but we import the component from a local wrapper file (not directly from the library), because ReactFlow requires CSS import and ReactFlowProvider context:

```typescript
// components/workflow-editor/workflow-canvas.tsx
"use client";

import dynamic from "next/dynamic";

const WorkflowCanvasInner = dynamic(
  () => import("./workflow-canvas-inner").then((mod) => mod.WorkflowCanvasInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading workflow editor...
        </p>
      </div>
    ),
  },
);

export function WorkflowCanvas() {
  return <WorkflowCanvasInner />;
}
```

**IMPORTANT ALTERNATIVE:** A simpler approach (matching the existing graph-canvas.tsx more closely) is to do the dynamic import directly in the page or in a single workflow-canvas.tsx file. The CSS can be imported at the top of the client component, and ReactFlowProvider can wrap the ReactFlow component in the same file. This avoids the two-file split.

```typescript
// Simpler: single-file approach in workflow-canvas.tsx
"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ... component that uses ReactFlow directly
```

Then the page does:

```typescript
const WorkflowCanvas = dynamic(
  () => import("~/components/workflow-editor/workflow-canvas").then(m => m.WorkflowCanvas),
  { ssr: false, loading: () => <LoadingPlaceholder /> },
);
```

This single-file approach is closer to how the existing graph-canvas.tsx pattern works and is recommended for Phase 146.

### Pattern 3: NAV_ITEMS + ICON_MAP Registration

**What:** Navigation is driven by a `NAV_ITEMS` array in `lib/constants.ts` with string icon names, resolved in `sidebar.tsx` via an `ICON_MAP` record.
**When to use:** When adding a new page to the sidebar.
**Example:**

```typescript
// lib/constants.ts -- add entry at index 6 (after Knowledge Graph)
{ href: "/workflow-editor", label: "Workflow Editor", icon: "Workflow" },

// components/layout/sidebar.tsx -- add to imports and ICON_MAP
import { ..., Workflow } from "lucide-react";
const ICON_MAP: Record<string, LucideIcon> = {
  // ... existing entries
  Workflow,
};
```

### Anti-Patterns to Avoid

- **Do NOT use `useNodesState`/`useEdgesState` helper hooks from React Flow**: These were convenient shortcuts in older versions but the official docs now recommend `useState` + `applyNodeChanges`/`applyEdgeChanges` for explicit control. The Phase 146 hardcoded data does not even need state management -- static nodes/edges are fine.
- **Do NOT create a separate CSS file for React Flow overrides**: Import `@xyflow/react/dist/style.css` directly in the client component. Theme overrides (if needed) go in Tailwind CSS.
- **Do NOT use `ReactFlowProvider` unless hooks are needed outside the `<ReactFlow>` tree**: For Phase 146 (hardcoded data, no external hook access), ReactFlowProvider is not needed.
- **Do NOT use `nodeTypes` as inline object**: Define `nodeTypes` outside the component to avoid re-renders. Even for Phase 146 where default node types suffice, if custom types are added later they must be defined as a module-level constant.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem               | Don't Build                | Use Instead                            | Why                                                          |
| --------------------- | -------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Graph layout/zoom/pan | Custom canvas with d3      | `<ReactFlow fitView>` + `<Controls />` | React Flow handles viewport, zoom, pan, minimap OOB          |
| Node drag/drop        | Custom drag handlers       | ReactFlow built-in                     | Handles drag, snap, boundary constraints                     |
| Background grid       | Custom CSS grid background | `<Background variant="dots" />`        | React Flow Background component with dot/line/cross variants |
| Dark mode theming     | Custom CSS variables       | `colorMode="dark"` prop on ReactFlow   | Built-in dark mode support in v12                            |
| Loading state         | Custom spinner             | `next/dynamic` `loading` option        | Same pattern as existing graph-canvas.tsx                    |
| Error boundary        | Custom try/catch           | `<ErrorBoundary>` shared component     | Already exists in components/shared/                         |

**Key insight:** React Flow v12 provides built-in dark mode via `colorMode="dark"`, built-in controls via `<Controls />`, and built-in backgrounds via `<Background />`. Do not replicate these with custom implementations.

## Common Pitfalls

### Pitfall 1: Missing CSS Import

**What goes wrong:** React Flow renders invisible or broken nodes/edges with no visible error.
**Why it happens:** `@xyflow/react/dist/style.css` must be imported. Without it, all React Flow internal styles are missing.
**How to avoid:** Import CSS at the top of the client component file that renders ReactFlow:

```typescript
import "@xyflow/react/dist/style.css";
```

**Warning signs:** Nodes render but handles are invisible, edges don't appear, controls look broken.

### Pitfall 2: SSR Crash Without Dynamic Import

**What goes wrong:** `ReferenceError: window is not defined` or `document is not defined` during server-side rendering.
**Why it happens:** React Flow uses DOM APIs internally. Next.js App Router server-renders by default.
**How to avoid:** Always use `next/dynamic` with `ssr: false` for the component that imports React Flow.
**Warning signs:** Build errors or hydration mismatch errors in the console.

### Pitfall 3: Container Must Have Explicit Dimensions

**What goes wrong:** React Flow canvas renders as 0x0 pixels (nothing visible).
**Why it happens:** ReactFlow needs a parent with explicit width AND height. A simple `<div>` without height won't work.
**How to avoid:** Use CSS like `h-[calc(100vh-12rem)]` (matching the knowledge-graph pattern) on the container div.
**Warning signs:** ReactFlow component mounts but no nodes are visible. Console may show size warnings.

### Pitfall 4: Inline nodeTypes Causes Infinite Re-renders

**What goes wrong:** React Flow re-initializes every render, losing node positions and state.
**Why it happens:** If `nodeTypes` is defined inside the component, it creates a new object reference every render.
**How to avoid:** Define `nodeTypes` as a module-level constant, outside any component.
**Warning signs:** Performance issues, nodes jumping back to initial positions, excessive re-renders.

### Pitfall 5: React Flow CSS Conflicts with Tailwind

**What goes wrong:** React Flow's internal styles (handles, edges, controls) look wrong or get overridden.
**Why it happens:** Tailwind's preflight CSS reset can interfere with React Flow's base styles.
**How to avoid:** Import React Flow CSS AFTER Tailwind globals, or ensure the import order in the client component respects specificity. In this codebase, globals.css is imported in layout.tsx (server component), and React Flow CSS is imported in the client component -- this ordering is correct since the client-side CSS will load after globals.
**Warning signs:** Buttons in Controls panel look unstyled, handle dots are wrong size.

## Code Examples

Verified patterns from official sources:

### Hardcoded Nodes & Edges for Phase 146

```typescript
// Source: React Flow official docs, adapted for Luca workflow
import type { Node, Edge } from "@xyflow/react";
import { Position } from "@xyflow/react";

const initialNodes: Node[] = [
  {
    id: "router",
    type: "default",
    position: { x: 250, y: 0 },
    data: { label: "Router" },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
  {
    id: "planner",
    type: "default",
    position: { x: 100, y: 150 },
    data: { label: "Planner" },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
  {
    id: "executor",
    type: "default",
    position: { x: 250, y: 300 },
    data: { label: "Executor" },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
  {
    id: "verifier",
    type: "default",
    position: { x: 400, y: 150 },
    data: { label: "Verifier" },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
];

const initialEdges: Edge[] = [
  { id: "e-router-planner", source: "router", target: "planner" },
  { id: "e-planner-executor", source: "planner", target: "executor" },
  { id: "e-executor-verifier", source: "executor", target: "verifier" },
  { id: "e-verifier-router", source: "verifier", target: "router" },
];
```

### Minimal ReactFlow Component (Dark Mode)

```typescript
// Source: React Flow official docs + Observer codebase patterns
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export function WorkflowCanvas() {
  return (
    <ReactFlow
      nodes={initialNodes}
      edges={initialEdges}
      colorMode="dark"
      fitView
    >
      <Background variant="dots" gap={16} size={1} />
      <Controls />
    </ReactFlow>
  );
}
```

### Dynamic Import Pattern (Following graph-canvas.tsx)

```typescript
// In the page file (app/workflow-editor/page.tsx)
import dynamic from "next/dynamic";

const WorkflowCanvas = dynamic(
  () =>
    import("~/components/workflow-editor/workflow-canvas").then(
      (mod) => mod.WorkflowCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading workflow editor...
        </p>
      </div>
    ),
  },
);
```

### NAV_ITEMS Addition

```typescript
// lib/constants.ts -- insert after Knowledge Graph entry
{ href: "/workflow-editor", label: "Workflow Editor", icon: "Workflow" },
```

### Sidebar ICON_MAP Addition

```typescript
// components/layout/sidebar.tsx -- add to lucide-react imports
import { ..., Workflow } from "lucide-react";

// Add to ICON_MAP
const ICON_MAP: Record<string, LucideIcon> = {
  // ... existing entries
  Workflow,
};
```

## State of the Art

| Old Approach                                | Current Approach                                     | When Changed | Impact                                   |
| ------------------------------------------- | ---------------------------------------------------- | ------------ | ---------------------------------------- |
| `reactflow` package                         | `@xyflow/react` package                              | v12 (2024)   | New package name, new import paths       |
| `useNodesState` / `useEdgesState`           | `useState` + `applyNodeChanges` / `applyEdgeChanges` | v12 docs     | More explicit, better TypeScript support |
| Manual dark mode CSS                        | `colorMode="dark"` prop                              | v12          | Built-in dark mode via CSS variables     |
| `nodesDraggable` / `nodesConnectable` props | Individual node `draggable` / `connectable`          | v12          | Per-node control (global still works)    |
| Width/height on wrapper div only            | `width`/`height` definable on nodes                  | v12          | Better server-side rendering support     |

**Deprecated/outdated:**

- `reactflow` package: Renamed to `@xyflow/react` in v12. Do not use the old package name.
- `useNodesState` / `useEdgesState`: Still exported but official docs now recommend manual state management for better control.

## Open Questions

Things that couldn't be fully resolved:

1. **React Flow CSS + Tailwind v4 interaction**
   - What we know: Tailwind v4 changed how preflight works. React Flow CSS should still work since it uses inline imports.
   - What's unclear: Whether any Tailwind v4-specific reset interferes with React Flow's internal styles.
   - Recommendation: Test visually after installation. If controls/handles look broken, add a Tailwind layer configuration to preserve React Flow styles. This is LOW risk since the existing react-force-graph-2d works fine.

2. **colorMode="dark" vs CSS class-based dark mode**
   - What we know: Observer uses CSS class `.dark` on `<html>`. React Flow v12 has `colorMode="dark"` prop.
   - What's unclear: Whether `colorMode="dark"` conflicts with or duplicates the existing dark mode approach.
   - Recommendation: Use `colorMode="dark"` since the Observer app defaults to dark mode. If dynamic theme switching is needed later, read the theme from localStorage/Jotai and pass it as a prop. For Phase 146, hardcode `"dark"`.

## Files to Create/Modify

### Create

| File                                             | Purpose                                                 |
| ------------------------------------------------ | ------------------------------------------------------- |
| `app/workflow-editor/page.tsx`                   | Page shell with PageContainer, dynamic import of canvas |
| `components/workflow-editor/workflow-canvas.tsx` | ReactFlow wrapper with hardcoded nodes, CSS import      |

### Modify

| File                            | Change                                              |
| ------------------------------- | --------------------------------------------------- |
| `lib/constants.ts`              | Add NAV_ITEMS entry at index 6                      |
| `components/layout/sidebar.tsx` | Add `Workflow` to lucide-react imports and ICON_MAP |
| `package.json`                  | Add `@xyflow/react` dependency (via `bun add`)      |

## Sources

### Primary (HIGH confidence)

- React Flow official docs: https://reactflow.dev/learn/getting-started/installation-and-requirements -- installation, CSS requirement
- React Flow official docs: https://reactflow.dev/learn/getting-started/building-a-flow -- basic node/edge API
- React Flow official docs: https://reactflow.dev/learn/getting-started/adding-interactivity -- state management pattern
- React Flow official docs: https://reactflow.dev/api-reference/react-flow -- ReactFlow component props, colorMode
- React Flow official docs: https://reactflow.dev/api-reference/components/handle -- Handle API for custom nodes
- React Flow official docs: https://reactflow.dev/api-reference/react-flow-provider -- ReactFlowProvider usage
- React Flow official docs: https://reactflow.dev/api-reference/components/background -- Background variants
- npm registry API: @xyflow/react v12.10.1, peerDependencies: `react: ">=17"`, `react-dom: ">=17"`

### Secondary (MEDIUM confidence)

- Existing codebase: `components/knowledge-graph/graph-canvas.tsx` -- dynamic import pattern
- Existing codebase: `app/knowledge-graph/page.tsx` -- page shell pattern
- Existing codebase: `app/decisions/page.tsx` -- simplified page pattern
- Existing codebase: `lib/constants.ts` -- NAV_ITEMS structure
- Existing codebase: `components/layout/sidebar.tsx` -- ICON_MAP resolution

### Tertiary (LOW confidence)

- React Flow + Tailwind v4 interaction -- not verified, based on general CSS layering knowledge

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - npm registry confirms version/peer deps, official docs verified
- Architecture: HIGH - copying existing codebase patterns exactly
- Pitfalls: HIGH - CSS import, SSR, container dimensions are well-documented in official docs
- Dark mode integration: MEDIUM - colorMode="dark" is documented but Tailwind v4 interaction untested

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable library, slow-moving API)
