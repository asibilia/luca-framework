---
title: "Runtime B01: Adapter schemas — AdapterConfigSchema, Adapter type, StepResult, EmitResult"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [A01]
phase: runtime-b
estimated_files: 1
---

## Context

Phase B introduces the adapter domain (`src/adapters/`, T3 Build). Before any adapter can be implemented, the foundational schemas and types must exist. Phase A defines `WorkflowStep`, `StepResult`, and an abstract `Adapter` type stub in `src/workflow/__schemas/workflow.schemas.ts`. Phase B defines the **full** adapter interface with compilation and emission capabilities in its own domain.

The `Adapter` type in Phase A's `workflow.schemas.ts` is a minimal stub with only `name` and `executeStep`. The full `Adapter` type defined here extends that concept with `compileAgent`, `compileSkill`, `compileRule`, `emit`, and `detect` methods. The Phase B `Adapter` type lives in `src/adapters/__schemas/adapter.schemas.ts` — this is the canonical, full-featured adapter interface that all concrete adapters implement.

## Task

Create the file `src/adapters/__schemas/adapter.schemas.ts` with the following exact contents.

### Directory Setup

Create the directory structure:

```
src/adapters/
  __schemas/
    adapter.schemas.ts
```

### Schemas to Define

**`AdapterSupportedFeaturesSchema`** — describes what an adapter supports:

```typescript
import { z } from "zod";

export const AdapterSupportedFeaturesSchema = z.object({
  /** Whether this adapter compiles agent definitions */
  agents: z.boolean().default(true),
  /** Whether this adapter compiles skill definitions */
  skills: z.boolean().default(true),
  /** Whether this adapter compiles rule definitions */
  rules: z.boolean().default(true),
  /** Whether this adapter supports lifecycle hooks */
  hooks: z.boolean().default(false),
  /** Whether this adapter supports DAG workflow execution */
  workflows: z.boolean().default(false),
  /** Whether this adapter can run without an IDE (headless/CI) */
  headless: z.boolean().default(false),
});
```

**`AdapterConfigSchema`** — adapter identity and capabilities:

```typescript
export const AdapterConfigSchema = z.object({
  /** Unique adapter name used as registry key (e.g., "claude", "api", "cursor") */
  name: z.string().min(1),
  /** Human-readable description of the adapter */
  description: z.string(),
  /** Feature support flags */
  supportedFeatures: AdapterSupportedFeaturesSchema,
});
```

**`EmitResultSchema`** — result of writing artifacts to disk:

```typescript
export const EmitResultSchema = z.object({
  /** Number of files written to disk */
  filesWritten: z.number().int().nonnegative().default(0),
  /** Absolute paths of files written */
  filesPaths: z.array(z.string()).default([]),
  /** Warnings encountered during emission (non-fatal) */
  warnings: z.array(z.string()).default([]),
});
```

