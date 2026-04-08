# DAG Workflow Engine Design

**Date:** 2026-03-23
**Status:** Proposed
**Parent:** [Architectural Vision](./architectural-vision.md)

## Overview

Replace the prose-based orchestrator (`lu.skill.ts`) with a typed DAG (Directed Acyclic Graph) workflow engine. The DAG definition is the source of truth; the prose orchestrator prompt becomes a compilation output.

## Problem Statement

The current `lu.skill.ts` is a 1,597-line skill definition where workflow steps are encoded as natural language prose across 13 ordered sections. This means:

- **No static analysis** — cannot detect missing dependencies or unreachable steps at build time
- **No replay** — cannot re-run from a specific step with the same inputs
- **No visualization** — cannot generate workflow diagrams from the definition
- **No type safety** — output of one step is not validated against input of the next
- **Error discovery is late** — malformed flags or missing files discovered 30+ minutes into autonomous runs
- **LLM interpretation variance** — the same prose may be interpreted differently across sessions

## Design

### Domain Structure

```
src/workflow/
├── __schemas/
│   ├── workflow.schemas.ts    # WorkflowStep, WorkflowDAG, StepContract
│   └── contracts.schemas.ts   # Per-step input/output Zod schemas
├── __helpers/
│   ├── dag-builder.ts         # Fluent API for constructing DAGs
│   ├── dag-validator.ts       # Static analysis (cycles, missing deps, schema compat)
│   ├── dag-executor.ts        # Execute steps through an adapter
│   ├── dag-visualizer.ts      # Generate Mermaid/DOT diagrams
│   └── dag-serializer.ts      # Serialize/deserialize DAG state for resume
└── index.ts                   # Barrel exports
```

### Core Schemas

```typescript
// workflow.schemas.ts

import { z } from "zod";

/**
 * A single step in a workflow DAG.
 */
export const WorkflowStepSchema = z.object({
  /** Unique step identifier */
  id: z.string(),

  /** Human-readable name */
  name: z.string(),

  /** Handler key — maps to a registered step handler */
  handler: z.string(),

  /** IDs of steps that must complete before this step can start */
  dependsOn: z.array(z.string()).default([]),

  /** Input schema (Zod) — validated before step executes */
  inputSchema: z.any().optional(),

  /** Output schema (Zod) — validated after step completes */
  outputSchema: z.any().optional(),

  /** Guard condition — if returns false, step is skipped */
  guard: z.function().args(z.any()).returns(z.boolean()).optional(),

  /** Retry configuration */
  retry: z
    .object({
      max: z.number().default(1),
      backoff: z.enum(["none", "linear", "exponential"]).default("none"),
    })
    .optional(),

  /** Timeout in milliseconds */
  timeout: z.number().optional(),

  /** Metadata for visualization and debugging */
  metadata: z
    .object({
      description: z.string().optional(),
      category: z
        .enum([
          "classify",
          "discuss",
          "plan",
          "execute",
          "verify",
          "learn",
          "commit",
          "gate",
        ])
        .optional(),
      parallel: z.boolean().default(false),
    })
    .optional(),
});

/**
 * A complete workflow DAG.
 */
export const WorkflowDAGSchema = z.object({
  /** Workflow name */
  name: z.string(),

  /** Workflow version */
  version: z.string().default("1.0.0"),

  /** All steps in the workflow */
  steps: z.array(WorkflowStepSchema),

  /** Named parallel groups (fan-out/fan-in) */
  parallelGroups: z.record(z.array(z.string())).optional(),

  /** Global timeout for the entire workflow */
  timeout: z.number().optional(),
});
```

### Step Contracts

Each workflow step declares typed input/output schemas. The DAG validator checks schema compatibility at build time.

```typescript
// contracts.schemas.ts

import { z } from "zod";

/** Output of the classify step */
export const ClassifyOutputSchema = z.object({
  complexity: z.enum(["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"]),
  reasoning: z.string(),
  modelTier: z.enum(["fast", "balanced", "capable"]),
});

/** Output of the discuss step */
export const DiscussOutputSchema = z.object({
  contextPath: z.string(),
  appetite: z.object({
    level: z.enum(["Micro", "Small", "Medium", "Large", "XL"]),
    tokenCeiling: z.number(),
    contextPercent: z.number(),
  }),
  premortemPath: z.string().optional(),
});

/** Output of the plan step */
export const PlanOutputSchema = z.object({
  planPaths: z.array(z.string()),
  waveCount: z.number(),
  totalTasks: z.number(),
});

/** Output of the execute step */
export const ExecuteOutputSchema = z.object({
  summaryPaths: z.array(z.string()),
  commitHashes: z.array(z.string()),
  checksStatus: z.enum(["passed", "failed_after_fixes"]),
  remainingErrors: z.number(),
});

/** Output of the verify step */
export const VerifyOutputSchema = z.object({
  status: z.enum(["passed", "human_needed", "gaps_found"]),
  verificationPath: z.string(),
  score: z.string(),
  gaps: z
    .array(
      z.object({
        description: z.string(),
        sourcePlan: z.string().optional(),
      }),
    )
    .default([]),
});
```

### DAG Builder

Fluent API for constructing workflows:

