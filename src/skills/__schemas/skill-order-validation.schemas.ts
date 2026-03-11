/**
 * Zod schema for skill order validation results.
 *
 * Defines the result shape produced by `validateSkillOrder()` in
 * `__helpers/validate-skill-order.ts`.
 *
 * Uses snake_case for API compatibility per project conventions.
 *
 * @module skills/__schemas/skill-order-validation.schemas
 */
import { z } from "zod";

/**
 * Result schema for skill order validation.
 *
 * Uses snake_case for API compatibility per project conventions.
 */
export const SkillOrderValidationResultSchema = z.object({
  /** Whether the proposed order is valid */
  is_valid: z.boolean(),
  /** The proposed order that was validated */
  proposed_order: z.array(z.string()),
  /** The correct topological order (may differ from proposed) */
  valid_order: z.array(z.string()),
  /** Dependency violations found (empty if valid) */
  violations: z.array(z.string()).default([]),
  /** Mutual exclusion conflicts found (empty if none) */
  conflicts: z.array(z.string()).default([]),
});

export type SkillOrderValidationResult = z.infer<
  typeof SkillOrderValidationResultSchema
>;
