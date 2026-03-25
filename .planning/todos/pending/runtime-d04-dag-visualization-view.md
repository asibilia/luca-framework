---
title: "Runtime D04: DAG visualization view in luca-observer"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: [D01, D02, D03, A09]
phase: runtime-d
estimated_files: 4
---

## Context

Instead of building a new vanilla SVG/Elk.js DAG view in luca-studio, we extend the existing luca-observer workflow editor to visualize DAG definitions. The observer already has a production-ready React Flow graph at `/workflow-editor` with custom node types, auto-layout, complexity filtering, and a detail sidebar. We add a new `/dag-viewer` route that consumes `dagToTopology()` output (from task A09) through the same React Flow infrastructure.

### What Already Exists (no changes needed)

These files are reused as-is:

- `packages/luca-observer/components/workflow-editor/workflow-canvas.tsx` — React Flow wrapper
- `packages/luca-observer/components/workflow-editor/nodes/stage-group-node.tsx` — Stage container
- `packages/luca-observer/components/workflow-editor/nodes/agent-node.tsx` — Agent card
- `packages/luca-observer/components/workflow-editor/nodes/skill-node.tsx` — Skill card
- `packages/luca-observer/components/workflow-editor/nodes/gate-node.tsx` — Gate card
- `packages/luca-observer/components/workflow-editor/auto-layout.ts` — Grouped column layout
- `packages/luca-observer/components/workflow-editor/edge-styles.ts` — Edge styling
- `packages/luca-observer/components/workflow-editor/workflow-sidebar.tsx` — Node detail panel
- `packages/luca-observer/lib/workflow-types.ts` — Zod schemas
- `packages/luca-observer/lib/workflow-constants.ts` — Color/tier config

## Task

### 1. Create API route: `packages/luca-observer/app/api/workflow/dag/route.ts`

This endpoint imports `dagToTopology()` and serves the phase pipeline DAG as topology data. The observer's `useWorkflowGraph` hook (or a similar hook) fetches this endpoint.

```typescript
/**
 * GET /api/workflow/dag
 *
 * Returns the phase pipeline DAG definition transformed into
 * WorkflowTopologyResponse format for the React Flow editor.
 *
 * Query params:
 *   - complexity: Optional complexity level for tier resolution
 *
 * @see src/workflow/__helpers/dag-visualizer.ts — dagToTopology()
 * @see src/workflow/__helpers/phase-pipeline.ts — phasePipelineDAG
 */
import { NextResponse } from "next/server";

// NOTE: These imports cross the Next.js/src boundary. They work because
// luca-observer's tsconfig includes path aliases to src/. If this fails
// at build time, the alternative is to copy the DAG definition into
// luca-observer/lib/ (see Notes section).
import { dagToTopology } from "~/workflow";
import { phasePipelineDAG } from "~/workflow";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const complexity = searchParams.get("complexity") ?? undefined;

  try {
    const topology = dagToTopology(phasePipelineDAG, complexity);
    return NextResponse.json(topology);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate DAG topology",
      },
      { status: 500 },
    );
  }
}
```

**Import boundary decision:** The `src/workflow/` imports may not resolve in Next.js due to the build boundary. If they don't, create a thin adapter file at `packages/luca-observer/lib/dag-adapter.ts` that imports `dagToTopology` and `phasePipelineDAG` and re-exports them. Add `../../src` to the observer's `tsconfig.json` paths if needed:

```json
{
  "compilerOptions": {
    "paths": {
      "~/workflow": ["../../src/workflow"]
    }
  }
}
```

### 2. Create hook: `packages/luca-observer/hooks/use-dag-graph.ts`

