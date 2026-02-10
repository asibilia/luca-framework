/**
 * TypeScript interfaces for Luca Framework skills
 */

// Import Zod schemas
export type { SkillFrontmatterSchema, SkillSectionSchema, SkillConfigSchema } from './skill.schemas';

export interface SkillFrontmatter {
  name: string;
  description: string;
  'disable-model-invocation'?: boolean;
  [key: string]: unknown;
}

export interface SkillSection {
  title: string;
  content: string;
  order?: number;
}

export interface SkillConfig {
  frontmatter: SkillFrontmatter;
  sections: SkillSection[];
}

export interface BaseSkill {
  readonly config: SkillConfig;
  readonly name: string;
  readonly description: string;

  toCursorFormat(): string;
  toClaudeFormat(): string;
}