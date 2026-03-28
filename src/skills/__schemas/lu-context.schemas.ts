/**
 * Shared context file schema for the lu sub-skill chain.
 *
 * All sub-skills (lu-route, lu-configure, lu-backlog, lu-phase-loop)
 * read/write a single JSON file at `/tmp/lu-context.json`. Each sub-skill
 * reads the full context via `readLuContext()`, extends its section, and
 * writes back via `writeLuContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-skill treats as terminal failure).
 *
 * **Note:** `current_state` is written by the orchestrator to the context file
 * for hook consumption but is NOT part of the Zod schema (runtime-only field).
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 2
 */
import { z } from "zod";
import merge from "lodash/merge";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from lu-route sub-skill (Steps 0-3).
 *
 * Contains parsed request info, git context, cognition status,
 * complexity classification, and routing decision.
 */
export const LuRouteOutputSchema = z.object({
  request_parsed: z.boolean().default(false),
  git_context_loaded: z.boolean().default(false),
  cognition_ran: z.boolean().default(false),
  complexity_level: z.string().default("MODERATE"),
  routing_decision: z.string().default("phase-execute"),
});

export type LuRouteOutput = z.infer<typeof LuRouteOutputSchema>;

/**
 * Output from lu-configure sub-skill (Step 0 config).
 *
 * Contains configuration loading status, override application,
 * and pre-flight validation results.
 */
export const LuConfigureOutputSchema = z.object({
  config_loaded: z.boolean().default(false),
  overrides_applied: z.boolean().default(false),
  pre_flight_complete: z.boolean().default(false),
});

export type LuConfigureOutput = z.infer<typeof LuConfigureOutputSchema>;

/**
 * Output from lu-backlog sub-skill (backlog scan + roadmap revision).
 *
 * Contains todo scanning results, WSJF scoring status, and
 * roadmap revision outcome.
 */
export const LuBacklogOutputSchema = z.object({
  todos_scanned: z.boolean().default(false),
  wsjf_scored: z.boolean().default(false),
  backlog_revised: z.boolean().default(false),
  phases_added: z.number().default(0),
});

export type LuBacklogOutput = z.infer<typeof LuBacklogOutputSchema>;

/**
 * Output from lu-phase-loop sub-skill (phase loop + milestone gate + summary).
 *
 * Contains execution results, milestone gate status, and
 * summary generation status.
 */
export const LuPhaseLoopOutputSchema = z.object({
  phases_executed: z.number().default(0),
  milestone_gate_checked: z.boolean().default(false),
  summary_generated: z.boolean().default(false),
});

export type LuPhaseLoopOutput = z.infer<typeof LuPhaseLoopOutputSchema>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared lu context file.
 *
 * All sub-skill output sections are optional because they are populated
 * incrementally as each sub-skill completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const LuContextSchema = z.object({
  context_version: z.literal(1),
  lu_route: LuRouteOutputSchema.optional(),
  lu_configure: LuConfigureOutputSchema.optional(),
  lu_backlog: LuBacklogOutputSchema.optional(),
  lu_phase_loop: LuPhaseLoopOutputSchema.optional(),
});

export type LuContext = z.infer<typeof LuContextSchema>;

// ─── Context File Path ──────────────────────────────────────────────────────

/** Well-known path for the shared context file (session-ephemeral). */
export const LU_CONTEXT_PATH = "/tmp/lu-context.json";

// ─── Context File Helpers ───────────────────────────────────────────────────

/**
 * Read the lu context file and validate it via safeParse.
 *
 * Returns the safeParse result directly. Callers MUST check `.success`
 * and treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * @returns safeParse result with `success: true` and `data`, or `success: false` and `error`
 *
 * @example
 * ```typescript
 * const result = await readLuContext();
 * if (!result.success) {
 *   // ABORT: context file missing or malformed
 *   return;
 * }
 * const context = result.data;
 * ```
 */
export async function readLuContext(): Promise<
  { success: true; data: LuContext } | { success: false; error: z.ZodError }
> {
  try {
    const file = Bun.file(LU_CONTEXT_PATH);
    const exists = await file.exists();
    if (!exists) {
      // File does not exist — return a failed parse
      const result = LuContextSchema.safeParse({});
      // This will fail because context_version is missing
      return result as
        | { success: true; data: LuContext }
        | { success: false; error: z.ZodError };
    }
    const raw = await file.json();
    const result = LuContextSchema.safeParse(raw);
    return result as
      | { success: true; data: LuContext }
      | { success: false; error: z.ZodError };
  } catch {
    // JSON parse error or file read error — return failed parse
    const result = LuContextSchema.safeParse({});
    return result as
      | { success: true; data: LuContext }
      | { success: false; error: z.ZodError };
  }
}

/**
 * Write a partial update to the lu context file.
 *
 * Reads the current file (if it exists), deep-merges the patch via lodash
 * `merge`, and writes back. Creates the file with `context_version: 1`
 * if it does not yet exist.
 *
 * @param patch - Partial context to merge into the existing context
 *
 * @example
 * ```typescript
 * await writeLuContext({
 *   lu_route: {
 *     request_parsed: true,
 *     git_context_loaded: true,
 *     cognition_ran: false,
 *     complexity_level: "MODERATE",
 *     routing_decision: "phase-execute",
 *   },
 * });
 * ```
 */
export async function writeLuContext(
  patch: Partial<Omit<LuContext, "context_version">> & Record<string, unknown>,
): Promise<void> {
  let current: Record<string, unknown> = { context_version: 1 };

  try {
    const file = Bun.file(LU_CONTEXT_PATH);
    const exists = await file.exists();
    if (exists) {
      const raw = await file.json();
      if (raw && typeof raw === "object") {
        current = raw as Record<string, unknown>;
      }
    }
  } catch {
    // File doesn't exist or can't be read — start fresh
  }

  // Ensure context_version is always 1
  current.context_version = 1;

  // Deep merge the patch into current context
  const merged = merge({}, current, patch);

  await Bun.write(LU_CONTEXT_PATH, JSON.stringify(merged, null, 2));
}
