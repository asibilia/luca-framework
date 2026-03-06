/**
 * Zod schemas for skill dependency graph metadata.
 *
 * Defines the dependency relationships between skills including
 * ordering constraints, mutual exclusion, and parallel-safety flags.
 *
 * Uses snake_case for API schema compatibility.
 * T2-compliant: imports nothing above T0.
 */
import { z } from "zod";

/**
 * Dependency metadata for a single skill.
 *
 * Captures ordering, blocking, exclusion, and parallelism constraints
 * that the dependency graph uses for topological sorting and batching.
 */
export const SkillDependencySchema = z.object({
  /** The skill this entry describes */
  skill_name: z.string(),
  /** Skills that must run before this one */
  required_before: z.array(z.string()).default([]),
  /** Skills that block this one from running */
  blocked_by: z.array(z.string()).default([]),
  /** Skills that cannot run concurrently with this one */
  mutually_exclusive: z.array(z.string()).default([]),
  /** Whether this skill can run in parallel with others */
  parallel_safe: z.boolean().default(true),
});

export type SkillDependency = z.infer<typeof SkillDependencySchema>;

/**
 * A map of skill names to their dependency metadata.
 *
 * Used as the input to buildDependencyOrder, detectConflicts,
 * and groupParallelBatches.
 */
export const SkillDependencyMapSchema = z.record(
  z.string(),
  SkillDependencySchema,
);

export type SkillDependencyMap = z.infer<typeof SkillDependencyMapSchema>;
