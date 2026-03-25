---
title: "Runtime D01: Package scaffolding for luca-studio"
area: tooling
created: 2026-03-24
source: docs/runtime-architecture/research/dev-studio.md
depends_on: []
phase: runtime-d
estimated_files: 5
---

## Context

Create the `packages/luca-studio/` package directory with all scaffolding files. This is the foundation that every other D-phase task builds on. The package is a private workspace member of the monorepo, following the same conventions as `packages/luca-framework/` and `packages/luca-observer/`.

## Task

### 1. Create directory structure

```bash
mkdir -p packages/luca-studio/src/data
mkdir -p packages/luca-studio/src/views/dag
mkdir -p packages/luca-studio/src/views/agents
mkdir -p packages/luca-studio/src/views/state
mkdir -p packages/luca-studio/src/views/evals
mkdir -p packages/luca-studio/src/watcher
mkdir -p packages/luca-studio/src/sse
mkdir -p packages/luca-studio/src/public
mkdir -p packages/luca-studio/src/__schemas
```

### 2. Create `packages/luca-studio/package.json`

```json
{
  "name": "@luca/studio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/server.ts",
    "start": "bun src/server.ts"
  },
  "dependencies": {
    "elkjs": "^0.9.3",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

### 3. Create `packages/luca-studio/tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "baseUrl": ".",
    "paths": {
      "~studio/*": ["./src/*"],
      "~/*": ["../../src/*"]
    }
  }
}
```

### 4. Create `packages/luca-studio/src/__schemas/studio.schemas.ts`

This file defines all Zod schemas for Studio API responses. Uses snake_case for API payloads per project convention.

```typescript
/**
 * Zod schemas for all Luca Studio API responses.
 *
 * All API-facing schemas use snake_case per project API conventions.
 * Internal TypeScript types are inferred via z.infer<>.
 *
 * @module studio-schemas
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Agent API schemas
// ---------------------------------------------------------------------------

/**
 * API Response: Single agent summary in the agent list.
 * Uses snake_case for API compatibility.
 */
export const AgentSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  group: z.string(),
  file_path: z.string(),
  has_compiled_output: z.boolean(),
});

export type AgentSummary = z.infer<typeof AgentSummarySchema>;

/**
 * API Response: Full agent detail with compiled output.
 * Uses snake_case for API compatibility.
 */
export const AgentDetailSchema = AgentSummarySchema.extend({
  source_content: z.string(),
  compiled_content: z.string().nullable(),
  model_routing: z.record(z.string()).nullable(),
  tool_strategy: z.string().nullable(),
  custom_sections: z.array(z.string()).default([]),
});

export type AgentDetail = z.infer<typeof AgentDetailSchema>;

// ---------------------------------------------------------------------------
// DAG API schemas
// ---------------------------------------------------------------------------

/**
 * API Response: A single node in the workflow DAG.
 * Uses snake_case for API compatibility.
 */
export const DagNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  is_active: z.boolean().default(false),
  is_final: z.boolean().default(false),
  node_type: z.enum(["state", "parallel", "history"]).default("state"),
});

export type DagNode = z.infer<typeof DagNodeSchema>;

/**
 * API Response: A single edge (transition) in the workflow DAG.
 * Uses snake_case for API compatibility.
 */
export const DagEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  event_name: z.string(),
  guard: z.string().nullable().default(null),
});

export type DagEdge = z.infer<typeof DagEdgeSchema>;

/**
 * API Response: Complete DAG graph data for the workflow visualization.
 * Uses snake_case for API compatibility.
 */
export const DagGraphSchema = z.object({
  nodes: z.array(DagNodeSchema),
  edges: z.array(DagEdgeSchema),
  current_state: z.string().nullable().default(null),
});

export type DagGraph = z.infer<typeof DagGraphSchema>;

// ---------------------------------------------------------------------------
// State machine API schemas
// ---------------------------------------------------------------------------

/**
 * API Response: Current state machine snapshot.
 * Uses snake_case for API compatibility.
 */
export const StateSnapshotSchema = z.object({
  current_state: z.string(),
  context: z.record(z.unknown()).default({}),
  event_log: z
    .array(
      z.object({
        timestamp: z.string(),
        event_type: z.string(),
        from_state: z.string().nullable(),
        to_state: z.string().nullable(),
        data_summary: z.string().default(""),
      }),
    )
    .default([]),
});

export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;

// ---------------------------------------------------------------------------
// Eval results API schemas
// ---------------------------------------------------------------------------

/**
 * API Response: A single harness check result.
 * Uses snake_case for API compatibility.
 */
export const EvalCheckResultSchema = z.object({
  check_type: z.enum(["test", "typecheck", "lint", "build"]),
  status: z.enum(["pass", "fail", "skip"]),
  duration_ms: z.number().default(0),
  error_count: z.number().default(0),
  errors: z
    .array(
      z.object({
        file_path: z.string().default(""),
        line: z.number().nullable().default(null),
        message: z.string(),
      }),
    )
    .default([]),
});

export type EvalCheckResult = z.infer<typeof EvalCheckResultSchema>;

/**
 * API Response: Complete eval results summary.
 * Uses snake_case for API compatibility.
 */
export const EvalResultsSummarySchema = z.object({
  total_checks: z.number().default(0),
  passed: z.number().default(0),
  failed: z.number().default(0),
  skipped: z.number().default(0),
  results: z.array(EvalCheckResultSchema).default([]),
  last_run_at: z.string().nullable().default(null),
});

export type EvalResultsSummary = z.infer<typeof EvalResultsSummarySchema>;

// ---------------------------------------------------------------------------
// SSE event schemas
// ---------------------------------------------------------------------------

/**
 * Internal schema: SSE event payload structure.
 */
export const SseEventSchema = z.object({
  type: z.enum(["reload", "state-change", "eval-complete"]),
  domain: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

export type SseEvent = z.infer<typeof SseEventSchema>;

// ---------------------------------------------------------------------------
// Server config schema
// ---------------------------------------------------------------------------

/**
 * Internal schema: Studio server configuration.
 */
export const StudioConfigSchema = z.object({
  port: z.number().int().positive().default(4040),
  open: z.boolean().default(true),
  watch: z.boolean().default(true),
});

export type StudioConfig = z.infer<typeof StudioConfigSchema>;
```

### 5. Install dependencies

```bash
cd packages/luca-studio && bun install
```

Then from monorepo root:

```bash
bun install
```

This links the workspace package and installs `elkjs`.

## Verification

```bash
# Directory structure exists
ls packages/luca-studio/package.json
ls packages/luca-studio/tsconfig.json
ls packages/luca-studio/src/__schemas/studio.schemas.ts

# TypeScript compiles
cd packages/luca-studio && bunx --bun tsc --noEmit

# elkjs is installed
ls node_modules/elkjs/lib/elk.bundled.js
```

## Notes

- The `DOM` lib is added to tsconfig because Studio serves HTML and the schemas include types that may reference DOM-like patterns.
- The `~/*` path alias points back to the monorepo `src/` so Studio can import agent/skill/rule schemas if needed.
- `elkjs` version `^0.9.3` is the latest stable as of 2026-03. It is ~1.3MB (GWT-compiled Java, NOT WASM). MIT licensed.
