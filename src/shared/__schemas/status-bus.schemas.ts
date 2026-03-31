import { z } from "zod";

/**
 * Schema for the lightweight status bus file (.planning/.statusline.json).
 *
 * Any skill or hook can write to this file to make its current state
 * visible in the statusline HUD. The statusline renderer reads this
 * file on every render cycle and prefers it over raw state.json when fresh.
 */
export const StatusBusSchema = z.object({
  /** Active skill/workflow name (e.g., "lu", "pr-address", "scout") */
  skill: z.string().default(""),
  /** High-level stage — must match DisplayStateEnum in statusline renderer */
  stage: z
    .enum(["EXECUTING", "PLANNING", "VERIFYING", "PAUSED", "FAILED", "idle"])
    .default("idle"),
  /** Sub-step within stage (e.g., "research", "discuss", "plan", "execute", "verify") */
  step: z.string().default(""),
  /** Phase number if applicable */
  phase: z.number().int().optional(),
  /** Current wave number (0-indexed) */
  wave_current: z.number().int().nonnegative().default(0),
  /** Total wave count */
  wave_total: z.number().int().nonnegative().default(0),
  /** Complexity level */
  complexity: z.string().default(""),
  /** Free-form detail string */
  detail: z.string().default(""),
  /** ISO 8601 timestamp of last update */
  updated_at: z.string().default(""),
});

export type StatusBus = z.infer<typeof StatusBusSchema>;
export type StatusBusInput = z.input<typeof StatusBusSchema>;
