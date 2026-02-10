/**
 * TypeScript interfaces for Luca Framework rules
 */

// Import Zod schemas
export type { RuleFrontmatterSchema, RuleSectionSchema, RuleConfigSchema, BaseRuleSchema } from './rule.schemas';

export interface RuleFrontmatter {
  description: string;
  globs?: string[];
  alwaysApply?: boolean;
  [key: string]: any;
}

export interface RuleSection {
  title: string;
  content: string;
  order?: number;
}

export interface RuleConfig {
  frontmatter: RuleFrontmatter;
  sections: RuleSection[];
}

export interface BaseRule {
  readonly config: RuleConfig;
  readonly name: string;
  readonly description: string;

  toCursorFormat(): string;
  toClaudeFormat(): string;
}