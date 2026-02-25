/**
 * TypeScript interfaces for Luca Framework agents
 */
import type { ContextConfig } from "../../context/types";
import type { CognitionConfigSchemaType } from "./agent.schemas";

// Re-export Zod schema inferred types
export type {
  AgentFrontmatterSchema,
  AgentSectionSchema,
  AgentConfigSchema,
  CognitionTierSchema,
  CognitionConfigSchemaType,
} from "./agent.schemas";

// Re-export Zod-inferred cognition types under their original names for backward compatibility
export type { CognitionTierSchema as CognitionTier } from "./agent.schemas";
export type { CognitionConfigSchemaType as CognitionConfig } from "./agent.schemas";

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  color?: string;
  /** Optional per-agent cognition configuration. When absent, agent defaults to T0. */
  cognition?: CognitionConfigSchemaType;
  /** Optional per-agent context configuration. When absent, agent defaults to T0. */
  context?: ContextConfig;
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
