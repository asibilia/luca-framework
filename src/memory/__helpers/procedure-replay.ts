import { z } from "zod";
import orderBy from "lodash/orderBy";

import type {
  ProcedureEntry,
  ProcedureStep,
} from "../__schemas/memory.schemas";
import {
  computeTagOverlap,
  computeTriggerSimilarity,
} from "./procedure-recall";

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * Input validation schema for procedure replay context.
 *
 * Validates the new execution context passed to replayProcedure() and
 * adaptProcedureToContext(). All fields optional with sensible defaults.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ProcedureReplayContextSchema = z.object({
  /** Current task description for relevance matching */
  task_description: z.string().default(""),
  /** Tags describing the current task context */
  task_tags: z.array(z.string()).default([]),
  /** File paths relevant to the current task */
  relevant_files: z.array(z.string()).default([]),
  /** Any context overrides for step adaptation */
  overrides: z.record(z.string(), z.string()).default({}),
});

/** Validated replay context. */
export type ProcedureReplayContext = z.infer<
  typeof ProcedureReplayContextSchema
>;

/**
 * Result of a procedure replay operation.
 *
 * Contains the adapted steps, the original procedure id, and
 * metadata about the replay.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ProcedureReplayResultSchema = z.object({
  /** Original procedure ID */
  procedure_id: z.string(),
  /** Original procedure title */
  procedure_title: z.string(),
  /** Adapted steps ready for execution */
  adapted_steps: z.array(
    z.object({
      /** Step number (1-indexed) */
      order: z.number().int().positive(),
      /** Adapted action description */
      action: z.string(),
      /** Expected output (carried from original or adapted) */
      expected_output: z.string().optional(),
      /** Tool or agent to use */
      tool: z.string().optional(),
    }),
  ),
  /** Whether the procedure was adapted for the new context */
  was_adapted: z.boolean(),
  /** Relevance score of this procedure to the current task (0-1) */
  relevance_score: z.number().min(0).max(1),
});

/** Result of a procedure replay. */
export type ProcedureReplayResult = z.infer<typeof ProcedureReplayResultSchema>;

// ─── Minimum Replay Threshold ───────────────────────────────────────────────

/**
 * Minimum relevance score for a procedure to be considered replayable.
 * Procedures below this threshold are filtered out by findReplayableProcedures.
 */
const MIN_REPLAY_SCORE = 0.15;

// ─── Find Replayable Procedures ─────────────────────────────────────────────

/**
 * Find procedures that are replayable for a given task description.
 *
 * Scores each active procedure against the task description using keyword
 * overlap (Jaccard similarity on content-bearing tokens) and tag overlap.
 * Returns procedures meeting the minimum relevance threshold, sorted by
 * descending score.
 *
 * @param taskDescription - Description of the current task
 * @param procedures - All available procedure entries
 * @param limit - Maximum number of procedures to return (default: 5)
 * @returns Active procedures matching the task, sorted by relevance
 *
 * @example
 * ```typescript
 * const replayable = findReplayableProcedures(
 *   "Add REST API endpoint for user profiles",
 *   allProcedures,
 * );
 * ```
 */
export function findReplayableProcedures(
  taskDescription: string,
  procedures: ProcedureEntry[],
  limit: number = 5,
): Array<{ entry: ProcedureEntry; score: number }> {
  const active = procedures.filter((p) => p.status === "active");

  const scored = active.map((entry) => {
    const triggerScore = computeTriggerSimilarity(
      entry.trigger,
      taskDescription,
    );
    const tagScore = computeTagOverlap(
      entry.tags,
      taskDescription
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 0),
    );
    const successBonus = entry.success_rate * 0.2;
    const score = triggerScore * 0.5 + tagScore * 0.3 + successBonus;

    return { entry, score };
  });

  const filtered = scored.filter((s) => s.score >= MIN_REPLAY_SCORE);

  return orderBy(filtered, ["score"], ["desc"]).slice(0, limit);
}

