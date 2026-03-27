# Workflow Canvas: SpacetimeDB v2 Architecture

> **Author:** Principal Architect (AI agent)
> **Date:** 2026-03-26
> **Status:** Approved — SpacetimeDB v2 confirmed by founder as non-negotiable
> **Supersedes:** Original architecture proposal which was amended after founder override

---

## 1. Server Module Schema

The SpacetimeDB server module lives at `packages/luca-studio-db/src/module.ts` using the SpacetimeDB v2 TypeScript server SDK.

### Tables (13)

| Table              | Purpose                            | Visibility  |
| ------------------ | ---------------------------------- | ----------- |
| `workflow`         | Top-level workflow metadata        | public      |
| `workflow_version` | Immutable version snapshots        | public      |
| `node`             | Canvas nodes with position, config | public      |
| `edge`             | Connections between nodes          | public      |
| `agent_team`       | Named agent team definitions       | public      |
| `agent_assignment` | Agent-to-team mappings             | public      |
| `run`              | Execution run records              | public      |
| `run_step`         | Per-node execution results         | public      |
| `run_metrics`      | Aggregated run statistics          | public      |
| `provider_config`  | LLM provider API keys/config       | **private** |

### Key Design Choices

- **UUIDs** for all IDs (client-generated via `crypto.randomUUID()`)
- **Timestamps as `u64`** (epoch ms) — SpacetimeDB has no native datetime type
- **JSON string columns** for nested data (`config_json`, `condition_json`)
- **`provider_config` is `public: false`** — only owning identity can read
- **Cost in microdollars** (`u64`) for integer precision
- **`parent_id` as empty string** instead of null (SpacetimeDB has no nullable strings in v2)

### Reducers (12+)

| Reducer                  | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `create_workflow`        | Create workflow + initial draft version                            |
| `update_workflow`        | Update name/description                                            |
| `archive_workflow`       | Soft delete                                                        |
| `create_version`         | New version, deactivate previous                                   |
| `activate_version`       | Switch active version                                              |
| `upsert_node`            | Insert or update a node                                            |
| `delete_node`            | Delete node (caller must cascade edges)                            |
| `upsert_edge`            | Insert or update an edge                                           |
| `delete_edge`            | Delete an edge                                                     |
| `sync_graph`             | Bulk save: delete all nodes/edges for version, re-insert from JSON |
| `start_run`              | Create run + metrics record                                        |
| `complete_run`           | Set final status                                                   |
| `upsert_run_step`        | Update step status + auto-aggregate metrics                        |
| `upsert_provider_config` | Save encrypted provider config                                     |
| `delete_provider_config` | Remove provider config                                             |

### `sync_graph` Bulk Reducer

Critical for save operations — atomically replaces all nodes and edges for a version:

```typescript
export const sync_graph = spacetimedb.reducer(
  { version_id: t.string(), nodes_json: t.string(), edges_json: t.string() },
  (ctx, { version_id, nodes_json, edges_json }) => {
    // Delete existing
    for (const n of ctx.db.node.version_id.filter(version_id))
      ctx.db.node.id.delete(n.id);
    for (const e of ctx.db.edge.version_id.filter(version_id))
      ctx.db.edge.id.delete(e.id);
    // Insert new
    for (const n of JSON.parse(nodes_json))
      ctx.db.node.insert({ ...n, version_id });
    for (const e of JSON.parse(edges_json))
      ctx.db.edge.insert({ ...e, version_id });
  },
);
```

---

## 2. Subscription Strategy

### Editor Mode

```typescript
const [nodes] = useTable(
  tables.node.where((r) => r.version_id.eq(activeVersionId)),
);
const [edges] = useTable(
  tables.edge.where((r) => r.version_id.eq(activeVersionId)),
);
const [versions] = useTable(
  tables.workflow_version.where((r) => r.workflow_id.eq(workflowId)),
);
```

### Execution Mode

```typescript
const [steps] = useTable(
  tables.run_step.where((r) => r.run_id.eq(activeRunId)),
);
const [metrics] = useTable(
  tables.run_metrics.where((r) => r.run_id.eq(activeRunId)),
);
const [runs] = useTable(tables.run.where((r) => r.id.eq(activeRunId)));
```

### Run History

```typescript
const [allRuns] = useTable(
  tables.run.where((r) => r.workflow_id.eq(workflowId)),
);
// Client-side: orderBy(allRuns, 'started_at', 'desc').slice(0, 50)
```

### Dashboard

