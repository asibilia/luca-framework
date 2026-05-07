# Workflow Canvas: SpacetimeDB v2 Frontend Integration

> **Author:** Senior Frontend Developer (AI agent)
> **Date:** 2026-03-26
> **Status:** Approved — SpacetimeDB v2 confirmed by founder as non-negotiable

---

## 1. SpacetimeDB + Jotai Coexistence

**Decision:** SpacetimeDB `useTable()` as source of truth for persistent data. Jotai for transient UI state only.

| Data layer             | Tool                                      | Examples                                                                          |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| Persistent domain data | SpacetimeDB `useTable()` / `useReducer()` | Nodes, edges, entity configs, session state                                       |
| Transient UI state     | Jotai atoms                               | `selectedNodeId`, `minimapVisible`, `layoutDirection`, drag positions, menu state |
| Config drafts          | Jotai atoms (ephemeral)                   | In-flight form edits before Save calls a reducer                                  |
| Dirty tracking         | Removed                                   | SpacetimeDB subscriptions make "server vs draft" moot                             |

### What Changes

- `useWorkflowGraph` hook → replaced by `useTable(tables.pipeline_node)` + `useTable(tables.pipeline_edge)`
- `pipelineNodesAtom` / `pipelineEdgesAtom` → **removed** as source of truth, replaced by `useTable()`
- `usePipelineSave` → rewritten to call SpacetimeDB reducers
- `dirty-tracking.ts` → simplified to ephemeral form drafts only
- `use-sse.ts` → replaced by SpacetimeDB subscriptions for live data (may keep for file-watching)

### Usage Pattern

```tsx
// hooks/use-pipeline-data.ts
export function usePipelineData() {
  const [nodes] = useTable(tables.pipeline_node);
  const [edges] = useTable(tables.pipeline_edge);
  const moveNode = useReducer(reducers.moveNode);
  const addNode = useReducer(reducers.addNode);
  const deleteNode = useReducer(reducers.deleteNode);
  const connectEdge = useReducer(reducers.connectEdge);
  return { nodes, edges, moveNode, addNode, deleteNode, connectEdge };
}

// In PipelineCanvasInner — no more Jotai for nodes/edges
const { nodes, edges, moveNode } = usePipelineData();
const [selectedNodeId, setSelectedNodeId] = useAtom(selectedPipelineNodeIdAtom); // still Jotai
```

## 2. Undo/Redo with SpacetimeDB

**Decision: Hybrid approach (Option C)**

- **Position changes (drag):** Local `positionOverridesAtom` with `jotai-history`. Undo is instant (0ms). Debounced flush to SpacetimeDB every 300ms.
- **Structural changes (add/delete/connect):** Undo stack stores inverse reducer calls. Undo dispatches the inverse (~100ms latency). Acceptable for infrequent operations.

```typescript
// stores/pipeline-local.ts
export const positionOverridesAtom = atom<
  Record<string, { x: number; y: number }>
>({});
export const positionHistoryAtom = withHistory(positionOverridesAtom, 50);
```

## 3. Optimistic Updates

**Critical constraint:** Canvas drag must be < 16ms. SpacetimeDB reducer round-trip is 50-200ms.

### Pattern: Local-First with Deferred Flush

```
User drags node
  → positionOverridesAtom updated synchronously (0ms, Jotai)
  → React Flow re-renders with override position (< 16ms)
  → Debounced flush: moveNode reducer fires after 300ms of inactivity
  → SpacetimeDB subscription confirms: override is cleared
  → If reducer fails: override stays (no visible glitch), retry with backoff
```

### Implementation

```tsx
// hooks/use-optimistic-nodes.ts
export function useOptimisticNodes(
  stdbNodes: PipelineNode[],
  overrides: Record<string, { x: number; y: number }>,
): Node<WorkflowNodeData>[] {
  return useMemo(
    () =>
      stdbNodes.map((node) => {
        const override = overrides[node.id];
        if (!override) return toReactFlowNode(node);
        return toReactFlowNode({
          ...node,
          position_x: override.x,
          position_y: override.y,
        });
      }),
    [stdbNodes, overrides],
  );
}
```

For structural operations (add/delete/connect): no optimistic updates needed — 50-200ms latency is acceptable for button clicks.

## 4. Connection Setup

### Provider Architecture

```
app/layout.tsx
  └─ Providers
       └─ JotaiProvider
            └─ SpacetimeDBProvider (client-only, 'use client')
                 └─ children
```

### SSR Handling

`SpacetimeDBProvider` is a `'use client'` component. Next.js won't SSR it. No `dynamic(() => import(...), { ssr: false })` needed.

### Implementation

```typescript
// lib/spacetimedb-connection.ts
"use client";
const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_URL ?? "ws://localhost:3000";
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB ?? "luca-studio";

export function createConnectionBuilder() {
  return DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(
      localStorage.getItem(`stdb:${HOST}/${DB_NAME}:token`) || undefined,
    )
    .onConnect((_conn, identity, token) => {
      localStorage.setItem(`stdb:${HOST}/${DB_NAME}:token`, token);
    });
}
```

### Reconnection

SpacetimeDB SDK does not have built-in reconnection. Add retry in `onDisconnect`:

```typescript
.onDisconnect((_ctx, error) => {
  if (error) setTimeout(() => { /* rebuild connection */ }, 2000)
})
```

## 5. Bundle Size Impact

- SpacetimeDB v2 SDK: estimated ~40-60 kB min+gz
- Current heavyweight deps: @xyflow/react (~150kB), CodeMirror (~35kB), Shiki, Tremor
- SpacetimeDB is ~12% increase on ~400+ kB bundle — acceptable
- No code-splitting needed: every studio page uses real-time data
- If static pages are added later, split provider to route group layout

## 6. Migration Summary

| Component                                 | Current                         | After SpacetimeDB                                                 |
| ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| `pipelineNodesAtom` / `pipelineEdgesAtom` | Source of truth                 | Removed. Replaced by `useTable()` + local `positionOverridesAtom` |
| `useWorkflowGraph`                        | Fetch topology API              | Removed. Replaced by `useTable(tables.pipeline_node)`             |
| `usePipelineSave`                         | REST PUT                        | Rewritten to call SpacetimeDB reducers                            |
| `dirty-tracking.ts`                       | Draft vs server divergence      | Simplified to ephemeral form drafts only                          |
| `entity-atoms.ts`                         | Draft atoms + jotai-history     | Stays. Save calls reducer instead of REST                         |
| `use-undo.ts`                             | Generic undo over jotai-history | Stays for entity forms. Canvas uses hybrid model                  |
| `use-sse.ts`                              | SSE for live updates            | Replaced by SpacetimeDB subscriptions                             |
| `providers.tsx`                           | JotaiProvider + ThemeSync       | Updated with SpacetimeDBProvider                                  |

### Implementation Order

1. SpacetimeDB module definition + TypeScript bindings generation
2. Connection provider in `providers.tsx`
3. Pipeline canvas migration (highest risk: replace useWorkflowGraph + Jotai with useTable + optimistic overlay)
4. Entity editor migration (replace REST saves with reducer-based saves)
5. SSE replacement (reduce to file-watching only)
6. Reconnection + error handling
