/**
 * Base class for all rules in the Luca Framework
 */
import { BaseRule, RuleConfig } from '../types/rule.types';
import { formatFrontmatter } from '../../shared/utils';
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

  /**
   * Converts the rule to Cursor-compatible format (Markdown with frontmatter)
   */
  toCursorFormat(): string {
    const frontmatter = formatFrontmatter(this._config.frontmatter);
    const sections = this._config.sections
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(section => {
        if (section.title) {
          return `\n<${section.title.toLowerCase()}>\n${section.content}\n</${section.title.toLowerCase()}>\n`;
        }
        return section.content;
      })
      .join('');

    return `${frontmatter}\n\n${sections.trim()}`;
  }

  /**
   * Converts the rule to Claude-compatible format
   */
  toClaudeFormat(): string {
    // Claude format might be different - for now, using similar structure
    const sections = this._config.sections
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(section => {
        if (section.title) {
          return `## ${section.title}\n\n${section.content}\n\n`;
        }
        return `${section.content}\n\n`;
      })
      .join('')
      .trim();

    return `# ${this.description}\n\n${sections}`;
  }
}