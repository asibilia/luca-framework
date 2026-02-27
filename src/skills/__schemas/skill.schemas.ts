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

export const SkillConfigSchema = z.object({
  frontmatter: SkillFrontmatterSchema,
  sections: z.array(SectionSchema),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
/** Skill section type — alias for the canonical Section type for discoverability */
export type SkillSection = Section;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;

/** Behavior contract for a skill instance (functional, not class-based) */
export type BaseSkill = {
  readonly config: SkillConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
  toPiFormat(): string;
};
