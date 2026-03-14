/**
 * Zod schemas for Luca Framework rule types
 */
import { z } from "zod";
import { SectionSchema, type Section } from "~/shared/__helpers/format";

export const RuleFrontmatterSchema = z.object({
  description: z.string(),
  globs: z.array(z.string()).optional(),
  alwaysApply: z.boolean().optional(),
});

/** Rule section schema — references the canonical SectionSchema from shared/format */
export const RuleSectionSchema = SectionSchema;

export const RuleConfigSchema = z.object({
  frontmatter: RuleFrontmatterSchema,
  sections: z.array(SectionSchema),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type RuleFrontmatter = z.infer<typeof RuleFrontmatterSchema>;
/** Rule section type — alias for the canonical Section type for discoverability */
export type RuleSection = Section;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;

/** Behavior contract for a rule instance (functional, not class-based) */
export type BaseRule = {
  readonly config: RuleConfig;
  readonly name: string;
  readonly description: string;
  toClaudeFormat(): string;
};
