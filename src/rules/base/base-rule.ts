/**
 * Base class for all rules in the Luca Framework
 */
import { BaseRule, RuleConfig } from '../types/rule.types';
import { toCursorFormat, toClaudeFormat } from '../../shared/format';
import { ruleConfigSchema } from '../types/rule.schemas';

export abstract class BaseRuleImpl implements BaseRule {
  protected readonly _config: RuleConfig;

  constructor(config: RuleConfig) {
    // Validate config with Zod schema
    const validatedConfig = ruleConfigSchema.parse(config);
    this._config = validatedConfig;
  }

  get config(): RuleConfig {
    return this._config;
  }

  get name(): string {
    // Rules typically don't have a name in frontmatter, so we'll use the filename or description
    return this._config.frontmatter.description.substring(0, 30).replace(/\s+/g, '-') || 'rule';
  }

  get description(): string {
    return this._config.frontmatter.description;
  }

  toCursorFormat(): string {
    return toCursorFormat(this._config.frontmatter, this._config.sections);
  }

  toClaudeFormat(): string {
    return toClaudeFormat(`# ${this.description}`, this._config.sections);
  }
}