**`AdapterStepResultSchema`** — result of executing a single DAG step via an adapter. This is the adapter-specific step result (distinct from Phase A's generic `StepResult` which tracks timing and retries). The adapter returns this; the DAG executor wraps it into the full `StepResult`.

```typescript
export const AdapterStepResultSchema = z.object({
  /** Whether the step execution succeeded */
  success: z.boolean(),
  /** The step's output data (adapter-specific format) */
  output: z.unknown().optional(),
  /** Error message if success is false */
  error: z.string().optional(),
  /** Token usage for API-based adapters (null for IDE adapters) */
  tokenUsage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
});
```

### Types to Define

**`Adapter`** — the full adapter interface. Defined as a TypeScript type (not a Zod schema) because it contains function properties which are not serializable:

```typescript
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";

export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;
export type AdapterSupportedFeatures = z.infer<typeof AdapterSupportedFeaturesSchema>;
export type EmitResult = z.infer<typeof EmitResultSchema>;
export type AdapterStepResult = z.infer<typeof AdapterStepResultSchema>;

export type Adapter = {
  /** Adapter identity and capability flags */
  readonly config: AdapterConfig;

  /**
   * Compile an agent definition to the target format.
   *
   * IDE adapters return a markdown string.
   * API adapter returns a structured object for use as a system prompt.
   *
   * @param agent - The agent definition to compile
   * @returns Compiled output (string for IDE adapters, object for API adapter)
   */
  compileAgent: (agent: BaseAgent) => string | Record<string, unknown>;

  /**
   * Compile a skill definition to the target format.
   *
   * @param skill - The skill definition to compile
   * @returns Compiled output (string for IDE adapters, object for API adapter)
   */
  compileSkill: (skill: BaseSkill) => string | Record<string, unknown>;

  /**
   * Compile a rule definition to the target format.
   * Optional because not all adapters support individual rule files
   * (e.g., API adapter folds rules into agent system prompts).
   *
   * @param rule - The rule definition to compile
   * @returns Compiled output
   */
  compileRule?: (rule: BaseRule) => string | Record<string, unknown>;

  /**
   * Execute a single DAG workflow step in this environment.
   * Optional because IDE adapters compile but do not execute.
   *
   * @param step - The workflow step to execute (WorkflowStep from src/workflow/)
   * @param context - Accumulated execution context from prior steps
   * @returns The step execution result
   */
  executeStep?: (
    step: unknown,
    context: Record<string, unknown>,
  ) => Promise<AdapterStepResult>;

  /**
   * Write compiled artifacts to disk (e.g., .claude/ directory).
   *
   * @param outputDir - Root directory for output artifacts
   * @returns Summary of files written
   */
  emit: (outputDir: string) => Promise<EmitResult>;

  /**
   * Detect whether this adapter's target environment exists at the given project root.
   * Used by auto-detection in the adapter registry.
   *
   * @param projectRoot - Absolute path to the project root
   * @returns true if this adapter's environment is detected
   */
  detect: (projectRoot: string) => boolean;
};
```

### Import Notes

- Import `z` from `"zod"`
- Import `type { BaseAgent }` from `"~/agents/__schemas/agent.schemas"`
- Import `type { BaseSkill }` from `"~/skills/__schemas/skill.schemas"`
- Import `type { BaseRule }` from `"~/rules/__schemas/rule.schemas"`
- These are T3 importing T2 types, which is valid per tier rules (T3 can import T0-T2)

### Why `executeStep` Uses `unknown` for the Step Parameter

Phase A defines `WorkflowStep` in `src/workflow/` (T1). The adapters domain is T3 and can import T1, so a direct import is valid. However, to avoid a hard compile-time dependency on Phase A's exact schema shape during initial implementation, the `step` parameter is typed as `unknown`. Once Phase A is complete and the `WorkflowStep` type is stable, B09 (DAG-adapter integration) will narrow this to the concrete type.

### Exports

All schemas and types must be exported:

```typescript
export {
  AdapterSupportedFeaturesSchema,
  AdapterConfigSchema,
  EmitResultSchema,
  AdapterStepResultSchema,
};
export type {
  AdapterSupportedFeatures,
  AdapterConfig,
  EmitResult,
  AdapterStepResult,
  Adapter,
};
```

## Verification

```bash
bunx --bun tsc --noEmit
```

- File `src/adapters/__schemas/adapter.schemas.ts` exists and exports all listed schemas and types
- No TypeScript errors
- All Zod schemas have proper defaults defined in schemas (not in destructuring)
- No classes used
- File uses kebab-case naming

## Notes

- The `Adapter` type uses `unknown` for `executeStep`'s step parameter as a temporary measure. B09 will replace `unknown` with `WorkflowStep` from Phase A.
- The `AdapterStepResult` is intentionally separate from Phase A's `StepResult`. Phase A's `StepResult` adds timing, retry count, and status enum. The adapter only returns success/failure/output — the DAG executor wraps it.
