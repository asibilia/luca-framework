/**
 * Zod schemas for Luca Framework skill types
 */
import { z } from "zod";

export const skillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  "disable-model-invocation": z.boolean().optional(),
});

export const skillSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().optional(),
});

export const skillConfigSchema = z.object({
  frontmatter: skillFrontmatterSchema,
  sections: z.array(skillSectionSchema),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type SkillFrontmatterSchema = z.infer<typeof skillFrontmatterSchema>;
export type SkillSectionSchema = z.infer<typeof skillSectionSchema>;
export type SkillConfigSchema = z.infer<typeof skillConfigSchema>;
