/**
 * Zod schemas for Luca Framework agent types
 */
import { z } from "zod";
import { contextConfigSchema } from "../../context/types";
import { SectionSchema, type Section } from "../../shared/format";

/** Valid cognition tier values (T0=stateless, T1=recall, T2=contextual, T3=fully-cognitive) */
export const CognitionTierSchema = z.enum(["T0", "T1", "T2", "T3"]);

/** Per-agent cognition configuration */
export const CognitionConfigSchema = z.object({
  /** Default cognition tier for this agent */
  default_tier: CognitionTierSchema.default("T0"),
  /** Maximum tier this agent can be promoted to by complexity gating */
  promotable_to: CognitionTierSchema.default("T0"),
  /** Domain tags for selective MEMORY.md recall filtering */
  memory_tags: z.array(z.string()).default([]),
});

export const AgentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
  /** Optional per-agent cognition configuration. When absent, agent defaults to T0. */
  cognition: CognitionConfigSchema.optional(),
  /** Optional per-agent context configuration. When absent, agent defaults to T0. */
  context: contextConfigSchema.optional(),
});

/** Agent section schema — references the canonical SectionSchema from shared/format */
export const AgentSectionSchema = SectionSchema;

export const AgentConfigSchema = z.object({
  frontmatter: AgentFrontmatterSchema,
  sections: z.array(SectionSchema),
});

// Note: We don't include function validations in Zod schemas as they're not serializable
// Function validations should be handled at the factory level

// Type inference from Zod schemas
export type CognitionTier = z.infer<typeof CognitionTierSchema>;
export type CognitionConfig = z.infer<typeof CognitionConfigSchema>;
export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;
/** Agent section type — alias for the canonical Section type for discoverability */
export type AgentSection = Section;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Behavior contract for an agent instance (functional, not class-based) */
export type BaseAgent = {
  readonly config: AgentConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
};
