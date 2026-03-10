# Phase 4: Knowledge Graph Explorer - Research

**Researched:** 2026-03-09
**Domain:** React canvas graph visualization (react-force-graph-2d) + MuninnDB knowledge graph
**Confidence:** HIGH

## Summary

This phase adds an interactive Knowledge Graph Explorer view to the luca-observer Next.js app. The primary library is `react-force-graph-2d` (v1.29.x), a React wrapper over d3-force that renders to Canvas. The observer already has the full MuninnDB API proxy layer (`muninn-route-helper.ts`, `muninn-config.ts`, `muninn-schemas.ts`) including `exportGraph`, `entityClusters`, `entity`, and `entityTimeline` endpoints -- all needed for this view.

The codebase has a well-established page architecture: `"use client"` page -> custom `useXxx` hook for data fetching -> `PageContainer` layout wrapper -> `ErrorBoundary`-wrapped child components. The new graph view follows this pattern exactly but with one addition: the graph canvas component must be loaded via `next/dynamic` with `{ ssr: false }` since Canvas APIs are browser-only.

Cluster supernodes (the density management strategy) are not a built-in feature of react-force-graph-2d. They must be implemented as a data transformation layer: collapse entity types into virtual "cluster" nodes in the graphData, use `nodeCanvasObject` for custom rendering (larger circles with count badges), and expand/collapse on click by swapping the graphData. This is a well-documented pattern from the library's own "expandable nodes" example.

**Primary recommendation:** Build a `use-knowledge-graph` hook that fetches graph data from existing `/api/muninn/export-graph` and `/api/muninn/entity-clusters` endpoints, transforms it into `{ nodes, links }` format with cluster supernodes, and manages expand/collapse state. Render with `ForceGraph2D` loaded via `next/dynamic`.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library              | Version   | Purpose                                          | Why Standard                                                                                                         |
| -------------------- | --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| react-force-graph-2d | ^1.29     | Force-directed graph rendering on Canvas         | ~160k weekly npm downloads, maintained by vasturiano, Canvas perf at 1000+ nodes, built-in zoom/pan/drag/hover/click |
| next/dynamic         | (bundled) | SSR-disabled dynamic import for Canvas component | Standard Next.js pattern for browser-only components                                                                 |

### Supporting

| Library      | Version           | Purpose                                                         | When to Use                                                    |
| ------------ | ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| jotai        | ^2 (installed)    | Graph view state (selected node, expanded clusters, zoom level) | Already used for sidebar/theme/filters; use for graph UI state |
| lodash       | ^4.17 (installed) | Data transformations (groupBy, orderBy for cluster building)    | Already a project dependency; follows lodash-preference rule   |
| lucide-react | (installed)       | Icon for sidebar nav item and UI controls                       | Already used for all nav icons                                 |

### Alternatives Considered

| Instead of           | Could Use                             | Tradeoff                                                         |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| react-force-graph-2d | @visx/network + d3-force              | More control but 500+ lines of boilerplate for same result       |
| react-force-graph-2d | reagraph                              | Built-in clustering but heavier bundle, WebGL dependency         |
| react-force-graph-2d | cytoscape.js                          | More analytics features but heavier, not React-native            |
| Custom range slider  | @tanstack/ranger                      | Headless, very lightweight, but adds a dependency for one slider |
| Custom range slider  | Native HTML `<input type="range">` x2 | Zero dependency; sufficient for dual-handle date filter          |

**Installation:**

```bash
cd packages/luca-observer && bun add react-force-graph-2d
```

Note: `react-force-graph-2d` has peer dependencies on `react` (already ^19). No additional type package needed -- the library ships its own TypeScript declarations.

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-observer/
  app/
    knowledge-graph/
      page.tsx                    # "use client" page with PageContainer + hook
      loading.tsx                 # Optional Next.js loading.tsx for route transition
  components/
    knowledge-graph/
      graph-canvas.tsx            # ForceGraph2D wrapper (loaded via next/dynamic)
      graph-sidebar.tsx           # Right-side detail panel for selected node
      graph-controls.tsx          # Zoom controls, layout reset, filter toggles
      time-range-slider.tsx       # Dual-handle date filter with histogram
      cluster-legend.tsx          # Entity type color legend
  hooks/
    use-knowledge-graph.ts        # Data fetching, graph transformation, cluster state
  lib/
    graph-types.ts                # GraphNode, GraphLink, ClusterNode type defs
