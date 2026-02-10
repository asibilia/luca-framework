/**
 * Base class for all skills in the Luca Framework
 */
import type { BaseSkill, SkillConfig } from '../types/skill.types';
import { toCursorFormat, toClaudeFormat } from '../../shared/format';
import { skillConfigSchema } from '../types/skill.schemas';

export abstract class BaseSkillImpl implements BaseSkill {
  protected readonly _config: SkillConfig;

  constructor(config: SkillConfig) {
    // Validate config with Zod schema
    const validatedConfig = skillConfigSchema.parse(config);
    this._config = validatedConfig;
  }

  get config(): SkillConfig {
    return this._config;
  }

  get name(): string {
    return this._config.frontmatter.name;
  }

  get description(): string {
    return this._config.frontmatter.description;
  }

  toCursorFormat(): string {
    return toCursorFormat(this._config.frontmatter, this._config.sections);
  }

  toClaudeFormat(): string {
    return toClaudeFormat(`# ${this.name}\n\n${this.description}`, this._config.sections);
  }
}