```typescript
"use client";

/**
 * React hook that fetches the DAG topology from /api/workflow/dag
 * and returns React Flow-compatible nodes and edges.
 *
 * Identical to useWorkflowGraph but hits the DAG endpoint instead
 * of the static topology endpoint.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Edge, Node } from "@xyflow/react";

import {
  WorkflowTopologyResponseSchema,
  type WorkflowEdgeData,
  type WorkflowNodeData,
} from "~/lib/workflow-types";

export interface DagGraphData {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge<WorkflowEdgeData>[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  selectedComplexity?: string;
}

export function useDagGraph(complexity?: string): DagGraphData {
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<WorkflowEdgeData>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedComplexity, setSelectedComplexity] = useState<
    string | undefined
  >();

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchDag = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = complexity
        ? `?complexity=${encodeURIComponent(complexity)}`
        : "";
      const res = await fetch(`/api/workflow/dag${params}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Fetch DAG topology failed: ${res.status}`);
      }

      const raw = await res.json();
      const parseResult = WorkflowTopologyResponseSchema.safeParse(raw);

      if (!parseResult.success) {
        throw new Error(
          `Invalid DAG topology: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        );
      }

      const data = parseResult.data;

      const flowNodes: Node<WorkflowNodeData>[] = data.nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data,
        type: n.type,
        ...(n.parent_id && { parentId: n.parent_id }),
        ...(n.extent && { extent: n.extent }),
        ...(n.style && { style: n.style }),
      }));

      const flowEdges: Edge<WorkflowEdgeData>[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedComplexity(data.selected_complexity);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Failed to fetch DAG topology",
      );
    } finally {
      setLoading(false);
    }
  }, [complexity]);

  useEffect(() => {
    void fetchDag();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchDag]);

  const refresh = useCallback(() => {
    void fetchDag();
  }, [fetchDag]);

  return { nodes, edges, loading, error, refresh, selectedComplexity };
}
```

### 3. Create page: `packages/luca-observer/app/dag-viewer/page.tsx`

```typescript
/**
 * DAG Viewer page.
 *
 * Renders the typed WorkflowDAG definition as an interactive React Flow graph,
 * reusing the same node types and layout as the workflow editor.
 *
 * This page shows the DAG source-of-truth definition (from src/workflow/),
 * while /workflow-editor shows the static curated topology.
 */
import { DagCanvas } from "~/components/dag-viewer/dag-canvas";

export const metadata = {
  title: "DAG Viewer | Luca Observer",
};

export default function DagViewerPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <h1 className="text-sm font-medium">DAG Viewer</h1>
          <p className="text-xs text-muted-foreground">
            Typed workflow DAG definition — source of truth for the pipeline
          </p>
        </div>
      </div>
      <div className="flex-1">
        <DagCanvas />
      </div>
    </div>
  );
}
```

### 4. Create canvas component: `packages/luca-observer/components/dag-viewer/dag-canvas.tsx`

```typescript
"use client";

/**
 * DagCanvas renders the typed WorkflowDAG as a React Flow v12 graph.
 *
 * Reuses the exact same node types, edge styles, layout, and sidebar
 * as the workflow editor. The only difference is the data source:
 * this component fetches from /api/workflow/dag (DAG-generated topology)
 * instead of /api/workflow/topology (static curated topology).
 */
import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";

import { useDagGraph } from "~/hooks/use-dag-graph";
import {
  NODE_TYPE_COLORS,
  NODE_TYPE_COLOR_DEFAULT,
} from "~/lib/workflow-constants";
import { applyEdgeStyles } from "~/components/workflow-editor/edge-styles";
import { applyGroupedColumnLayout } from "~/components/workflow-editor/auto-layout";
import { WorkflowSidebar } from "~/components/workflow-editor/workflow-sidebar";
import { WorkflowStatsBar } from "~/components/workflow-editor/workflow-stats-bar";
import { StageGroupNode } from "~/components/workflow-editor/nodes/stage-group-node";
import { AgentNode } from "~/components/workflow-editor/nodes/agent-node";
import { GateNode } from "~/components/workflow-editor/nodes/gate-node";
import { SkillNode } from "~/components/workflow-editor/nodes/skill-node";
import type { WorkflowNodeData } from "~/lib/workflow-types";

const nodeTypes: NodeTypes = {
  "stage-group": StageGroupNode,
  agent: AgentNode,
  skill: SkillNode,
  gate: GateNode,
};

function minimapNodeColor(node: Node): string {
  const nodeType = (node.data as WorkflowNodeData)?.node_type;
  return (
    (nodeType ? NODE_TYPE_COLORS[nodeType]?.hex : undefined) ??
    NODE_TYPE_COLOR_DEFAULT.hex
  );
}

