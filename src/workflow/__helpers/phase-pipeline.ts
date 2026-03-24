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