```

### Pattern 1: Dynamic Import for Canvas Component

**What:** Load ForceGraph2D client-side only to avoid SSR Canvas errors.
**When to use:** Always -- react-force-graph-2d accesses `window` and Canvas API at module level.
**Example:**

```typescript
// components/knowledge-graph/graph-canvas.tsx
"use client";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false }
);

export function GraphCanvas({ graphData, onNodeClick, ...props }) {
  return (
    <ForceGraph2D
      graphData={graphData}
      onNodeClick={onNodeClick}
      {...props}
    />
  );
}
```

### Pattern 2: Cluster Supernode Data Transformation

**What:** Transform flat entity lists into cluster nodes + individual nodes.
**When to use:** Default view shows clusters; expanding reveals children.
**Example:**

```typescript
// In use-knowledge-graph.ts
import groupBy from "lodash/groupBy";

interface GraphNode {
  id: string;
  name: string;
  type: string; // "pattern", "decision", "pitfall", etc.
  is_cluster: boolean;
  child_count?: number; // For clusters: number of contained entities
  created_at?: number;
  val?: number; // Node size (cluster = child_count, individual = 1)
}

interface GraphLink {
  source: string;
  target: string;
  type?: string;
}

function buildClusteredGraph(
  entities: EntityNode[],
  links: RawLink[],
  expandedTypes: Set<string>,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const grouped = groupBy(entities, "type");
  const nodes: GraphNode[] = [];
  const graphLinks: GraphLink[] = [];

  for (const [type, members] of Object.entries(grouped)) {
    if (expandedTypes.has(type)) {
      // Expanded: show individual nodes
      for (const entity of members) {
        nodes.push({
          id: entity.id,
          name: entity.name,
          type,
          is_cluster: false,
          created_at: entity.created_at,
          val: 1,
        });
      }
    } else {
      // Collapsed: show cluster supernode
      nodes.push({
        id: `cluster:${type}`,
        name: type,
        type,
        is_cluster: true,
        child_count: members.length,
        val: members.length,
      });
    }
  }

  // Filter links: only include if both endpoints are visible nodes
  const visibleIds = new Set(nodes.map((n) => n.id));
  for (const link of links) {
    if (visibleIds.has(link.source) && visibleIds.has(link.target)) {
      graphLinks.push(link);
    }
  }

  return { nodes, links: graphLinks };
}
```

### Pattern 3: Hook Pattern (follow existing use-vault-health / use-memory)

**What:** Single custom hook that owns all data fetching, state, and derived graph data.
**When to use:** Always -- matches every existing observer view.
**Example:**

```typescript
// hooks/use-knowledge-graph.ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useKnowledgeGraph(): KnowledgeGraphData {
  const [rawEntities, setRawEntities] = useState<RawEntity[]>([]);
  const [rawLinks, setRawLinks] = useState<RawLink[]>([]);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  // ... fetchAll with Promise.allSettled pattern (same as use-vault-health)
  // ... derived: graphData = buildClusteredGraph(rawEntities, rawLinks, expandedTypes)
  // ... time filtering applied on top
}
```

### Pattern 4: nodeCanvasObject for Custom Node Rendering

**What:** Custom Canvas 2D drawing per node for clusters vs individuals.
**When to use:** Cluster supernodes need larger circles with count badges; individual nodes get type-colored dots.
**Example:**

```typescript
const nodeCanvasObject = useCallback(
  (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (node.is_cluster) {
      // Large circle with count badge
      const radius = Math.sqrt(node.child_count ?? 1) * 4;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = TYPE_COLORS[node.type] ?? "#666";
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = TYPE_COLORS[node.type] ?? "#666";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Count badge
      ctx.font = `${Math.max(10, 12 / globalScale)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(String(node.child_count), node.x!, node.y!);
    } else {
      // Individual node: small colored dot
      const radius = 4;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = TYPE_COLORS[node.type] ?? "#666";
      ctx.fill();
      // Label at higher zoom
      if (globalScale > 1.5) {
        ctx.font = `${10 / globalScale}px monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ccc";
        ctx.fillText(node.name, node.x!, node.y! + radius + 8 / globalScale);
      }
    }
  },
  [],
);
```

### Pattern 5: Page Layout (Graph + Sidebar)

**What:** Full-height graph canvas with optional right sidebar for node details.
**When to use:** Matches Decision 2 from CONTEXT.md -- single-click opens sidebar.
**Example structure:**

```tsx
<PageContainer title="Knowledge Graph" subtitle="MuninnDB Entity Explorer">
  <div className="flex h-[calc(100vh-12rem)] gap-0">
    {/* Graph canvas area */}
    <div className="flex-1 relative">
      <GraphCanvas ... />
      <TimeRangeSlider ... />  {/* Absolute-positioned at bottom */}
      <GraphControls ... />     {/* Absolute-positioned top-right */}
    </div>
    {/* Detail sidebar (conditionally rendered) */}
    {selectedNode && (
      <div className="w-80 border-l border-border overflow-y-auto">
        <GraphSidebar node={selectedNode} />
      </div>
    )}
  </div>
