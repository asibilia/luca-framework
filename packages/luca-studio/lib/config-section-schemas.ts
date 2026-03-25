/**
 * Zod schemas for individual sections of `.planning/config.json`.
 *
 * Four schemas are defined locally for Studio use (WorkflowSectionSchema,
 * GatesSectionSchema, ComplexitySectionSchema, PlannerSectionSchema).
 * Two schemas mirror their `src/` counterparts at the Zod version used by
 * luca-studio (v3) — HarnessSectionSchema and LuSectionSchema.
 *
 * These schemas validate the Studio-facing shape of each section as it
 * appears in config.json. They are the source of truth for PUT route
 * validation on the Studio side.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Workflow section
// ---------------------------------------------------------------------------

/**
 * Schema for the `workflow` config section.
 *
 * Controls which workflow steps are enabled (research, planning, verification,
 * code review, UAT, etc.) and tech stack profiles.
 */
export const WorkflowSectionSchema = z.object({
  research: z.boolean().default(true),
  plan_check: z.boolean().default(true),
  verifier: z.boolean().default(true),
  code_review: z.boolean().default(true),
  uat_required: z.boolean().default(true),
  always_verify: z.boolean().default(true),
  capture_learnings: z.boolean().default(true),
  opinionated_guidelines: z.boolean().default(true),
  tech_stack_profiles: z.array(z.string()).default(["typescript"]),
});

export type WorkflowSection = z.infer<typeof WorkflowSectionSchema>;

// ---------------------------------------------------------------------------
// Gates section
// ---------------------------------------------------------------------------

/**
 * Schema for the `gates` config section.
 *
 * A flat record mapping gate names to enabled/disabled booleans.
 * Safety-critical gates (confirm_project, confirm_phases) are enforced
 * by the semantic validator, not by the schema itself.
 */
export const GatesSectionSchema = z.record(z.string(), z.boolean());

export type GatesSection = z.infer<typeof GatesSectionSchema>;

// ---------------------------------------------------------------------------
// Harness section (mirrors src/harness/__schemas/ for Studio zod v3)
// ---------------------------------------------------------------------------

const CheckConfigSchema = z.object({
  name: z.string(),
  command: z
    .string()
    .max(256)
    .regex(
      /^[a-zA-Z0-9 _.\-/]+$/,
      "Command must contain only alphanumeric characters, spaces, dots, hyphens, underscores, and forward slashes",
    ),
  enabled: z.boolean(),
  timeout: z.number().positive(),
  parser: z.string(),
});

/**
 * Schema for the `harness` config section.
 *
 * Controls the verification harness: enabled state, check array,
 * iteration limits, and fail-fast behavior.
 *
 * NOTE: `maxFixIterations` and `failFast` use camelCase to match the
 * canonical schema in `src/harness/__schemas/harness.schemas.ts` and the
 * existing `config.json` shape. This is an intentional exception to the
 * project's snake_case API convention.
 */
export const HarnessSectionSchema = z.object({
  enabled: z.boolean(),
  checks: z.array(CheckConfigSchema),
  maxFixIterations: z.number().int().positive(),
  failFast: z.boolean(),
});

export type HarnessSection = z.infer<typeof HarnessSectionSchema>;

// ---------------------------------------------------------------------------
// Complexity section
// ---------------------------------------------------------------------------

/** Schema for a single complexity level's loop budgets. */
const ComplexityLevelSchema = z.object({
  cognitivePreflight: z.enum(["lite", "full"]),
  planVerificationIterations: z.number().int().positive(),
  harnessFixIterations: z.number().int().positive(),
  verifyFixIterations: z.number().int().positive(),
  verificationMode: z.enum(["quick", "standard", "full", "full+human"]),
  recallDepth: z.number().int().positive().nullable(),
});

/**
 * Schema for the `complexity` config section.
 *
 * Contains the default complexity level and the per-level matrix
 * controlling loop budgets and verification depth.
 */
export const ComplexitySectionSchema = z.object({
  defaultLevel: z.string().default("auto"),
  matrix: z.record(z.string(), ComplexityLevelSchema),
});

export type ComplexitySection = z.infer<typeof ComplexitySectionSchema>;

// ---------------------------------------------------------------------------
// Lu section (mirrors src/shared/__schemas/ for Studio zod v3)
// ---------------------------------------------------------------------------

/**
 * Schema for the `lu` orchestration config section.
 *
 * Controls autonomous execution behavior: oversight level, session limits,
 * UAT gating, gap closure, milestone boundaries, and backlog scanning.
 */
export const LuSectionSchema = z.object({
  oversight: z
    .enum(["full-auto", "flagged", "milestone", "phase"])
    .default("milestone"),
  max_phases_per_session: z.number().default(10),
  auto_plan_phases: z.boolean().default(true),
  skip_uat: z.boolean().default(true),
  gap_closure_retries: z.number().default(1),
  pause_on_critical_review: z.boolean().default(true),
  cross_milestone: z.boolean().default(false),
  backlog_scan: z.boolean().default(true),
});

export type LuSection = z.infer<typeof LuSectionSchema>;

// ---------------------------------------------------------------------------
// Planner section
// ---------------------------------------------------------------------------

/**
 * Schema for the `planner` config section.
 *
 * Controls session time budgets, weekly allocation percentages,
 * zone boundaries for the quality degradation curve, and cold-start
 * costs per complexity level.
 */
export const PlannerSectionSchema = z.object({
  session_cap_minutes: z.number().int().positive().default(180),
  weekly_allocation: z
    .object({
      needle_movers: z.number().min(0).max(100).default(60),
      quick_wins: z.number().min(0).max(100).default(25),
      maintenance: z.number().min(0).max(100).default(10),
      reserve: z.number().min(0).max(100).default(5),
    })
    .default({}),
  zone_boundaries: z
    .object({
      peak_end: z.number().min(0).max(100).default(30),
      good_end: z.number().min(0).max(100).default(50),
      degrading_end: z.number().min(0).max(100).default(70),
    })
    .default({}),
  cold_start_costs: z
    .record(z.string(), z.number().int().nonnegative())
    .default({}),
});

export type PlannerSection = z.infer<typeof PlannerSectionSchema>;

// ---------------------------------------------------------------------------
// Section registry (maps section key to its schema)
// ---------------------------------------------------------------------------

/** Union of all supported config section keys. */
export type ConfigSectionKey =
  | "workflow"
  | "gates"
  | "harness"
  | "complexity"
  | "lu"
  | "planner";

/** Map of section keys to their Zod schemas. */
export const CONFIG_SECTION_SCHEMAS: Record<ConfigSectionKey, z.ZodType> = {
  workflow: WorkflowSectionSchema,
  gates: GatesSectionSchema,
  harness: HarnessSectionSchema,
  complexity: ComplexitySectionSchema,
  lu: LuSectionSchema,
  planner: PlannerSectionSchema,
};
