---
title: "Runtime A10: Define the reference phase pipeline DAG"
area: workflow
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: [A02, A03, A04]
phase: runtime-a
estimated_files: 2
---

## Context

Create the canonical Luca phase pipeline as a DAG definition using the builder API. This is the reference implementation: the 7-step sequential pipeline (classify -> discuss -> plan -> execute -> verify -> learn -> commit) that the Phase B Claude adapter will compile to prose. Each step is wired with its handler, input/output contract schemas, guard conditions, and metadata category. This file serves as both the source of truth for the workflow and a validation that the builder, schemas, and contracts work together correctly.

## Task

### Files to Create

#### `src/workflow/__helpers/phase-pipeline.ts`

````typescript
/**
 * Reference DAG definition for the Luca phase pipeline.
 *
 * This is the canonical workflow: classify -> discuss -> plan -> execute
 * -> verify -> learn -> commit. It is the source of truth that the
 * Phase B Claude adapter compiles to prose.
 *
 * Each step is wired with:
 * - handler: maps to the skill/agent that executes this step
 * - dependsOn: sequential dependency chain
 * - inputSchema/outputSchema: typed contracts from contracts.schemas.ts
 * - guard: conditional execution (e.g., plan only if no existing plan)
 * - metadata.category: for visualization color-coding
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Builder example
 * @see docs/runtime-architecture/dag-workflow-engine.md — How This Replaces lu.skill.ts
 */

import { buildPhaseDAG } from "./dag-builder.ts";

import {
  ClassifyOutputSchema,
  DiscussOutputSchema,
  PlanOutputSchema,
  ExecuteOutputSchema,
  VerifyOutputSchema,
  LearnOutputSchema,
  CommitOutputSchema,
} from "../__schemas/contracts.schemas.ts";

import type { WorkflowDAG } from "../__schemas/workflow.schemas.ts";

// ─── Phase Pipeline ──────────────────────────────────────────────────────────

/**
 * The canonical Luca phase pipeline DAG.
 *
 * Pipeline flow:
 * ```
 * classify -> discuss -> plan -> execute -> verify -> learn -> commit
 * ```
 *
 * This is a deeply frozen, immutable WorkflowDAG object.
 * It is validated at construction time via WorkflowDAGSchema.safeParse().
 *
 * @example
 * ```typescript
 * import { PHASE_PIPELINE } from "~/workflow";
 * import { validateDAG, toMermaid } from "~/workflow";
 *
 * const validation = validateDAG(PHASE_PIPELINE);
 * console.log("Valid:", validation.valid);
 *
 * const diagram = toMermaid(PHASE_PIPELINE);
 * console.log(diagram);
 * ```
 */
export const PHASE_PIPELINE: Readonly<WorkflowDAG> = buildPhaseDAG(
  "phase-pipeline",
)
  .version("1.0.0")
  .step("classify", {
    name: "Classify",
    handler: "lu-router",
    outputSchema: ClassifyOutputSchema,
    metadata: {
      description: "Route task to appropriate complexity level and model tier",
      category: "classify",
    },
  })
  .step("discuss", {
    name: "Discuss",
    handler: "phase-discuss",
    dependsOn: ["classify"],
    inputSchema: ClassifyOutputSchema,
    outputSchema: DiscussOutputSchema,
    metadata: {
      description:
        "Assemble context, determine appetite, run optional premortem",
      category: "discuss",
    },
  })
  .step("plan", {
    name: "Plan",
    handler: "phase-plan",
    dependsOn: ["discuss"],
    inputSchema: DiscussOutputSchema,
    outputSchema: PlanOutputSchema,
    guard: (ctx: Record<string, unknown>) => {
      // Only plan if no existing plan count in context
      // When plan already exists, skip to execute
      const planCount = ctx.planCount;
      return planCount === undefined || planCount === 0;
    },
    metadata: {
      description: "Discover tasks and group into execution waves",
      category: "plan",
    },
  })
  .step("execute", {
    name: "Execute",
    handler: "phase-execute",
    dependsOn: ["plan"],
    inputSchema: PlanOutputSchema,
    outputSchema: ExecuteOutputSchema,
    metadata: {
      description: "Execute plan waves, run harness verification",
      category: "execute",
    },
  })
  .step("verify", {
    name: "Verify",
    handler: "lu-verifier",
    dependsOn: ["execute"],
    inputSchema: ExecuteOutputSchema,
    outputSchema: VerifyOutputSchema,
    metadata: {
      description: "Verify execution meets plan requirements, identify gaps",
      category: "verify",
    },
  })
  .step("learn", {
    name: "Learn",
    handler: "lu-learner",
    dependsOn: ["verify"],
    inputSchema: VerifyOutputSchema,
    outputSchema: LearnOutputSchema,
    metadata: {
      description: "Capture patterns, pitfalls, and decisions to MuninnDB",
      category: "learn",
    },
  })
  .step("commit", {
    name: "Commit",
    handler: "git-commit",
    dependsOn: ["learn"],
    inputSchema: LearnOutputSchema,
    outputSchema: CommitOutputSchema,
    metadata: {
      description: "Create final git commit with changes",
      category: "commit",
    },
  })
  .build();
````

### Files to Modify

#### `src/workflow/index.ts`

Replace the `// Added by A10` placeholder comment under `Phase Pipeline` with actual exports:

```typescript
// ─── Phase Pipeline ──────────────────────────────────────────────────────────

export { PHASE_PIPELINE } from "./__helpers/phase-pipeline.ts";
```

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `PHASE_PIPELINE` is a valid `WorkflowDAG` (construction via `.build()` succeeds without throwing)
- [ ] `PHASE_PIPELINE.name` is `"phase-pipeline"`
- [ ] `PHASE_PIPELINE.version` is `"1.0.0"`
- [ ] `PHASE_PIPELINE.steps.length` is `7`
- [ ] Step IDs are: `classify`, `discuss`, `plan`, `execute`, `verify`, `learn`, `commit`
- [ ] Dependency chain is linear: each step depends on exactly the previous step
- [ ] The `plan` step has a guard function defined
- [ ] All steps have `metadata.category` set
- [ ] `PHASE_PIPELINE` is deeply frozen (Object.isFrozen returns true)
- [ ] `validateDAG(PHASE_PIPELINE)` returns `{ valid: true, errors: [], warnings: [] }` (modulo schema compatibility warnings which are acceptable)
- [ ] `toMermaid(PHASE_PIPELINE)` produces valid Mermaid syntax with 7 nodes and 6 edges
- [ ] Barrel index only contains re-export statements

## Notes

- Depends on: A02 (WorkflowDAG type), A03 (contract schemas), A04 (buildPhaseDAG builder)
- Does NOT depend on A05-A09 for construction, but A05/A06/A09 are needed for the validation/visualization verification checks listed above
- The guard on the `plan` step checks `ctx.planCount` — this mirrors the current lu.skill.ts behavior where planning is skipped if a plan already exists
- All contract schemas are wired as both inputSchema (for the receiving step) and outputSchema (for the producing step), creating a typed data flow chain
- The `PHASE_PIPELINE` constant is exported (not the function that builds it) because the pipeline definition is static. Dynamic DAG construction for custom workflows is a Phase B concern.