function DagCanvasInner() {
  const { nodes, edges, loading, error, selectedComplexity } = useDagGraph();
  const { fitView } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    data: WorkflowNodeData;
  } | null>(null);

  const layoutNodes = useMemo(() => {
    const typed = nodes.map((node) => ({
      ...node,
      type: node.data.node_type,
      data: {
        ...node.data,
        ...(selectedComplexity && { selected_complexity: selectedComplexity }),
      },
    }));
    return applyGroupedColumnLayout(typed, edges);
  }, [nodes, edges, selectedComplexity]);

  const styledEdges = useMemo(() => applyEdgeStyles(edges), [edges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode({
        id: node.id,
        data: node.data as WorkflowNodeData,
      });
    },
    [],
  );

  const closeSidebar = useCallback(() => {
    setSelectedNode(null);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedNode(null);
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void fitView({ duration: 300 });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitView]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading DAG topology...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-destructive">
          Failed to load DAG: {error}
        </p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          No DAG topology data available
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={layoutNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={closeSidebar}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable
        nodeDragThreshold={5}
        nodesConnectable={false}
        elementsSelectable
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#374151"
        />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border/30 !shadow-lg"
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={minimapNodeColor}
          pannable
          zoomable
          className="!bg-card/90 !border-border/30"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
        <Panel position="top-left">
          <WorkflowStatsBar nodes={layoutNodes} edges={styledEdges} />
        </Panel>
        <Panel position="top-center">
          <div className="rounded-md border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            DAG Source of Truth — {nodes.length} steps
          </div>
        </Panel>
      </ReactFlow>
      <WorkflowSidebar selectedNode={selectedNode} onClose={closeSidebar} />
    </div>
  );
}

export function DagCanvas() {
  return (
    <ReactFlowProvider>
      <DagCanvasInner />
    </ReactFlowProvider>
  );
}
```

### 5. Add navigation link

In the app's navigation component (find the nav that includes the "Workflow Editor" link), add a link to `/dag-viewer`:

```tsx
<Link href="/dag-viewer" className={navItemClass}>
  DAG Viewer
</Link>
```

The exact file depends on the observer's layout structure. Check `packages/luca-observer/app/layout.tsx` or `packages/luca-observer/components/` for the navigation component.

## Verification

- [ ] `cd packages/luca-observer && bunx --bun tsc --noEmit` passes
- [ ] `/api/workflow/dag` returns JSON matching `WorkflowTopologyResponseSchema`
- [ ] `/dag-viewer` renders a React Flow graph with stage-group containers
- [ ] Each DAG step appears as a node inside its stage container
- [ ] `dependsOn` relationships render as edges between nodes
- [ ] Spine edges connect stage-group containers in pipeline order
- [ ] Click a node → sidebar opens with detail panel
- [ ] Mouse wheel zooms, drag pans
- [ ] Minimap shows color-coded nodes
- [ ] Escape key closes sidebar
- [ ] Ctrl+0 fits view
- [ ] Stats bar shows node/edge counts
- [ ] No `elkjs` dependency needed (uses existing React Flow + auto-layout)
- [ ] Navigation includes link to DAG Viewer

## Notes

- Depends on: D01 (luca-studio package scaffolding, though this work is in luca-observer), D02 (server), D03 (data layer for patterns), A09 (`dagToTopology()` transformer)
- **No new dependencies** — reuses existing `@xyflow/react` and all custom node components
- **No Elk.js** — the original D04 used Elk.js for layout. The existing `applyGroupedColumnLayout` from the workflow editor handles layout.
- **Import boundary risk**: `src/workflow/` may not be importable from the Next.js app. Fallback: serialize the DAG to JSON in a build step and load it as static data. The API route would read from `packages/luca-observer/data/phase-pipeline.json` instead of importing TypeScript.
- The DagCanvas component is ~95% identical to WorkflowCanvas. A future refactor could extract a shared `GraphCanvas` component that accepts a data hook as a prop, but that's out of scope for this task.
- The `/workflow-editor` (static topology) and `/dag-viewer` (DAG definition) pages will coexist. The static topology includes all 40+ agents with spawning relationships. The DAG view shows the 7-step pipeline definition. They serve different purposes.