// ─── Adapt Procedure to Context ─────────────────────────────────────────────

/**
 * Adapt a procedure's steps to a new execution context.
 *
 * Applies context overrides to step action text via simple placeholder
 * replacement. Overrides are key-value pairs where the key is a placeholder
 * token (e.g., "MODULE_NAME") and the value is the replacement text.
 *
 * Returns new step objects; does NOT mutate the input procedure.
 *
 * @param procedure - Procedure entry to adapt
 * @param context - New execution context with overrides
 * @returns Adapted steps with overrides applied
 *
 * @example
 * ```typescript
 * const adapted = adaptProcedureToContext(procedure, {
 *   task_description: "Add user endpoint",
 *   task_tags: ["api"],
 *   relevant_files: ["src/routes/users.ts"],
 *   overrides: { MODULE_NAME: "users", ENDPOINT: "/api/users" },
 * });
 * ```
 */
export function adaptProcedureToContext(
  procedure: ProcedureEntry,
  context: ProcedureReplayContext,
): ProcedureStep[] {
  const parseResult = ProcedureReplayContextSchema.safeParse(context);
  const validContext = parseResult.success
    ? parseResult.data
    : ProcedureReplayContextSchema.parse({});

  const overrideEntries = Object.entries(validContext.overrides);

  return procedure.steps.map((step) => {
    let adaptedAction = step.action;

    for (const [placeholder, replacement] of overrideEntries) {
      adaptedAction = adaptedAction.replaceAll(`{${placeholder}}`, replacement);
    }

    // Append relevant file context if step mentions files and we have file paths
    if (
      validContext.relevant_files.length > 0 &&
      /\b(file|path|module|component)\b/i.test(adaptedAction)
    ) {
      adaptedAction += ` (relevant: ${validContext.relevant_files.join(", ")})`;
    }

    return {
      ...step,
      action: adaptedAction,
    };
  });
}

// ─── Replay Procedure ───────────────────────────────────────────────────────

/**
 * Replay a stored procedure in a new context.
 *
 * Validates the context, adapts the procedure's steps via override
 * replacement and file context injection, computes a relevance score,
 * and returns a structured replay result.
 *
 * Does NOT mutate the input procedure.
 *
 * @param procedure - Procedure entry to replay
 * @param context - New execution context
 * @returns Structured replay result with adapted steps and relevance score
 *
 * @example
 * ```typescript
 * const result = replayProcedure(procedure, {
 *   task_description: "Add user management API",
 *   task_tags: ["api", "users"],
 *   relevant_files: ["src/routes/users.ts"],
 *   overrides: { MODULE_NAME: "users" },
 * });
 * if (result.relevance_score > 0.3) {
 *   // Execute adapted steps
 * }
 * ```
 */
export function replayProcedure(
  procedure: ProcedureEntry,
  context: ProcedureReplayContext,
): ProcedureReplayResult {
  const parseResult = ProcedureReplayContextSchema.safeParse(context);
  const validContext = parseResult.success
    ? parseResult.data
    : ProcedureReplayContextSchema.parse({});

  const adaptedSteps = adaptProcedureToContext(procedure, validContext);

  const triggerScore = computeTriggerSimilarity(
    procedure.trigger,
    validContext.task_description,
  );
  const tagScore = computeTagOverlap(procedure.tags, validContext.task_tags);
  const relevanceScore =
    Math.round(
      (triggerScore * 0.5 + tagScore * 0.3 + procedure.success_rate * 0.2) *
        100,
    ) / 100;

  const wasAdapted =
    Object.keys(validContext.overrides).length > 0 ||
    validContext.relevant_files.length > 0;

  return {
    procedure_id: procedure.id,
    procedure_title: procedure.title,
    adapted_steps: adaptedSteps,
    was_adapted: wasAdapted,
    relevance_score: relevanceScore,
  };
}
