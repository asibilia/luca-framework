# Phase 4 Context: Knowledge Graph Explorer

## Decision 1: Graph Library [researched]

**Use `react-force-graph-2d`** — React-native wrapper over d3-force with Canvas rendering.

- ~160k weekly npm downloads, 3k GitHub stars, actively maintained
- Canvas renderer handles 100-1000 nodes at 60fps (no SVG DOM overhead)
- Built-in: `nodeColor`, `nodeVal`, `onNodeClick`, `nodeCanvasObject`, dynamic `graphData`
- Next.js integration: `next/dynamic` with `{ ssr: false }` (standard canvas pattern)
- Rejected: raw d3-force (500+ lines boilerplate), cytoscape.js (heavier, analytics-focused), vis.js (maintenance concerns)

Sources: [react-force-graph GitHub](https://github.com/vasturiano/react-force-graph), [Graph Viz with react-force-graph](https://lyonwj.com/blog/graph-visualization-with-graphql-react-force-graph), [Cylynx comparison](https://www.cylynx.io/blog/a-comparison-of-javascript-graph-network-visualisation-libraries/)

## Decision 2: Node Interaction Model [researched]

**Three-tier interaction:**

1. **Single-click** → Select node, open right sidebar detail panel (entity properties, relationship list)
2. **Double-click** → Expand connected nodes inline on the graph canvas
3. **Hover** → Highlight direct connections + lightweight tooltip (entity type + title)

Additional:

- Multi-select: Cmd/Ctrl+click and marquee drag
- Right-click context menu for expand/collapse/filter actions
- NO modals — they break spatial context in graph exploration
- NO page navigation — keep everything in single view with panels

Sources: [Neo4j Bloom Scene Interactions](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-scene-interactions/), [Cambridge Intelligence React Graph Guide](https://cambridge-intelligence.com/react-graph-visualization-library/), [yFiles Knowledge Graph Guide](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs)

## Decision 3: Density Management [researched]

**Type-based cluster supernodes + semantic zoom LOD:**

- **Default view**: Entity types (patterns, decisions, pitfalls, sessions, procedures) collapsed into cluster supernodes (~6-10 visible nodes)
- **Supernodes**: Sized by member count, colored by type
- **Expand on demand**: Click cluster to reveal individual entities with localized force layout
- **Semantic zoom levels**:
  - Zoom < 0.5x: Only cluster circles with count badges
  - Zoom 0.5-1.5x: Individual nodes as colored dots (green=active, gray=deprecated)
  - Zoom > 1.5x: Text labels and relationship edge labels visible
- Canvas rendering (not SVG) for performance at scale

Sources: [react-force-graph Canvas rendering](https://github.com/vasturiano/react-force-graph), [Reagraph Clustering](https://reagraph.dev/docs/advanced/Clustering), [yFiles progressive disclosure](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs)

## Decision 4: Time Slider Semantics [researched]

**Dual-range date filter slider** as primary interaction:

- Range slider below graph with histogram showing node creation density over time
- Dragging handles filters graph to show only nodes created within that range
- Smooth animated transitions when range changes
- Optionally: "play" button that auto-advances right handle for cumulative growth animation
- **Recency highlighting**: Nodes with recent `last_access` get a subtle pulsing glow
- Uses MuninnDB `created_at` and `last_access` timestamps

Rejected: Full animation as primary (expensive, less control), milestone snapshots (continuous knowledge doesn't fit discrete snapshots)

Sources: [Cambridge Intelligence Time Bar](https://cambridge-intelligence.com/time/), [Tom Sawyer Timeline Graph](https://blog.tomsawyer.com/timeline-graph-visualization)

## Key Files

| File                                                | Role                                             |
| --------------------------------------------------- | ------------------------------------------------ |
| `packages/luca-observer/app/`                       | Next.js app router (new route needed)            |
| `packages/luca-observer/components/`                | Shared components by view                        |
| `packages/luca-observer/lib/muninn-route-helper.ts` | MuninnDB API helper                              |
| `packages/luca-observer/hooks/`                     | React hooks for data fetching                    |
| MuninnDB `export_graph` API                         | Returns JSON-LD/GraphML entity+relationship data |
| MuninnDB `entities` API                             | Entity listing with type filtering               |
| MuninnDB `entity_timeline` API                      | Entity temporal data                             |

## Data Source

The graph data comes from MuninnDB's `export_graph` endpoint which returns entities and relationships. The observer already has `lib/muninn-route-helper.ts` for API calls and `lib/muninn-schemas.ts` for Zod schemas.

## Scope Boundary

This phase builds the Knowledge Graph Explorer view ONLY. It does NOT include:

- Semantic search (Phase 5)
- Contradiction views (Phase 5)
- Entity deep dive (Phase 6)
- Graph analytics/algorithms (not in scope for v3.3.0)
