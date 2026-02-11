/**
 * TypeScript interfaces for Luca Framework agents
 */

// Re-export Zod schema inferred types
export type {
  AgentFrontmatterSchema,
  AgentSectionSchema,
  AgentConfigSchema,
  CognitionTierSchema,
  CognitionConfigSchemaType,
} from "./agent.schemas";

/** Cognition tier levels from stateless to fully-cognitive */
export type CognitionTier = "T0" | "T1" | "T2" | "T3";

/** Per-agent cognition configuration */
export interface CognitionConfig {
  default_tier: CognitionTier;
  promotable_to: CognitionTier;
  memory_tags: string[];
}

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  color?: string;
  /** Optional per-agent cognition configuration. When absent, agent defaults to T0. */
  cognition?: CognitionConfig;
  [key: string]: unknown;
}

export interface AgentSection {
  title: string;
  content: string;
  order?: number;
}

export interface AgentConfig {
  frontmatter: AgentFrontmatter;
  sections: AgentSection[];
}

export interface BaseAgent {
  readonly config: AgentConfig;
  readonly name: string;
  readonly description: string;

  toCursorFormat(): string;
  toClaudeFormat(): string;
}
