/**
 * Zod schemas for Luca Framework rule types
 */
import { z } from "zod";

export const ruleFrontmatterSchema = z.object({
  description: z.string(),
  globs: z.array(z.string()).optional(),
  alwaysApply: z.boolean().optional(),
});

export const ruleSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().optional(),
});

export const ruleConfigSchema = z.object({
  frontmatter: ruleFrontmatterSchema,
  sections: z.array(ruleSectionSchema),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type RuleFrontmatterSchema = z.infer<typeof ruleFrontmatterSchema>;
export type RuleSectionSchema = z.infer<typeof ruleSectionSchema>;
export type RuleConfigSchema = z.infer<typeof ruleConfigSchema>;
