/**
 * Zod schemas for Luca Framework agent types
 */
import { z } from "zod";
import { contextConfigSchema } from "../../context/types";

/** Valid cognition tier values (T0=stateless, T1=recall, T2=contextual, T3=fully-cognitive) */
export const cognitionTierSchema = z.enum(["T0", "T1", "T2", "T3"]);

/** Per-agent cognition configuration */
export const cognitionConfigSchema = z.object({
  /** Default cognition tier for this agent */
  default_tier: cognitionTierSchema.default("T0"),
  /** Maximum tier this agent can be promoted to by complexity gating */
  promotable_to: cognitionTierSchema.default("T0"),
  /** Domain tags for selective MEMORY.md recall filtering */
  memory_tags: z.array(z.string()).default([]),
});

export const agentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
  /** Optional per-agent cognition configuration. When absent, agent defaults to T0. */
  cognition: cognitionConfigSchema.optional(),
  /** Optional per-agent context configuration. When absent, agent defaults to T0. */
  context: contextConfigSchema.optional(),
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
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type CognitionTierSchema = z.infer<typeof cognitionTierSchema>;
export type CognitionConfigSchemaType = z.infer<typeof cognitionConfigSchema>;
export type AgentFrontmatterSchema = z.infer<typeof agentFrontmatterSchema>;
export type AgentSectionSchema = z.infer<typeof agentSectionSchema>;
export type AgentConfigSchema = z.infer<typeof agentConfigSchema>;