```typescript
const [workflows] = useTable(
  tables.workflow.where((r) => r.archived.eq(false)),
);
const [providers] = useTable(tables.provider_config);
```

---

## 3. SpacetimeDB + Jotai Bridge

### Architecture

```
SpacetimeDB WebSocket → SpacetimeDBProvider → useTable() hooks → useSyncToAtom() bridge → Jotai atoms → Components
```

### Bridge Hook

```typescript
function useSyncToAtom<TRow, TAtom>(
  tableRows: readonly TRow[],
  isReady: boolean,
  setAtom: (value: TAtom[]) => void,
  transform: (row: TRow) => TAtom,
): void {
  useEffect(() => {
    if (!isReady) return;
    setAtom(tableRows.map(transform));
  }, [tableRows, isReady, setAtom, transform]);
}
```

### Provider Setup

```typescript
// app/providers.tsx
<SpacetimeDBProvider connectionBuilder={connectionBuilder}>
  <JotaiProvider>
    {children}
  </JotaiProvider>
</SpacetimeDBProvider>
```

### Migration Path

| Current Hook               | SpacetimeDB Replacement                           |
| -------------------------- | ------------------------------------------------- |
| `useWorkflowGraph` (fetch) | `useTable(tables.node)` + `useTable(tables.edge)` |
| `usePipelineSave` (POST)   | `useReducer(reducers.sync_graph)`                 |
| `useConfigSave` (POST)     | `useReducer(reducers.upsert_provider_config)`     |

---

## 4. Repository Pattern

```typescript
interface WorkflowRepository {
  listWorkflows(): Promise<WorkflowSummary[]>;
  getWorkflow(id: string): Promise<WorkflowSummary | null>;
  createWorkflow(name: string, description: string): Promise<string>;
  updateWorkflow(id: string, name: string, description: string): Promise<void>;
  archiveWorkflow(id: string): Promise<void>;
  listVersions(workflowId: string): Promise<WorkflowVersion[]>;
  createVersion(workflowId: string, label: string): Promise<string>;
  activateVersion(versionId: string, workflowId: string): Promise<void>;
  getGraph(versionId: string): Promise<WorkflowGraph>;
  saveGraph(versionId: string, graph: WorkflowGraph): Promise<void>;
  listRuns(workflowId: string, limit?: number): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunDetail | null>;
}
```

**Primary:** `SpacetimeWorkflowRepository` — calls reducers via SDK
**Fallback:** `SqliteWorkflowRepository` — uses `bun:sqlite`, auto-activates when `SPACETIMEDB_URI` is not set

---

## 5. Deployment Model

| Environment | SpacetimeDB                    | Connection                        |
| ----------- | ------------------------------ | --------------------------------- |
| Production  | SpacetimeDB Cloud (maincloud)  | `wss://maincloud.spacetimedb.com` |
| Local Dev   | Standalone (`spacetime start`) | `ws://localhost:3000`             |
| Offline     | SQLite fallback                | No SpacetimeDB needed             |

### Offline/Fallback Mode

When SpacetimeDB is unavailable, the app auto-falls back to SQLite via repository factory. `SpacetimeDBProvider` wraps children in an error boundary that degrades gracefully.

---

## 6. Risk Mitigations

| Risk                       | Mitigation                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Maturity**               | Repository abstraction for swap; pin SDK version; JSON export escape hatch; SQLite fallback auto-activates                          |
| **No JOINs**               | Client-side joins on subscription cache; denormalized `run_metrics`; indexed foreign keys; `sync_graph` bulk reducer                |
| **Schema migrations**      | Additive changes via `spacetime publish`; breaking changes via export/re-import; phase 1 schema freeze (all phases defined upfront) |
| **Backup**                 | SpacetimeDB Cloud snapshots; application-level JSON export; optional SQLite shadow writes                                           |
| **Operational complexity** | SpacetimeDB Cloud for prod (managed); Docker Compose for local dev; health check endpoint                                           |

---

## File Structure

```
packages/
  luca-studio-db/                    # SpacetimeDB server module (NEW)
    src/
      module.ts                      # schema + reducers
    migrations/                      # Schema migration scripts
    package.json
  luca-studio/
    lib/
      repositories/
        workflow-repository.ts       # Interface
        spacetime-workflow-repository.ts
        sqlite-workflow-repository.ts
        index.ts                     # Factory
      spacetimedb-bridge.ts          # useTable -> Jotai sync
      spacetimedb-client.ts          # Generated client
    app/
      providers.tsx                  # Updated with SpacetimeDBProvider
```
