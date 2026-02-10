/**
 * Zod schemas for Luca Framework agent types
 */
import { z } from 'zod';

export const agentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
});

export const agentSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().optional(),
});

export const agentConfigSchema = z.object({
  frontmatter: agentFrontmatterSchema,
  sections: z.array(agentSectionSchema),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the class level

// Type inference from Zod schemas
export type AgentFrontmatterSchema = z.infer<typeof agentFrontmatterSchema>;
export type AgentSectionSchema = z.infer<typeof agentSectionSchema>;
export type AgentConfigSchema = z.infer<typeof agentConfigSchema>;