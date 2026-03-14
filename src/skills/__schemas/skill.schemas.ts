/**
 * Zod schemas for Luca Framework skill types
 */
import { z } from "zod";
import { SectionSchema, type Section } from "~/shared/__helpers/format";

export const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  "disable-model-invocation": z.boolean().optional(),
});

/** Skill section schema — references the canonical SectionSchema from shared/format */
export const SkillSectionSchema = SectionSchema;

/**
 * Schema for a single skill eval case.
 *
 * Each eval defines a prompt to send, the expected outcome,
 * and criteria for grading the response.
 */
export const SkillEvalSchema = z.object({
  prompt: z.string(),
  expected: z.string(),
  criteria: z.array(z.string()),
});

export const SkillConfigSchema = z.object({
  frontmatter: SkillFrontmatterSchema,
  sections: z.array(SectionSchema),
  evals: z.array(SkillEvalSchema).optional(),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
/** Skill section type — alias for the canonical Section type for discoverability */
export type SkillSection = Section;
export type SkillEval = z.infer<typeof SkillEvalSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;

/** Behavior contract for a skill instance (functional, not class-based) */
export type BaseSkill = {
  readonly config: SkillConfig;
  readonly name: string;
  readonly description: string;
  toClaudeFormat(): string;
};
