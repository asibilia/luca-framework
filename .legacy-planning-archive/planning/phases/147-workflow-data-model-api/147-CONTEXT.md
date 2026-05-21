# Phase 147 Discussion Context: Workflow Data Model & API

**Complexity:** SIMPLE
**Appetite:** Small (50,000 tokens, 40% context)

## Gray Areas Resolved

### 1. Schema Design: Flat vs Nested Node Data

**Decision:** Flat Zod schemas with React Flow's `Node<TData>` generic pattern.

- `WorkflowNodeDataSchema` defines the custom data payload
- React Flow wraps it as `Node<WorkflowNodeData>` which adds `id`, `position`, `type`, etc.
- This matches how React Flow v12 expects custom node data

### 2. API Route Pattern: Static vs MuninnDB-backed

**Decision:** Static curated topology served from a hardcoded data file, NOT fetched from MuninnDB.

- The workflow topology is a design artifact, not runtime data
- Agent/skill relationships are known at build time
- No vault scoping needed for topology (it's the same across all vaults)
- Future phases can add runtime state overlay (active node highlighting)

### 3. Hook Pattern: SWR/React Query vs useState+fetch

**Decision:** Follow existing observer pattern: `useState` + `useCallback` + `useEffect` + `fetch`.

- Consistent with `use-dashboard.ts`, `use-todos.ts`, etc.
- No new dependencies needed
- Vault atom integration via `useAtomValue(vaultAtom)` even though topology is vault-independent (for future use)

### 4. Topology Data Structure

**Decision:** Model the autopilot pipeline spine as primary structure with agent nodes branching off.

**Pipeline spine stages:**

1. `classify` — lu-router classifies complexity
2. `discuss` — phase-discuss gathers context
3. `plan` — lu-planner generates PLAN.md
4. `execute` — lu-executor implements code
5. `verify` — lu-verifier checks results
6. `learn` — lu-learner captures patterns

**Node types:** `step` (pipeline stages), `agent` (lu-_ agents), `skill` (phase-_ skills), `gate` (complexity gates)

**Edge types:** `invokes` (step → agent), `spawns` (agent → agent), `gates` (complexity-dependent), `data-flow` (data passing)

### 5. Complexity Filtering

**Decision:** Optional `complexity` query param filters which agents appear.

- Without filter: show all agents at all tiers
- With filter: show only agents active at that complexity level
- Model tier badges on each agent node

## Key Files to Create/Modify

| File                                 | Action | Purpose                        |
| ------------------------------------ | ------ | ------------------------------ |
| `lib/workflow-types.ts`              | Create | Zod schemas + TypeScript types |
| `lib/workflow-topology.ts`           | Create | Static curated topology data   |
| `app/api/workflow/topology/route.ts` | Create | GET endpoint serving topology  |
| `hooks/use-workflow-graph.ts`        | Create | Data fetching hook             |
| `lib/constants.ts`                   | Modify | Add WORKFLOW_STAGES metadata   |

## Patterns to Follow

- Zod schema-first with `z.infer<typeof Schema>` for types
- snake_case for API response fields
- kebab-case for file names
- muninn-route-helper pattern for API route (or simple NextResponse if no MuninnDB proxy needed)
- Existing hook pattern from `hooks/use-dashboard.ts`
