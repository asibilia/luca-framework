/**
 * Workflow version discriminator schema.
 *
 * Determines which pipeline variant the orchestrator executes:
 * - **"v1"**: Original linear pipeline (discuss -> plan -> execute -> verify).
 *   This is the default and preserves backward compatibility.
 * - **"v2"**: Extended pipeline with parallel research, review loops, and
 *   graduation (research-expand -> review -> graduate -> plan-review -> ...).
 *
 * The orchestrator (`lu.skill.ts`) reads `workflow.version` from config to
 * decide which pipeline to run. When the field is absent or undefined, the
 * schema defaults to "v1" so existing configs work without modification.
 *
 * @example
 * ```typescript
 * import { WorkflowVersionSchema } from "~/shared";
 *
 * const version = WorkflowVersionSchema.parse(undefined);
 * // => "v1" (default)
 *
 * const v2 = WorkflowVersionSchema.parse("v2");
 * // => "v2"
 * ```
 */
import { z } from "zod";

/**
 * Workflow version discriminator.
 *
 * Determines which pipeline variant runs:
 * - "v1": Original linear pipeline (discuss -> plan -> execute -> verify)
 * - "v2": Extended pipeline with parallel research, review loops, graduation
 *
 * Default: "v1" -- v2 is opt-in only.
 */
export const WorkflowVersionSchema = z.enum(["v1", "v2"]).default("v1");

/** Inferred TypeScript type for the workflow version discriminator. */
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;
