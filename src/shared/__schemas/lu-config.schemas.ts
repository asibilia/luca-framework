/**
 * Zod schemas for `.planning/config.json` sections.
 *
 * Aggregates config-related schemas and re-exports them for barrel consumption:
 * - `LuConfigSchema` — the `lu` orchestration section
 * - `WorkflowVersionSchema` — the `workflow.version` discriminator (v2)
 * - `ResearchConfigSchema` / `ResearchConfigRefinedSchema` — the `research` section (v2)
 *
 * @example
 * ```typescript
 * import { LuConfigSchema, WorkflowVersionSchema, ResearchConfigSchema } from "~/shared";
 *
 * const raw = JSON.parse(configFileContents);
 * const luConfig = LuConfigSchema.parse(raw.lu ?? raw.autopilot ?? {});
 * const version = WorkflowVersionSchema.parse(raw.workflow?.version);
 * const research = ResearchConfigSchema.parse(raw.research ?? {});
 * ```
 */
import { z } from "zod";

// ─── Re-exports: Workflow Version ────────────────────────────────────────────

export {
  WorkflowVersionSchema,
  type WorkflowVersion,
} from "./workflow-version.schemas";

// ─── Re-exports: Research Config ─────────────────────────────────────────────

export {
  ResearchConfigSchema,
  ResearchConfigRefinedSchema,
  type ResearchConfig,
} from "./research-config.schemas";

/**
 * Schema for the `lu` orchestration config section.
 *
 * Controls autonomous execution behavior: oversight level, session limits,
 * UAT gating, gap closure, milestone boundaries, and swarm parallelism.
 *
 * @remarks
 * - `oversight` controls human-in-the-loop gates during autonomous execution
 * - `skip_uat` (formerly `skip_uat_in_autopilot`) controls whether UAT is
 *   skipped in autonomous mode
 * - `swarm_enabled` and `max_parallel_phases` control parallel phase execution
 */
export const LuConfigSchema = z.object({
  /** Oversight level controlling human-in-the-loop gates */
  oversight: z
    .enum(["full-auto", "flagged", "milestone", "phase"])
    .default("milestone"),

  /** Maximum number of phases to execute in a single session */
  max_phases_per_session: z.number().default(10),

  /** Whether to auto-plan phases from the roadmap */
  auto_plan_phases: z.boolean().default(true),

  /** Whether to skip UAT in autonomous mode (renamed from skip_uat_in_autopilot) */
  skip_uat: z.boolean().default(true),

  /** Number of gap closure retries before parking a phase */
  gap_closure_retries: z.number().default(1),

  /** Whether to pause execution when a critical review finding is detected */
  pause_on_critical_review: z.boolean().default(true),

  /** Whether autonomous execution can cross milestone boundaries */
  cross_milestone: z.boolean().default(false),

  /** Whether to scan the backlog for unplanned work at session start */
  backlog_scan: z.boolean().default(true),

  /** Whether swarm (parallel) phase execution is enabled */
  swarm_enabled: z.boolean().default(true),

  /** Maximum number of phases to execute in parallel when swarm is enabled */
  max_parallel_phases: z.number().default(3),
});

/** Inferred TypeScript type for the lu config section */
export type LuConfig = z.infer<typeof LuConfigSchema>;
