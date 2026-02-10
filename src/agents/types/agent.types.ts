/**
 * TypeScript interfaces for Luca Framework agents
 */

// Import Zod schemas
export type { AgentFrontmatterSchema, AgentSectionSchema, AgentConfigSchema } from './agent.schemas';

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  color?: string;
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