</PageContainer>
```

### Anti-Patterns to Avoid

- **SSR with react-force-graph-2d:** The library accesses `window` and Canvas at import time. MUST use `next/dynamic` with `{ ssr: false }`. Failing to do so will crash the build.
- **SVG rendering at scale:** Do not use SVG-based graph libraries for 100+ nodes. Canvas is required for performance.
- **Re-rendering entire graph on state change:** Use `useRef` for the ForceGraph2D instance and call imperative methods (`.zoomToFit()`, `.centerAt()`) instead of re-rendering.
- **Inline data transformations in render:** Memoize cluster building with `useMemo` keyed on `[rawEntities, rawLinks, expandedTypes, timeRange]`.
- **Class-based components:** Project rule: no classes. Use functional components with hooks.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                   | Don't Build                 | Use Instead                           | Why                                                                     |
| ------------------------- | --------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Force-directed layout     | Custom d3-force integration | react-force-graph-2d                  | 500+ lines of Canvas setup, simulation management, interaction handling |
| Node hover detection      | Custom canvas hit detection | ForceGraph2D `onNodeHover` prop       | Built-in spatial indexing for Canvas click/hover detection              |
| Zoom/pan                  | Custom wheel/drag handlers  | ForceGraph2D built-in zoom            | Handles pinch zoom, mouse wheel, trackpad, touch                        |
| Graph data fetching       | Custom fetch logic          | Existing `/api/muninn/*` proxy routes | export-graph, entity-clusters, entity, entity-timeline all exist        |
| Zod schemas for graph API | New schema files            | Existing `muninn-schemas.ts`          | ExportGraphRequestSchema, EntityClustersQuerySchema already defined     |
| MuninnDB client methods   | Direct HTTP calls           | Existing `muninn-config.ts` client    | exportGraph, entityClusters, entity, entityTimeline methods all exist   |
| Error boundary wrapping   | Try-catch in render         | Existing `ErrorBoundary` component    | Used by every observer view                                             |
| Loading states            | Custom skeleton             | Existing `LoadingSkeleton` component  | Used by every observer view                                             |
| Empty states              | Custom empty div            | Existing `EmptyState` component       | Standard dashed-border empty state                                      |

**Key insight:** The observer already has 90% of the backend infrastructure. The new work is purely the graph visualization layer (Canvas component, cluster logic, time slider) and a new data hook.

## Common Pitfalls

### Pitfall 1: Canvas SSR Crash

**What goes wrong:** Next.js tries to render ForceGraph2D on the server, crashes because `window`/`Canvas` are undefined.
**Why it happens:** react-force-graph-2d accesses browser APIs at module import time.
**How to avoid:** Always use `next/dynamic(() => import("react-force-graph-2d"), { ssr: false })`. Never use a regular import.
**Warning signs:** `ReferenceError: window is not defined` during build or SSR.

### Pitfall 2: Graph Re-renders Kill Performance

**What goes wrong:** Every state change (hover, selection, filter) re-renders the ForceGraph2D component, restarting the force simulation.
**Why it happens:** React re-render triggers new `graphData` object reference.
**How to avoid:** (1) Memoize graphData with `useMemo`. (2) Use `useRef` for the graph instance. (3) Use `autoPauseRedraw={true}` to stop rendering when simulation settles. (4) Set `cooldownTicks={100}` to limit simulation iterations.
**Warning signs:** Graph keeps "jiggling" after loading; CPU usage stays high.

### Pitfall 3: Cluster Expand/Collapse Loses Position

**What goes wrong:** When expanding a cluster, all nodes fly to random positions because the simulation restarts from scratch.
**Why it happens:** Replacing `graphData` completely resets the d3-force simulation.
**How to avoid:** When expanding, position new child nodes near the cluster node's `x`/`y` coordinates before updating graphData. Use `warmupTicks={0}` with `cooldownTicks={50}` for gentle re-layout.
**Warning signs:** Expanding a cluster causes all nodes to scatter and re-animate.

### Pitfall 4: ExportGraph Returns JSON-LD String, Not Nodes/Links

**What goes wrong:** Calling `exportGraph` returns `{ data: "<json-ld string>", node_count, edge_count, format }`. The `data` field is a serialized JSON-LD string, not a ready-to-use `{ nodes, links }` structure.
**Why it happens:** The `exportGraph` method in `muninn-config.ts` builds a JSON-LD `@graph` array from engrams and entities, then `JSON.stringify`s it.
**How to avoid:** Either (a) parse the JSON-LD `data` string and transform into `{ nodes, links }`, or (b) build a dedicated `/api/muninn/graph-data` route that returns the data in the exact shape ForceGraph2D needs, avoiding the JSON-LD serialization/deserialization overhead.
**Warning signs:** Empty graph despite successful API call; `graphData.nodes` is empty.

### Pitfall 5: Missing Relationship/Edge Data

**What goes wrong:** The current `exportGraph` implementation has `edge_count: 0` -- it builds entity nodes from tags but does NOT include edges/relationships.
**Why it happens:** The composed `exportGraph` method in `muninn-config.ts` only extracts entities from engram tags. It does not fetch link/relationship data from MuninnDB.
**How to avoid:** Build edges from `entityClusters` co-occurrence data (entity_a/entity_b pairs). This gives weighted edges showing how strongly entities relate. The `/api/muninn/entity-clusters` endpoint already exists and returns this data.
**Warning signs:** Graph shows isolated nodes with no connections.

### Pitfall 6: Time Slider Histogram Without Timestamps

**What goes wrong:** Need node creation timestamps for the histogram but `exportGraph` JSON-LD doesn't include them.
**Why it happens:** JSON-LD entity nodes only have `@id`, `@type`, and `name`. No `created_at`.
**How to avoid:** Fetch engrams list (existing `/api/muninn/engrams` endpoint) alongside the graph data to get `created_at` timestamps per engram/entity. Use these for the time range slider histogram.
**Warning signs:** Time slider shows empty histogram or all nodes at the same timestamp.

### Pitfall 7: Content Security Policy Blocking Canvas

**What goes wrong:** Canvas rendering blocked by CSP.
**Why it happens:** The `next.config.ts` has a strict CSP. Canvas 2D context rendering is generally allowed under `default-src 'self'`, but `eval`-based Canvas operations could be blocked.
**How to avoid:** Test in both dev and production CSP modes. react-force-graph-2d uses standard Canvas 2D API (no `eval`), so current CSP should be fine. Monitor the browser console for CSP violations.
**Warning signs:** Blank white area where graph should render; CSP violation in console.

## Code Examples

Verified patterns from official sources and codebase:

### Dynamic Import Pattern (Next.js + react-force-graph-2d)

```typescript
// Source: Next.js docs + react-force-graph GitHub
// components/knowledge-graph/graph-canvas.tsx
"use client";

import { useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { ForceGraphMethods } from "react-force-graph-2d";

import type { GraphNode, GraphLink } from "~/lib/graph-types";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false },
);

interface GraphCanvasProps {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  width: number;
  height: number;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  nodeCanvasObject: (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => void;
}

export function GraphCanvas({
  graphData,
  width,
  height,
  onNodeClick,
  onNodeHover,
  nodeCanvasObject,
}: GraphCanvasProps) {
  const graphRef = useRef<ForceGraphMethods>();

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={graphData}
      width={width}
      height={height}
      nodeCanvasObject={nodeCanvasObject}
      nodeCanvasObjectMode={() => "replace"}
      onNodeClick={onNodeClick}
      onNodeHover={onNodeHover}
      enableNodeDrag={true}
      enableZoomInteraction={true}
      autoPauseRedraw={true}
      cooldownTicks={100}
      backgroundColor="transparent"
      linkColor={() => "rgba(255,255,255,0.15)"}
      linkWidth={0.5}
    />
  );
}
```

### Graph Data API Route (New)

```typescript
// Source: Existing muninn-route-helper pattern
// app/api/muninn/graph-data/route.ts
import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import { z } from "zod";

const GraphDataQuerySchema = z.object({
  vault: z.string().min(1).max(100).default("default"),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, GraphDataQuerySchema);
  if (!result.success) return result.response;

  const { vault, limit } = result.data;

  return muninnProxyHandler(async (client) => {
    const [engramsRes, clustersRes] = await Promise.all([
      client.listEngrams(vault, limit),
      client.entityClusters(vault, 100, 1),
    ]);

    // Build entity nodes from engram tags
    const entityMap = new Map<
      string,
      {
        name: string;
        type: string;
        engram_count: number;
        first_seen: number;
        last_seen: number;
      }
    >();

    for (const engram of engramsRes.engrams) {
      for (const tag of engram.tags ?? []) {
        const existing = entityMap.get(tag);
        if (existing) {
          existing.engram_count += 1;
          existing.first_seen = Math.min(
            existing.first_seen,
            engram.created_at,
          );
          existing.last_seen = Math.max(existing.last_seen, engram.created_at);
        } else {
          entityMap.set(tag, {
            name: tag,
            type: engram.memory_type ?? "other",
            engram_count: 1,
            first_seen: engram.created_at,
            last_seen: engram.created_at,
          });
        }
      }
    }

    // Build nodes
    const nodes = Array.from(entityMap.entries()).map(([name, data]) => ({
      id: `entity:${name}`,
      name,
      type: data.type,
      engram_count: data.engram_count,
      first_seen: data.first_seen,
      last_seen: data.last_seen,
    }));

    // Build links from co-occurrence clusters
    const links = clustersRes.clusters.map((c) => ({
      source: `entity:${c.entity_a}`,
      target: `entity:${c.entity_b}`,
      weight: c.count,
    }));

    return {
      nodes,
      links,
      total_nodes: nodes.length,
      total_links: links.length,
    };
  }, "Failed to build graph data from MuninnDB");
}
```

### Sidebar Nav Registration

```typescript
// Source: Existing NAV_ITEMS pattern in lib/constants.ts
// Add to NAV_ITEMS array:
{ href: "/knowledge-graph", label: "Knowledge Graph", icon: "GitBranch" }
// Note: may need a different icon; "Network" from lucide-react
// would be ideal but need to register in ICON_MAP in sidebar.tsx
```

## State of the Art

| Old Approach         | Current Approach                                      | When Changed | Impact                                                       |
| -------------------- | ----------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| D3.js raw SVG graphs | Canvas-based graph libs (react-force-graph, sigma.js) | 2022-2023    | 10x performance improvement at 500+ nodes                    |
| Fixed graph layouts  | Force-directed with semantic zoom                     | 2023+        | Better UX for exploratory graph analysis                     |
| All-nodes-visible    | Cluster/LOD approaches                                | 2023+        | Handles graphs with 1000+ entities without visual clutter    |
| SVG graph rendering  | HTML5 Canvas rendering                                | 2022+        | Canvas handles 1000+ nodes at 60fps vs SVG struggles at 200+ |

**Deprecated/outdated:**

- `react-force-graph` umbrella package (exports 2D/3D/VR/AR): Use `react-force-graph-2d` directly for smaller bundle
- SVG-based graph visualization for large datasets: Canvas is strictly better for 100+ nodes

## Open Questions

Things that could not be fully resolved:

1. **MuninnDB Entity Type Classification**
   - What we know: Engrams have `memory_type` field (pattern, decision, pitfall, etc.) and tags
   - What's unclear: Whether entity "type" should come from the most common `memory_type` among its engrams, or from a dedicated field
   - Recommendation: Use the `resolveEngramType` logic from `use-vault-health.ts` which already handles the hybrid `memory_type` + concept prefix strategy. Apply to the most common type among an entity's engrams.

2. **Edge/Relationship Richness**
   - What we know: `entityClusters` gives co-occurrence counts; `traverse` gives hop-based graph traversal
   - What's unclear: Whether MuninnDB has richer relationship data (typed edges like "contradicts", "supports", "relates_to") accessible via the REST API
   - Recommendation: Start with co-occurrence edges from `entityClusters`. If richer edge data exists, it can be incorporated later.

3. **Graph Canvas Sizing**
   - What we know: ForceGraph2D accepts `width` and `height` props; needs explicit pixel values
   - What's unclear: Best approach for responsive sizing within the PageContainer flex layout
   - Recommendation: Use a `useRef` + `ResizeObserver` pattern to measure the container div and pass dimensions to ForceGraph2D. This is the standard approach for Canvas components in responsive layouts.

4. **Time Slider Library Choice**
   - What we know: Need dual-handle range slider with date filtering
   - What's unclear: Whether to add `@tanstack/ranger` or build with native HTML range inputs
   - Recommendation: Build with native `<input type="range">` elements for the dual slider. The histogram overlay is a simple Canvas or CSS bar chart. This avoids adding another dependency for a single component.

## Sources

### Primary (HIGH confidence)

- [react-force-graph GitHub](https://github.com/vasturiano/react-force-graph) - Full API documentation, props, methods, expandable nodes example
- [react-force-graph-2d npm](https://www.npmjs.com/package/react-force-graph-2d) - v1.29.1, latest release, TypeScript declarations included
- Codebase: `packages/luca-observer/lib/muninn-config.ts` - MuninnDB client with exportGraph, entityClusters methods
- Codebase: `packages/luca-observer/lib/muninn-schemas.ts` - Existing Zod schemas for graph-related endpoints
- Codebase: `packages/luca-observer/hooks/use-vault-health.ts` - Canonical hook pattern (Promise.allSettled, fetchingRef, error handling)
- Codebase: `packages/luca-observer/app/vault/page.tsx` - Canonical page pattern (PageContainer + hook + ErrorBoundary)
- Codebase: `packages/luca-observer/tailwind/base.css` - CSS variable tokens for theming

### Secondary (MEDIUM confidence)

- [Graph Visualization with react-force-graph](https://lyonwj.com/blog/graph-visualization-with-graphql-react-force-graph) - Next.js dynamic import pattern verified
- [Next.js Dynamic Imports docs](https://nextjs.org/docs/pages/guides/lazy-loading) - `{ ssr: false }` pattern for browser-only components
- [TanStack Ranger](https://tanstack.com/ranger/latest) - Headless range slider option (not recommended for this phase)

### Tertiary (LOW confidence)

- [Reagraph Clustering](https://reagraph.dev/docs/advanced/Clustering) - Alternative clustering approach (not using this library)
- [Cambridge Intelligence Time Bar](https://cambridge-intelligence.com/time/) - Time-based graph filtering UX patterns (commercial product, concept reference only)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - react-force-graph-2d is the established choice; confirmed via CONTEXT.md decisions
- Architecture: HIGH - follows existing observer patterns exactly; all API routes exist
- Pitfalls: HIGH - Canvas SSR, missing edge data, JSON-LD parsing verified from codebase inspection
- Cluster implementation: MEDIUM - expandable nodes pattern from official examples but cluster supernodes need custom data layer
- Time slider: MEDIUM - no existing library locked; native approach recommended but untested

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days -- stable libraries, well-established patterns)