```typescript
// dag-builder.ts

import { buildPhaseDAG } from "./dag-builder";

const phasePipeline = buildPhaseDAG("phase-pipeline")
  .step("classify", {
    handler: "lu-router",
    outputSchema: ClassifyOutputSchema,
    metadata: { category: "classify" },
  })
  .step("discuss", {
    handler: "phase-discuss",
    dependsOn: ["classify"],
    inputSchema: ClassifyOutputSchema,
    outputSchema: DiscussOutputSchema,
    metadata: { category: "discuss" },
  })
  .step("plan", {
    handler: "phase-plan",
    dependsOn: ["discuss"],
    inputSchema: DiscussOutputSchema,
    outputSchema: PlanOutputSchema,
    guard: (ctx) => ctx.planCount === 0,
    metadata: { category: "plan" },
  })
  .step("execute", {
    handler: "phase-execute",
    dependsOn: ["plan"],
    inputSchema: PlanOutputSchema,
    outputSchema: ExecuteOutputSchema,
    metadata: { category: "execute" },
  })
  .step("verify", {
    handler: "lu-verifier",
    dependsOn: ["execute"],
    inputSchema: ExecuteOutputSchema,
    outputSchema: VerifyOutputSchema,
    metadata: { category: "verify" },
  })
  .step("learn", {
    handler: "lu-learner",
    dependsOn: ["verify"],
    metadata: { category: "learn" },
  })
  .step("commit", {
    handler: "git-commit",
    dependsOn: ["learn"],
    metadata: { category: "commit" },
  })
  .build();
```

### DAG Validator

Static analysis at build time:

```typescript
// dag-validator.ts

/**
 * Validate a DAG definition before execution.
 *
 * Checks:
 * 1. No cycles (topological sort succeeds)
 * 2. All dependsOn references point to existing steps
 * 3. Output schema of step N is compatible with input schema of step N+1
 * 4. No orphaned steps (every step is reachable from at least one root)
 * 5. Parallel groups contain only steps with compatible dependency levels
 *
 * @returns ValidationResult with errors and warnings
 */
export function validateDAG(dag: WorkflowDAG): ValidationResult;
```

### DAG Executor

Executes a DAG through an adapter:

```typescript
// dag-executor.ts

/**
 * Execute a workflow DAG.
 *
 * The executor:
 * 1. Topologically sorts steps
 * 2. Groups independent steps for parallel execution
 * 3. For each step: validates input, calls adapter.executeStep(), validates output
 * 4. Handles retry/timeout per step configuration
 * 5. Uses Promise.allSettled (not Promise.all) for parallel steps — fail-isolated semantics
 * 6. Records execution trace for debugging/replay
 *
 * @param dag - The workflow definition
 * @param adapter - Execution adapter (Claude, API, etc.)
 * @param context - Initial execution context
 * @returns ExecutionResult with step outcomes and trace
 */
export function executeDAG(
  dag: WorkflowDAG,
  adapter: Adapter,
  context: ExecutionContext,
): Promise<ExecutionResult>;
```

### DAG Visualizer

Generate visual representations:

```typescript
// dag-visualizer.ts

/**
 * Generate a Mermaid diagram from a DAG definition.
 *
 * Nodes are color-coded by category:
 * - classify: blue
 * - discuss/plan: green
 * - execute: orange
 * - verify/learn: purple
 * - commit: gray
 *
 * Parallel groups are rendered as subgraphs.
 */
export function toMermaid(dag: WorkflowDAG): string;
```

## How This Replaces lu.skill.ts

Today, `lu.skill.ts` contains 13 sections of prose that Claude Code interprets as orchestration instructions. After this change:

1. The **DAG definition** (TypeScript, ~200 lines) is the source of truth
2. The **Claude adapter** compiles the DAG into the same prose format Claude Code expects
3. The **API adapter** executes the same DAG via direct LLM API calls
4. The DAG validator catches errors at build time, not at runtime
5. The DAG visualizer generates a Mermaid diagram for documentation

The prose in lu.skill.ts is now **generated output** — just like .claude/skills/lu/SKILL.md is generated from lu.skill.ts today. The compilation chain becomes:

```
DAG definition (TypeScript)
  → Claude adapter → lu.skill.ts prose → SKILL.md
  → API adapter → direct LLM execution
  → Mermaid adapter → workflow diagram
```

## Relationship to Existing Systems

| Existing System                                      | Relationship                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| State machine (`packages/luca-framework/src/state/`) | DAG executor uses the state machine for persistence. The state machine tracks which step the DAG is on. |
| Iteration system (`src/iteration/`)                  | Becomes the retry/convergence handler for execute and verify steps                                      |
| Complexity routing (`src/complexity/`)               | Feeds into DAG context — complexity level determines model tier per step                                |
| Checks (`src/checks/`)                               | Becomes a tool invoked by the execute step, not a standalone system                                     |
| Compiler pipeline (`src/compilers/`)                 | The Claude adapter replaces/absorbs the skill compiler for workflow definitions                         |

## Open Questions

1. **Granularity:** Should the DAG model individual plan tasks, or just the phase-level pipeline (classify → discuss → plan → execute → verify → learn → commit)?
2. **Oversight gates:** How are the oversight levels (full-auto, flagged, milestone, phase) expressed in the DAG? Guard conditions on steps? A separate gate step type?
3. **Swarm mode:** How does the parallel execution path (TeamCreate/SendMessage) map to DAG parallel groups? Is worktree isolation an adapter concern or a DAG concern?
4. **Migration path:** Can the DAG engine coexist with the prose orchestrator during transition, or is it a big-bang replacement?
