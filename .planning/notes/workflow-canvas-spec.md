# Workflow Canvas: Feature Specification

> **Status:** Approved for research phase breakdown
> **Date:** 2026-03-25
> **Participants:** Product Lead, UX Designer, Principal Architect, Senior Frontend Dev, Senior Backend Dev, QA Lead
> **Output:** Consolidated spec with resolved tensions, ready for sub-team research
> **Revision:** Updated 2026-03-25 with cross-review debate outcomes (6 agents, 6 tensions, 3 concessions)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tension Resolutions](#2-tension-resolutions)
3. [Product Definition](#3-product-definition)
4. [UX Specification](#4-ux-specification)
5. [Technical Architecture](#5-technical-architecture)
6. [Graph Data Model](#6-graph-data-model)
7. [Execution Engine](#7-execution-engine)
8. [Provider Integration](#8-provider-integration)
9. [State Management](#9-state-management)
10. [Persistence Layer](#10-persistence-layer)
11. [Security](#11-security)
12. [QA & Acceptance Criteria](#12-qa--acceptance-criteria)
13. [Implementation Phases](#13-implementation-phases)
14. [Open Questions for Sub-Team Research](#14-open-questions-for-sub-team-research)
15. [File Structure](#15-file-structure)

---

## 1. Executive Summary

A visual node-graph workflow canvas for Luca Studio where users create, run, test, measure, and iterate on agentic workflows. Inspired by ElevenLabs (aesthetic + flow), n8n (execution UX), and UE5 Blueprints (typed connections).

**Key insight from the grooming session:** This is NOT greenfield. The existing Luca Studio pipeline page already has React Flow v12, 20+ workflow components, Jotai state management, DAG validation, auto-layout, step config panel, CodeMirror editor, and dirty tracking. The delta is: new node types, execution engine, provider integration, and persistence.

**Competitive differentiator:** No competitor builds a visual workflow editor for agentic development frameworks with cognitive memory integration, complexity gating, and bidirectional Luca CLI interop. This is a defensible niche.

---

## 2. Tension Resolutions

Six architectural tensions were identified during the grooming session. Each is resolved below with rationale.

### RESOLVED: Tension 1 -- Canvas Route

**Decision:** New route at `app/canvas/[id]/page.tsx`

**Vote:** 4-2 for new route (Product, Architect, Backend, Backend for new route; UX, QA, Frontend for evolving `/pipeline`)

**Rationale:** The existing `/pipeline` page reads from a static curated topology (`getTopology()` in `workflow-topology.ts`) and is tightly coupled to Luca internals (model routing, iteration budgets, complexity gates). The canvas is a user-authored editor with different data source, persistence, and interaction model. Creating a new route avoids breaking the working pipeline visualization. `/canvas/[id]` is chosen over `/workflow/[id]` because "workflow" is already overloaded in the codebase (`src/workflow/` is the DAG engine domain). Shared React Flow infrastructure (NodeCard, WorkflowEdge, toolbar, minimap, auto-layout) is extracted to `components/workflow/shared/` and consumed by both routes.

**Dissent noted:** UX and Frontend argued the pipeline page is already 80% of the editor and a new route is wasted effort. Their concern is mitigated by component extraction -- the existing code is reused, not duplicated. Product proposed redirecting `/pipeline` to `/canvas/default` long-term.

### RESOLVED: Tension 2 -- Execution Architecture

**Decision:** Next.js API route proxy (Vercel AI SDK pattern) for all providers.

**Rationale:** Client-side execution is blocked by CORS -- Anthropic and OpenAI APIs do not allow browser-origin requests. The Vercel AI SDK's standard pattern is `useChat`/`useCompletion` hooks calling Next.js route handlers at `app/api/runs/`. This gives us:

- No CORS issues (server-to-server calls)
- API keys never leave the server process
- Execution survives browser tab close (server-side continuation)
- Streaming via Server-Sent Events (SSE) to the client
- Reuses the existing `useSSE` hook pattern in the studio

Ollama calls can optionally go direct from browser (CORS enabled by default) but the proxy path keeps the architecture uniform.

### RESOLVED: Tension 3 -- Cycle Policy

**Decision:** DAG-only for Phase 1 and Phase 2. Loop nodes deferred to Phase 3.

**Rationale:** The existing `hasCycle()` in `dag-validation.ts` rejects all cycles. Loop handling requires back-edge detection, sub-DAG re-execution, iteration limits, and new termination semantics -- this is significant complexity. Product's phasing (Phase 1 = visual authoring, Phase 2 = execution, Phase 3 = control flow) is correct. The existing learn-to-classify cycle in the Luca pipeline topology is a special case that does not need to be generalized in the canvas MVP. The data model DOES include `loop_config` on edges from day 1 so the schema is forward-compatible -- the execution engine just ignores it until Phase 3.

### RESOLVED: Tension 4 -- Persistence Layer

**Decision:** `bun:sqlite` for MVP, with repository abstraction. SpacetimeDB deferred to Phase 2+.

**Vote:** 5-1 against SpacetimeDB for MVP. Architect conceded after debate.

**Rationale:** The debate revealed SpacetimeDB was **previously removed** from the Luca framework (phases 02, todos 75/76/78). Zero references in source code. Re-introducing a deliberately removed dependency requires strong justification. The team concluded:

1. **`bun:sqlite` is zero-config**: Built into Bun, matches the Bun-first philosophy, no external service.
2. **Filesystem persistence already proven**: Studio persists config to JSON, entities to `src/` files.
3. **Real-time subscriptions not needed for MVP**: Solo developer, single browser tab.
4. **Repository abstraction preserves optionality**: `WorkflowRepository` interface with `SqliteWorkflowRepository` for MVP.
5. **JSON export from day 1**: Every workflow exports to `luca-workflow-v1` JSON. Backup escape hatch + VCS friendly.

### RESOLVED: Tension 5 -- Cost Unit

**Decision:** Microdollars (`u64`) for storage and calculation; formatted to dollars with 4 decimal places for display.

**Rationale:** Backend's microdollar approach is architecturally correct. Floating-point cost accumulation (`f64`) introduces drift over hundreds of steps -- a 100-step workflow could accumulate ~0.01 cent of rounding error. Integer arithmetic with microdollars (1 USD = 1,000,000 micros) is exact. The display layer converts: `$0.0042` for per-node, `$1.23` for totals. QA's concern about banker's rounding is addressed at the display layer only, not in the underlying calculations.

### RESOLVED: Tension 6 -- Node Types for MVP

**Decision:** 5 node types for Phase 1, expanding to 8 in Phase 2, full 17 in Phase 3.

**Debate range:** Product/QA said 4 (existing only + hook). Architect said 5 (+ transform). Backend said 5 (input, llm, output, transform, condition). Frontend said 5 (existing 4 + hook). Consensus: 5.

| Phase                      | Node Types                                                                                    | Count |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----- |
| Phase 1 (Visual Authoring) | Skill, Hook, Agent, Gate, StageGroup (existing)                                               | 5     |
| Phase 2 (Execution)        | + Conditional, Input, Output                                                                  | 8     |
| Phase 3 (Control Flow)     | + Loop, Parallel Split, Parallel Join, Delay, Error Handler, Subworkflow, Transform, Variable | 17    |

**Rationale:** Product is right that 17 types is scope creep for MVP. But the architect is right that Input/Output nodes are essential from day 1 -- they define the workflow's interface (what goes in, what comes out). Comment nodes are trivial (no execution, just text on canvas) and improve usability. The existing StageGroup node provides grouping. Everything else defers. The Zod schemas for ALL 17 types are defined in Phase 1 (forward-compatible data model), but only 7 get React components.

**Port types for MVP:** Reduce from 10 to 3: `string`, `object`, `any`. Add more as needed in later phases. The port type system exists in the schema but MVP validation treats everything as `any`.

---

## 3. Product Definition

### 3.1 User Personas

**Primary -- The Solo AI Builder:** A developer using Luca who builds and iterates on agentic workflows. Already defines agents, skills, rules, and hooks in TypeScript. Wants to SEE the workflow, not grep through files. Already uses Luca Studio.

**Secondary -- The Workflow Tinkerer:** Technically capable user who thinks in terms of "this skill feeds into that agent." Wants to drag, connect, configure, and hit Play without learning the compiler pipeline.

**Stretch (Phase 3+) -- The Prompt Engineer:** Non-developer who designs prompts and agent behaviors. Needs visual interface to understand workflow topology. Configures node properties but doesn't write code.

### 3.2 Core Value Proposition

- "I cannot see how my agents connect to my skills" -- solved by spatial layout with typed edges
- "I have to read 5 files to understand execution order" -- solved by single canvas view
- "I want to test a workflow change without a full build:all cycle" -- solved by inline execution
- "I don't know what this workflow costs to run" -- solved by token/cost display per execution

### 3.3 Competitive Positioning

| Competitor       | Their Focus         | Our Differentiation                                  |
| ---------------- | ------------------- | ---------------------------------------------------- |
| n8n              | Generic automation  | Agentic AI workflows with cognitive memory           |
| Langflow/Flowise | LangChain pipelines | Luca domain model (skills, hooks, complexity gating) |
| ElevenLabs       | Voice AI pipelines  | General-purpose agent orchestration                  |
| UE5 Blueprints   | Game logic          | AI/LLM-specific with cost tracking                   |

### 3.4 Success Metrics

| Metric                      | Target (90 days post-launch)    |
| --------------------------- | ------------------------------- |
| Workflows created           | 50+ unique                      |
| Nodes per workflow (avg)    | 8+                              |
| Time to first node          | < 30 seconds                    |
| Time to first run (Phase 2) | < 3 minutes                     |
| Save rate                   | 80%+ of started workflows saved |
| Return rate                 | 60%+ return within 7 days       |

---

## 4. UX Specification

### 4.1 Layout

```
+--------+-----------------------------+--------------+
| NavRail| Canvas                      | Inspector    |
| 48px   |                             | 480px        |
| (icon) | [Toolbar]  [Stats]          | (on select)  |
|        |                             |              |
|  +---+ |   +-------+                 | [Identity]   |
|  |Pal| |   |Stage  |                 | [Config]     |
|  |ett| |   | Group |                 | [Model]      |
|  |e  | |   |  +--+ |                 | [Metadata]   |
|  |   | |   |  |Sk| |                 | [Body]       |
|  +---+ |   |  +--+ |                 |              |
|        |   +-------+                 |              |
|        |                             |              |
|        | [Minimap]                   |              |
+--------+-----------------------------+--------------+
         | [Results Drawer]            |  (Phase 2)
         +-----------------------------+
```

- **Node palette**: Collapsible left drawer (240px), categorized by type, draggable onto canvas
- **Inspector**: Existing 480px docked right panel, extended for new node fields
- **Results drawer**: Bottom drawer (Phase 2), resizable, shows execution output/logs/costs

### 4.2 Critical UX Items (MVP)

| Priority | Item                                                           | Rationale                                                                            |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| CRITICAL | Undo/Redo (Cmd+Z)                                              | Without undo, users fear experimentation. Use `jotai-history` on combined graph atom |
| CRITICAL | Handle size increase (8px -> 12px visual, 44px hit area)       | Current 8px handles violate accessibility minimums                                   |
| CRITICAL | Connection rejection feedback (toast with reason)              | Silent rejection is confusing                                                        |
| HIGH     | Multi-select (marquee + shift-click)                           | Essential for workflows with 10+ nodes                                               |
| HIGH     | Right-click context menu for node placement                    | Power user path, fastest way to add nodes                                            |
| HIGH     | Keyboard shortcuts (Delete, Cmd+D, Tab navigation)             | Professional vs toy distinction                                                      |
| HIGH     | Execution visualization (Phase 2: node states, edge animation) | Core value of "run" mode                                                             |

### 4.3 Node Visual Hierarchy

| Node Type             | Color                       | Shape               | Handle Config         |
| --------------------- | --------------------------- | ------------------- | --------------------- |
| Skill                 | Violet                      | Card (250px)        | Top in, Bottom out    |
| Agent                 | Sky/Amber/Emerald (by tier) | Card (250px)        | Top in, Bottom out    |
| Hook                  | Teal                        | Narrow card (200px) | Bottom out ONLY       |
| Input                 | Green                       | Rounded card        | Bottom out ONLY       |
| Output                | Red                         | Rounded card        | Top in ONLY           |
| Comment               | Gray dashed                 | Borderless text     | No handles            |
| StageGroup            | Per-stage color             | Container           | N/A (parent)          |
| Conditional (Phase 2) | Blue                        | Diamond             | Top in, 2+ bottom out |
| Gate (Phase 2)        | Amber                       | Card with lock icon | Top in, Bottom out    |

### 4.4 Execution States (Phase 2)

| Status  | Visual                   | Animation                  |
| ------- | ------------------------ | -------------------------- |
| Idle    | Default                  | None                       |
| Pending | Gray dashed border       | Subtle pulse               |
| Running | Blue ring                | Pulsing glow + spinner     |
| Success | Green check badge        | 3s green ring, then fade   |
| Error   | Red X badge + red border | Persistent until inspected |
| Skipped | Dimmed (opacity 0.5)     | None                       |
| Paused  | Yellow pause icon        | None                       |

---

## 5. Technical Architecture

### 5.1 System Overview

```
Browser (Next.js App)
├── Canvas UI (React Flow + Jotai)
├── Execution UI (XState + SSE)
└── API Client (SpacetimeDB SDK)
        │
        ▼
Next.js API Routes
├── /api/workflows/        (CRUD, export, import)
├── /api/runs/             (start, cancel, resume)
├── /api/runs/[id]/stream  (SSE for execution events)
└── /api/providers/        (config, model listing)
        │
        ▼
SpacetimeDB v2 (persistence + real-time sync)
        │
        ▼
LLM Providers (via Vercel AI SDK)
├── Anthropic (Claude)
├── OpenAI (GPT)
├── Google (Gemini)
└── Ollama (local)
```

### 5.2 Key Architectural Decisions

| Decision         | Choice                                | Alternatives Considered                              |
| ---------------- | ------------------------------------- | ---------------------------------------------------- |
| Canvas library   | @xyflow/react v12 (already installed) | Custom canvas (rejected: 2000+ LOC rewrite)          |
| State: canvas UI | Jotai atoms (already in use)          | Zustand (rejected: migration cost)                   |
| State: execution | XState v5                             | Jotai (rejected: no transition guards)               |
| Persistence      | SpacetimeDB v2 + repository pattern   | Supabase (fallback), SQLite (too limited)            |
| LLM calls        | Vercel AI SDK via Next.js API routes  | Direct browser calls (rejected: CORS)                |
| Cost precision   | Microdollars (u64)                    | Cents with f64 (rejected: accumulation drift)        |
| Undo/redo        | jotai-history on combined graph atom  | Command pattern (rejected: over-engineering for MVP) |

### 5.3 Mapping to Existing Luca Definitions

**Import (Luca CLI -> Canvas):** The studio already has `/api/entities/agents`, `/api/entities/skills`, `/api/entities/rules` endpoints. The node palette lists all registered entities as draggable cards. Dragging an agent onto the canvas creates an Agent Node pre-filled with the agent's config.

**Export (Canvas -> Luca CLI):** A `canvasToDAG()` converter maps canvas nodes/edges to a `WorkflowDAG` compatible with the existing `executeDAG()`. This is lossy (comments, positions dropped) but enables CLI execution.

**Sync strategy:** One-way import for v1. Bidirectional sync deferred to v2.

---

## 6. Graph Data Model

### 6.1 Core Zod Schemas

All schemas defined in Phase 1 for forward compatibility, even if the corresponding node components ship later.

```typescript
// Port system (simplified for MVP: just "any" type)
export const PortDirectionSchema = z.enum(["input", "output"]);
export const PortTypeSchema = z.enum([
  "string",
  "object",
  "any", // MVP types
  "number",
  "boolean",
  "array", // Phase 2
  "agent-ref",
  "team-ref",
  "stream", // Phase 3
  "schema-ref", // Phase 3
]);

// Node types
export const CanvasNodeTypeSchema = z.enum([
  // Phase 1
  "skill",
  "hook",
  "agent",
  "input",
  "output",
  "comment",
  "stage-group",
  // Phase 2
  "conditional",
  "gate",
  // Phase 3
  "loop",
  "parallel-split",
  "parallel-join",
  "delay",
  "error-handler",
  "subworkflow",
  "variable",
  "transform",
]);

// Canvas node
export const CanvasNodeSchema = z.object({
  id: z.string().uuid(),
  workflow_version_id: z.string().uuid(),
  node_type: CanvasNodeTypeSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  position_x: z.number(),
  position_y: z.number(),
  config: z.record(z.string(), z.any()).default({}),
  metadata: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .default([]),
  body: z.string().default(""),
  model_override: z.string().nullable().default(null),
  parent_id: z.string().uuid().nullable().default(null), // For stage-group containment
});

// Canvas edge
export const CanvasEdgeSchema = z.object({
  id: z.string().uuid(),
  workflow_version_id: z.string().uuid(),
  source_node_id: z.string().uuid(),
  source_port: z.string().default("output"),
  target_node_id: z.string().uuid(),
  target_port: z.string().default("input"),
  condition: z
    .object({
      expression: z.string(),
      label: z.string().default(""),
    })
    .nullable()
    .default(null),
  loop_config: z
    .object({
      mode: z.enum(["for-each", "while", "count", "approval-gated"]),
      max_iterations: z.number().int().positive().default(100),
      condition: z.string().optional(),
    })
    .nullable()
    .default(null),
});

// Workflow
export const WorkflowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  owner: z.string().default("system"),
  tags: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Workflow version (immutable snapshot)
export const WorkflowVersionSchema = z.object({
  id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  label: z.string().default("draft"),
  is_published: z.boolean().default(false),
  created_at: z.string().datetime(),
});

// Agent team
export const AgentTeamSchema = z.object({
  id: z.string().uuid(),
  workflow_version_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  model_config: z.record(z.string(), z.any()).default({}),
});

export const AgentAssignmentSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  agent_name: z.string().min(1),
  role: z.string().default("member"),
});

// Run (Phase 2)
export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const RunSchema = z.object({
  id: z.string().uuid(),
  workflow_version_id: z.string().uuid(),
  status: RunStatusSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  input_data: z.record(z.string(), z.any()).default({}),
  output_data: z.record(z.string(), z.any()).optional(),
  error: z.string().optional(),
  provider_config_id: z.string().uuid().optional(),
});

export const RunStepSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  node_id: z.string().uuid(),
  status: z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",
    "paused",
    "timeout",
  ]),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  output_data: z.record(z.string(), z.any()).optional(),
  error: z.string().optional(),
  attempt: z.number().int().nonnegative().default(0),
  input_tokens: z.number().int().nonnegative().default(0),
  output_tokens: z.number().int().nonnegative().default(0),
  cost_micros: z.number().int().nonnegative().default(0),
  duration_ms: z.number().nonnegative().default(0),
});

export const RunMetricsSchema = z.object({
  run_id: z.string().uuid(),
  total_input_tokens: z.number().int().nonnegative().default(0),
  total_output_tokens: z.number().int().nonnegative().default(0),
  total_cost_micros: z.number().int().nonnegative().default(0),
  total_duration_ms: z.number().nonnegative().default(0),
  steps_completed: z.number().int().nonnegative().default(0),
  steps_failed: z.number().int().nonnegative().default(0),
  steps_skipped: z.number().int().nonnegative().default(0),
});
```

### 6.2 Export/Import Format

```typescript
export const WorkflowExportSchema = z.object({
  format: z.literal("luca-workflow-v1"),
  exported_at: z.string().datetime(),
  workflow: WorkflowSchema,
  version: WorkflowVersionSchema,
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
  teams: z.array(AgentTeamSchema),
  assignments: z.array(AgentAssignmentSchema),
});
```

---

## 7. Execution Engine

### 7.1 Architecture

```
Next.js API Route (/api/runs/)
  ├── Validate graph (cycle detection, required ports, model availability)
  ├── Snapshot workflow version
  ├── Create Run + RunStep records in SpacetimeDB
  ├── Topological sort into waves
  └── Execute waves sequentially:
      ├── For each wave: Promise.allSettled(active steps)
      ├── Per step: call provider via Vercel AI SDK
      ├── Record output, tokens, cost to RunStep
      ├── Emit SSE events for real-time UI updates
      └── Check budget limits before next wave
```

### 7.2 Execution Flow (Phase 2)

1. Client sends `POST /api/runs/` with `{ workflow_version_id, input_data, provider_config_id }`
2. Server validates graph, creates Run record (status: `running`)
3. Server performs topological sort, groups into execution waves
4. For each wave, execute all nodes concurrently via `Promise.allSettled`
5. Per node: resolve template variables, call provider, record results
6. Emit SSE events: `node_start`, `node_progress`, `node_complete`, `node_error`
7. Client subscribes via `GET /api/runs/[id]/stream` (SSE)
8. On completion: aggregate metrics, set Run status, emit `execution_complete`

### 7.3 Provider Call Pattern

```typescript
// Using Vercel AI SDK (standard Next.js pattern)
import { generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

async function executeNode(node, context, providerConfig, signal) {
  const provider = createProvider(providerConfig);
  const model = provider(node.model_override ?? providerConfig.default_model);
  const resolvedPrompt = resolveTemplates(node.body, context);

  const result = await generateText({
    model,
    messages: [{ role: "user", content: resolvedPrompt }],
    abortSignal: signal,
  });

  return {
    output: result.text,
    input_tokens: result.usage.promptTokens,
    output_tokens: result.usage.completionTokens,
    cost_micros: calculateCostMicros(model, result.usage),
  };
}
```

### 7.4 Budget Enforcement

- **Pre-run estimate**: Before execution, estimate total cost based on input sizes and model pricing
- **Per-wave check**: Before each wave, check accumulated cost against budget limit
- **Default budget**: $10 per run (configurable)
- **On exceed**: Pause execution, emit `budget_exceeded` SSE event, await user confirmation

### 7.5 Template Resolution

```
Resolution order:
1. {{env.SECRET}}         -> resolved at execution start from provider config
2. {{variables.name}}     -> resolved from workflow variable definitions
3. {{node_id.output}}     -> resolved from accumulated execution context (post-dependency)
```

MVP: Simple dot-path interpolation only. No arithmetic, no conditionals. Transform nodes (Phase 3) handle complex data mapping.

---

## 8. Provider Integration

### 8.1 Supported Providers

| Provider           | Phase   | Auth         | Model Discovery                |
| ------------------ | ------- | ------------ | ------------------------------ |
| Anthropic (Claude) | Phase 2 | BYOK API key | Hardcoded model list           |
| OpenAI (GPT)       | Phase 2 | BYOK API key | Hardcoded model list           |
| Google (Gemini)    | Phase 2 | BYOK API key | Hardcoded model list           |
| Ollama (local)     | Phase 2 | None         | `GET /api/tags` auto-discovery |

### 8.2 Model Pricing Table

Hardcoded, manually updated. Stored as a versioned JSON object.

```typescript
const MODEL_PRICING: Record<
  string,
  { input_per_m: number; output_per_m: number }
> = {
  // Prices in microdollars per 1M tokens
  "claude-sonnet-4-6": { input_per_m: 3_000_000, output_per_m: 15_000_000 },
  "claude-haiku-4-5": { input_per_m: 800_000, output_per_m: 4_000_000 },
  "claude-opus-4-6": { input_per_m: 15_000_000, output_per_m: 75_000_000 },
  "gpt-4o": { input_per_m: 2_500_000, output_per_m: 10_000_000 },
  "gpt-4o-mini": { input_per_m: 150_000, output_per_m: 600_000 },
  "gemini-2.5-pro": { input_per_m: 1_250_000, output_per_m: 10_000_000 },
  "gemini-2.5-flash": { input_per_m: 150_000, output_per_m: 600_000 },
  "ollama:*": { input_per_m: 0, output_per_m: 0 },
};
```

### 8.3 BYOK Key Security

- Keys stored server-side only (Next.js environment or encrypted in SQLite)
- Keys NEVER sent to the browser
- Keys NEVER included in workflow export JSON
- Keys masked in UI (show last 4 characters only)
- Key validation on save: make a minimal API call to verify

---

## 9. State Management

### 9.1 Jotai for Canvas State

```typescript
// Extends existing pipeline-atoms.ts pattern
export const canvasGraphAtom = atom<{
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}>({
  nodes: [],
  edges: [],
});
// Combined atom enables atomic undo/redo

// Derived read atoms for React Flow
export const canvasNodesAtom = atom((get) => get(canvasGraphAtom).nodes);
export const canvasEdgesAtom = atom((get) => get(canvasGraphAtom).edges);

// UI state
export const selectedNodeIdAtom = atom<string | null>(null);
export const canvasViewportAtom = atom<Viewport>({ x: 0, y: 0, zoom: 1 });
export const canvasModeAtom = atom<"select" | "connect" | "pan">("select");

// Undo/redo via jotai-history on the combined graph atom
// Already proven pattern in use-undo.ts
```

### 9.2 XState for Execution State (Phase 2)

```typescript
const runMachine = createMachine({
  id: "workflow-run",
  initial: "idle",
  states: {
    idle: { on: { START: "validating" } },
    validating: { on: { VALID: "running", INVALID: "failed" } },
    running: {
      on: {
        STEP_COMPLETE: "running",
        GATE_REACHED: "paused",
        ALL_COMPLETE: "completed",
        ERROR: "failed",
        CANCEL: "cancelled",
        BUDGET_EXCEEDED: "paused",
      },
    },
    paused: { on: { RESUME: "running", CANCEL: "cancelled" } },
    completed: { type: "final" },
    failed: { type: "final" },
    cancelled: { type: "final" },
  },
});
```

Bridge to Jotai: `runStateAtom` subscribes to XState service, exposing `state.value` and `state.context` as reactive atoms.

---

## 10. Persistence Layer

### 10.1 SQLite via bun:sqlite (MVP)

All tables map to the Zod schemas in Section 6. Key design choices:

- **UUIDs** for all IDs (client-generated via `crypto.randomUUID()`)
- **JSON columns** for nested/complex data (SQLite's JSON1 extension)
- **Single file** database at `.luca/workflows.db` (portable, backup-friendly)
- **Cost stored as microdollars** (INTEGER) for precision
- **API key encryption**: Encrypted client-side before storage (Web Crypto API AES-256-GCM)

### 10.2 Repository Abstraction

```typescript
interface WorkflowRepository {
  // Workflows
  createWorkflow(data: WorkflowCreate): Promise<Workflow>;
  getWorkflow(id: string): Promise<Workflow | null>;
  listWorkflows(): Promise<Workflow[]>;
  updateWorkflow(id: string, data: WorkflowUpdate): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;

  // Versions
  createVersion(workflowId: string, label: string): Promise<WorkflowVersion>;
  getVersion(id: string): Promise<WorkflowVersion | null>;

  // Nodes & Edges
  addNode(versionId: string, node: CanvasNodeCreate): Promise<CanvasNode>;
  updateNode(nodeId: string, data: CanvasNodeUpdate): Promise<CanvasNode>;
  deleteNode(nodeId: string): Promise<void>; // Cascades edges
  addEdge(versionId: string, edge: CanvasEdgeCreate): Promise<CanvasEdge>;
  deleteEdge(edgeId: string): Promise<void>;
  moveNode(nodeId: string, x: number, y: number): Promise<void>;

  // Runs (Phase 2)
  createRun(data: RunCreate): Promise<Run>;
  updateRun(id: string, data: RunUpdate): Promise<Run>;
  createRunStep(data: RunStepCreate): Promise<RunStep>;
  updateRunStep(id: string, data: RunStepUpdate): Promise<RunStep>;

  // Export/Import
  exportWorkflow(versionId: string): Promise<WorkflowExport>;
  importWorkflow(data: WorkflowExport): Promise<Workflow>;
}
```

Primary implementation: `SqliteWorkflowRepository` via `bun:sqlite`. Future: `SpacetimeWorkflowRepository` if real-time multi-client sync is needed (Phase 2+).

### 10.3 Real-Time Updates via SSE

The studio already has SSE infrastructure (`hooks/use-sse.ts` + `app/api/events/route.ts`). Execution events flow via SSE:

```typescript
// SSE event types for execution (Phase 2)
type ExecutionEvent =
  | { type: "node_start"; node_id: string }
  | { type: "node_progress"; node_id: string; tokens: number }
  | {
      type: "node_complete";
      node_id: string;
      status: "success" | "error";
      output: string;
    }
  | {
      type: "execution_complete";
      status: "success" | "error";
      metrics: RunMetrics;
    };
```

LLM streaming output flows via SSE directly to the UI -- NOT through the persistence layer. Only final completed outputs are persisted to SQLite. This avoids row-churn for streaming tokens.

### 10.4 Debounced Writes

Node drag operations: update Jotai atom immediately (optimistic), flush position to SQLite every 200ms. Inspector panel edits: debounce at 1000ms.

---

## 11. Security

### 11.1 Threat Model

| Threat                                  | Mitigation                                                                 | Phase   |
| --------------------------------------- | -------------------------------------------------------------------------- | ------- |
| API key exposure in browser             | Keys never sent to client; server-side only                                | Phase 2 |
| XSS via node name/metadata              | React JSX auto-escapes; no `dangerouslySetInnerHTML`                       | Phase 1 |
| Prompt injection via node body          | System prompts immutable; user text in user role only                      | Phase 2 |
| SSRF via Ollama endpoint                | Validate URL against allowlist (localhost, \*.local)                       | Phase 2 |
| Resource exhaustion (runaway workflows) | Budget cap ($10 default), max iterations (100), execution timeout (30min)  | Phase 2 |
| SpacetimeDB data access                 | `provider_config` table is private; workflow data scoped by owner identity | Phase 1 |

### 11.2 Expression Sandboxing

Template expressions (`{{...}}`) are resolved via string interpolation with dot-path access. No `eval()`, no `Function()` constructor, no arbitrary code execution. Reuse `sanitizeForTemplate` from `src/shared/__helpers/sanitize-template.ts`.

---

## 12. QA & Acceptance Criteria

### 12.1 MVP Acceptance Criteria (Phase 1)

| #     | Criterion             | Pass Condition                                                                     |
| ----- | --------------------- | ---------------------------------------------------------------------------------- |
| AC-1  | Create workflow       | User creates a new workflow with 3+ connected nodes in < 2 minutes                 |
| AC-2  | Configure skill node  | User sets name, type, metadata, body. Config persists after page refresh           |
| AC-3  | Undo/redo             | Cmd+Z undoes last action, Shift+Cmd+Z redoes. Works for add/delete/connect/move    |
| AC-4  | Persistence           | Workflow survives page refresh, browser close/reopen                               |
| AC-5  | Cycle rejection       | Connecting nodes that would create a cycle shows clear error and prevents the edge |
| AC-6  | Node deletion cleanup | Deleting a node removes all connected edges atomically                             |
| AC-7  | Canvas performance    | 50-node workflow renders and interacts at 30fps+                                   |
| AC-8  | No data loss          | Closing browser during idle preserves all state                                    |
| AC-9  | Error messages        | All errors include: what happened, why, and what to do next                        |
| AC-10 | Cross-browser         | Works in Chrome 120+, Firefox 120+, Safari 17+                                     |
| AC-11 | JSON export           | Workflow exports to valid JSON matching `WorkflowExportSchema`                     |
| AC-12 | JSON import           | Exported JSON imports back to identical graph (round-trip fidelity)                |

### 12.2 Phase 2 Acceptance Criteria (Execution)

| #     | Criterion                    | Pass Condition                                                        |
| ----- | ---------------------------- | --------------------------------------------------------------------- |
| AC-13 | Execute workflow             | Workflow runs and shows output within 30 seconds (3-node, fast model) |
| AC-14 | Cost tracking                | Token usage and cost breakdown shown per-node and as workflow total   |
| AC-15 | Provider config              | User can configure BYOK API key, select model, and execute            |
| AC-16 | Execution visualization      | Nodes show running/success/error states in real-time                  |
| AC-17 | Error recovery               | Failed node shows error details; user can retry individual node       |
| AC-18 | Budget enforcement           | Execution pauses when budget limit is exceeded                        |
| AC-19 | Canvas lock during run       | Canvas editing disabled while workflow is running                     |
| AC-20 | Execution survives tab close | Server-side execution completes; results visible on return            |

### 12.3 Performance Targets

| Metric              | 10 nodes | 50 nodes | 100 nodes |
| ------------------- | -------- | -------- | --------- |
| Initial render      | < 100ms  | < 200ms  | < 500ms   |
| Pan/zoom FPS        | 60fps    | 60fps    | 30fps+    |
| Add node latency    | < 16ms   | < 16ms   | < 50ms    |
| Save to SpacetimeDB | < 200ms  | < 500ms  | < 1s      |
| Memory usage        | < 50MB   | < 100MB  | < 200MB   |

### 12.4 Launch-Blocking Risks

| Risk                          | Severity | Mitigation                                                              |
| ----------------------------- | -------- | ----------------------------------------------------------------------- |
| SpacetimeDB data loss         | HIGH     | JSON export escape hatch from day 1; repository abstraction for swap    |
| API key security              | HIGH     | Keys never leave server; encrypted at rest in SpacetimeDB private table |
| Budget enforcement gaps       | HIGH     | Pre-wave budget check; default $10 cap; hard stop on exceed             |
| Canvas performance regression | MEDIUM   | Memoize all node components; performance budget in review               |
| Concurrent modification       | MEDIUM   | Canvas lock during execution (MVP); version snapshots for runs          |

---

## 13. Implementation Phases

### Phase 1 -- Visual Authoring (3-4 weeks)

**Goal:** Users can create, edit, save, and share workflow graphs visually.

**Deliverables:**

- [ ] Route: `app/workflow/page.tsx` (listing) + `app/workflow/[id]/page.tsx` (editor)
- [ ] Zod schemas for all node/edge/workflow types (full schema, forward-compatible)
- [ ] 7 node components: Skill, Hook, Agent, Input, Output, Comment, StageGroup
- [ ] Canvas state atoms (combined `canvasGraphAtom` with jotai-history undo)
- [ ] Node palette (left drawer, drag-to-canvas, categorized by type)
- [ ] Inspector panel (extending StepConfigPanel pattern for new node fields)
- [ ] Handle size fix (8px -> 12px visual, 44px hit area)
- [ ] Connection validation (type checking, cycle rejection with toast feedback)
- [ ] Right-click context menu for node placement
- [ ] Keyboard shortcuts (Delete, Cmd+D, Cmd+A, Cmd+Z, Shift+Cmd+Z, Tab)
- [ ] Multi-select (marquee + shift-click)
- [ ] SpacetimeDB integration (via WorkflowRepository interface)
- [ ] JSON export/import with `luca-workflow-v1` format
- [ ] Import from Luca entity registry (node palette lists registered agents/skills/hooks)

### Phase 2 -- Execution Engine (2-3 weeks)

**Goal:** Users can run workflows against LLM providers and see real-time results with cost tracking.

**Deliverables:**

- [ ] Next.js API routes: `/api/runs/`, `/api/runs/[id]/stream`, `/api/providers/`
- [ ] Execution engine: topological sort, wave-based execution, `Promise.allSettled`
- [ ] Provider integration: Vercel AI SDK adapters for Anthropic, OpenAI, Google, Ollama
- [ ] XState execution machine + Jotai bridge
- [ ] Execution visualization: node status overlays, edge animation, progress indicators
- [ ] Results drawer: output, logs, cost breakdown tabs
- [ ] Token counting from provider responses + microdollar cost calculation
- [ ] Budget enforcement (pre-wave check, default $10 cap)
- [ ] BYOK provider configuration UI (key input, model selection, validation)
- [ ] Canvas lock during execution
- [ ] SSE streaming for real-time execution updates
- [ ] 2 new node components: Conditional, Gate

### Phase 3 -- Control Flow & Advanced Features (3-4 weeks)

**Goal:** Full workflow power with loops, parallelism, debugging, and advanced features.

**Deliverables:**

- [ ] Loop nodes (for-each, count, while, approval-gated) with back-edge detection
- [ ] Parallel split/join nodes with join strategies (all, any, n-of-m)
- [ ] Delay and Error Handler nodes
- [ ] Subworkflow nodes (workflow-as-node composition)
- [ ] Variable and Transform nodes
- [ ] Debug mode (step-through execution with breakpoints)
- [ ] Workflow versioning with diff view
- [ ] Workflow templates gallery (5-10 starter templates)
- [ ] Advanced template system with design-time validation
- [ ] `canvasToDAG()` export for CLI execution
- [ ] Node grouping / subgraph collapse

### Phase 4 -- Polish & Scale (2-3 weeks)

**Goal:** Production hardening, collaboration foundations, and growth features.

**Deliverables:**

- [ ] Command palette (Cmd+K)
- [ ] Slash command for quick node creation
- [ ] Workflow sharing (URL-based)
- [ ] Run history and comparison (diff between runs)
- [ ] A/B testing: run two workflow variants, compare results/costs
- [ ] Performance profiling per node
- [ ] Cognitive memory integration (recall patterns from MuninnDB during node configuration)
- [ ] Accessibility: list-view alternative, ARIA live regions, focus management

---

## 14. Open Questions for Sub-Team Research

Each question below needs a dedicated research spike before implementation.

### 14.1 bun:sqlite Schema Design (Backend Team)

- **SQLite JSON1 extension:** Test JSON column queries via `bun:sqlite`. Can we filter nodes by `json_extract(config, '$.model')`?
- **Concurrent access:** What happens if two Next.js API routes write to the same SQLite file simultaneously? Test WAL mode.
- **Migration strategy:** How do we evolve the SQLite schema without data loss? Test with ALTER TABLE + data migration scripts.
- **Backup:** Is copying the `.db` file sufficient for backup? Test with concurrent reads during copy.
- **Performance:** Benchmark CRUD operations for workflows with 50+ nodes and 100+ edges.

### 14.2 Vercel AI SDK Research (Backend Team)

- **Streaming + token counting:** Can we get accurate token counts from streaming responses before the stream completes?
- **Abort handling:** Does `AbortController` cleanly cancel in-flight streaming responses? Do aborted calls still incur cost?
- **Provider parity:** Which providers support tool use? Vision? Structured output? Build a capability matrix.
- **Ollama via OpenAI-compatible endpoint:** Verify the `createOpenAI({ baseURL: ollama })` pattern works for all Ollama models.

### 14.3 Canvas UX Research (Frontend Team)

- **React Flow + ShadCN interop:** Can ShadCN `Sheet`, `DropdownMenu`, and `Command` components render correctly inside React Flow node bounds? Test z-index and portal behavior.
- **Combined graph atom performance:** Benchmark `jotai-history` with a combined `{ nodes, edges }` atom at 50/100 nodes. Does undo/redo cause full canvas re-render?
- **Minimap with execution overlays:** Can the React Flow minimap reflect node execution status colors? Test with custom node colors.
- **CodeMirror inside React Flow node:** If we ever want inline body editing, test CodeMirror rendering inside a React Flow custom node. Document issues.

### 14.4 Execution Engine Research (Architecture Team)

- **Topological sort with wave grouping:** The existing `topologicalSort()` in `src/workflow/` already groups nodes into waves for parallel execution. Verify it works with the canvas graph structure (different schema than `WorkflowDAG`).
- **Approval gate persistence:** Design the exact flow for gate nodes: where is the "waiting for approval" state persisted? How does the resume signal reach the execution loop?
- **Run checkpoint/resume:** Can a failed run resume from the last successful wave? Design the checkpoint format.

### 14.5 Security Research (QA + Backend)

- **SpacetimeDB encryption at rest:** Is data encrypted on disk? If not, what's the encryption story for API keys?
- **Prompt injection baseline:** Run a prompt injection test suite against the execution engine. Document which attacks succeed and which mitigations are effective.
- **Ollama SSRF:** Test URL validation against common SSRF payloads. Document the allowlist strategy.

---

## 15. File Structure

```
packages/luca-studio/
├── app/
│   ├── workflow/
│   │   ├── page.tsx                    # Workflow listing page
│   │   └── [id]/
│   │       └── page.tsx                # Workflow editor (canvas)
│   └── api/
│       ├── workflows/
│       │   ├── route.ts                # GET (list), POST (create)
│       │   └── [id]/
│       │       ├── route.ts            # GET, PUT, DELETE
│       │       ├── versions/route.ts
│       │       ├── export/route.ts
│       │       └── import/route.ts
│       ├── runs/                        # Phase 2
│       │   ├── route.ts                # POST (start)
│       │   └── [id]/
│       │       ├── route.ts            # GET (status)
│       │       ├── stream/route.ts     # SSE endpoint
│       │       ├── resume/route.ts
│       │       └── cancel/route.ts
│       └── providers/                   # Phase 2
│           ├── route.ts
│           └── [id]/
│               └── models/route.ts
├── components/
│   └── canvas/
│       ├── canvas-shell.tsx             # Main wrapper (ReactFlowProvider + layout)
│       ├── canvas-toolbar.tsx           # Zoom, minimap, layout, undo, play
│       ├── node-palette.tsx             # Left drawer with draggable node cards
│       ├── node-inspector.tsx           # Right panel for node configuration
│       ├── nodes/
│       │   ├── base-node.tsx            # Shared card shell (handles, border, slots)
│       │   ├── skill-node.tsx
│       │   ├── agent-node.tsx
│       │   ├── hook-node.tsx
│       │   ├── input-node.tsx
│       │   ├── output-node.tsx
│       │   ├── comment-node.tsx
│       │   ├── conditional-node.tsx     # Phase 2
│       │   └── gate-node.tsx            # Phase 2
│       ├── edges/
│       │   ├── data-flow-edge.tsx
│       │   └── conditional-edge.tsx     # Phase 2
│       ├── execution/                   # Phase 2
│       │   ├── execution-overlay.tsx
│       │   ├── results-drawer.tsx
│       │   └── run-controls.tsx
│       └── index.ts                     # Barrel exports
├── hooks/
│   ├── use-canvas-state.ts
│   ├── use-canvas-undo.ts
│   ├── use-workflow-crud.ts
│   ├── use-workflow-execution.ts        # Phase 2
│   └── use-provider-config.ts           # Phase 2
├── stores/
│   ├── canvas-atoms.ts
│   └── run-machine.ts                   # Phase 2 (XState)
└── lib/
    ├── canvas-types.ts                  # Zod schemas (Section 6)
    ├── canvas-validation.ts             # Graph validation
    ├── canvas-to-dag.ts                 # Phase 3 export converter
    ├── template-resolver.ts             # Phase 2
    ├── model-pricing.ts                 # Phase 2
    └── workflow-repository.ts           # Repository interface + SQLite impl
```

---

## Appendix A: Existing Infrastructure Inventory

Files in the current codebase that this feature builds on:

| File                                        | What It Provides                                | Reuse Strategy                                                       |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `components/workflow/pipeline-canvas.tsx`   | React Flow v12 canvas with controlled state     | Reference pattern; new canvas is separate route                      |
| `components/workflow/nodes/node-card.tsx`   | Base node card with handles, border, slots      | Extract to `canvas/nodes/base-node.tsx`, add `showTargetHandle` prop |
| `components/workflow/canvas-toolbar.tsx`    | Zoom, minimap, layout toggle                    | Reference pattern; extend with undo, play                            |
| `components/workflow/step-config-panel.tsx` | 5-section inspector panel                       | Reference pattern; new inspector for canvas node fields              |
| `components/workflow/auto-layout.ts`        | Grouped column layout algorithm                 | Reuse directly                                                       |
| `components/workflow/edge-styles.ts`        | Edge type -> visual config                      | Extend with conditional edge style                                   |
| `lib/dag-validation.ts`                     | Kahn's algorithm cycle detection                | Reuse directly, extend with cycle path reporting                     |
| `lib/workflow-types.ts`                     | Zod schemas for topology nodes/edges            | Reference; canvas schemas are superset                               |
| `stores/pipeline-atoms.ts`                  | Jotai atoms for canvas state                    | Reference pattern; new atoms for canvas                              |
| `hooks/use-undo.ts`                         | jotai-history undo/redo with Cmd+Z              | Reuse pattern for canvas undo                                        |
| `hooks/use-sse.ts`                          | SSE connection for live updates                 | Reuse for execution streaming                                        |
| `components/editor/code-mirror-wrapper.tsx` | CodeMirror 6 with Luca theme                    | Reuse for body field editor                                          |
| `src/workflow/__helpers/dag-executor.ts`    | Wave-based DAG execution with retry, checkpoint | Reference for execution engine design                                |
| `src/workflow/__helpers/dag-sorter.ts`      | Topological sort with wave grouping             | Reuse algorithm                                                      |

---

## Appendix B: Glossary

| Term                   | Definition                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Node**               | A visual element on the canvas representing a workflow step, control flow point, or annotation |
| **Edge**               | A connection between two nodes, representing data flow or execution order                      |
| **Port**               | An input or output connection point on a node                                                  |
| **Wave**               | A group of nodes with no interdependencies that can execute in parallel                        |
| **Run**                | A single execution of a workflow against a provider                                            |
| **RunStep**            | The execution record for a single node within a run                                            |
| **Provider**           | An LLM service (Anthropic, OpenAI, Google, Ollama)                                             |
| **BYOK**               | Bring Your Own Key -- user supplies their own API key                                          |
| **Microdollar**        | 1/1,000,000 of a USD; used for precise cost tracking                                           |
| **Gate**               | A node that pauses execution until a condition is met or approval is given                     |
| **Template**           | A `{{...}}` expression in node body/config that resolves to a value at execution time          |
| **bun:sqlite**         | Bun's built-in SQLite API; used for MVP persistence                                            |
| **SpacetimeDB**        | A real-time database with built-in subscriptions; deferred to Phase 2+                         |
| **WorkflowRepository** | Abstraction layer over persistence enabling backend swapability                                |

---

## Appendix C: Cross-Review Debate Outcomes

The 6-agent grooming session included a cross-review phase where each agent critiqued the others' proposals. This appendix records the debate outcomes and concessions.

### Positions by Tension

| Tension | Product | UX | Architect | Frontend | Backend | QA | Final |
|---------|---------|----|-----------|---------|---------|----|-------|
| 1. Route | `/canvas/[id]` | Evolve `/pipeline` | `/canvas/[id]` | `/pipeline` | `/canvas/[id]` | `/pipeline/[id]` | **`/canvas/[id]`** |
| 2. Execution | Server-side (Phase 2) | Server-side day 1 | Server-side day 1 | Server-side day 1 | Server-side (changed) | Server-side day 1 | **Server-side day 1** |
| 3. Cycles | DAG-only | DAG-only | DAG-only (conceded) | DAG-only | DAG-only | DAG-only | **DAG-only** |
| 4. Persistence | Filesystem JSON | SQLite | SQLite (conceded) | bun:sqlite | SpacetimeDB w/ repo | Filesystem JSON | **bun:sqlite** |
| 5. Cost unit | Microdollars | Microdollars | Microdollars (conceded) | Microdollars | Microdollars | Microdollars | **Microdollars (u64)** |
| 6. Node types | 4 | 5 | 5 (reduced from 17) | 4 | 5 | 4 | **5** |

### Notable Concessions

1. **Architect conceded on SpacetimeDB**: Changed from "trust it for persistence" to "SQLite for MVP" after debate revealed SpacetimeDB was previously removed from the codebase.
2. **Architect conceded on loops**: Changed from "Phase 1 loop nodes" to "DAG-only for MVP, loops Phase 2" after reviewing the existing executor's hard DAG dependency.
3. **Architect conceded on cost unit**: Changed from `cost_cents: f64` to `cost_microdollars: u64` after Backend's floating-point arithmetic argument.
4. **Architect reduced port types**: 10 -> 6 for MVP (`string`, `number`, `boolean`, `object`, `array`, `any`).
5. **Architect reduced node types**: 17 -> 5 for MVP after Product and QA pushback on scope.
6. **Backend changed execution position**: From "client-side for MVP" to "server-side via API route proxy" after acknowledging CORS is a hard blocker.

### Unresolved Disagreements (Noted for Future Reference)

1. **Route naming**: UX/Frontend/QA prefer evolving `/pipeline` over creating a new route. Concern: duplicate codepaths. Mitigated by component extraction.
2. **Execution in Phase 1**: Product says no execution in Phase 1 (authoring only). Backend/Frontend/UX say execution IS the value proposition. Recommend: include basic execution in Phase 1 if timeline permits, otherwise Phase 2.
3. **XState ownership**: Frontend claims ownership of the execution state machine definition. Backend may need to consume it server-side. Needs coordination.
4. **Undo/redo scope**: Architect raised whether undo covers canvas layout only or also node config edits. Unresolved -- needs specification.
5. **WorkflowDefinition vs WorkflowLayout separation**: Architect proposed separating node positions (ephemeral) from graph topology (versioned). Good idea, needs design.

### Key Insights from Debate

1. **"80% built" is infrastructure, not feature**: The pipeline page has canvas infrastructure (React Flow, nodes, edges, toolbar) but lacks user-authored persistence, execution, and the new data model. The delta is larger than initially framed.
2. **SpacetimeDB was deliberately removed**: Phases 02 and todos 75/76/78 stripped SpacetimeDB from the framework. Re-introducing it requires strong justification.
3. **CORS kills client-side execution**: This is a hard blocker, not a risk. Anthropic and OpenAI APIs do not allow browser-origin requests.
4. **Node components are cheap, inspector panels are expensive**: Each new node type takes ~30 min (NodeCard pattern). Each inspector panel variant takes 2-4 hours. Inspector panels are the bottleneck.
5. **React.memo is missing**: Current node components are NOT memoized. Adding `React.memo` is a 15-minute fix that raises the performance ceiling from ~50 to ~200 nodes.
