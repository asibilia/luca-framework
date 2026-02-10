/**
 * Base class for all agents in the Luca Framework
 */
import { BaseAgent, AgentConfig } from '../types/agent.types';
import { formatFrontmatter } from '../../shared/utils';
import { agentConfigSchema } from '../types/agent.schemas';

export abstract class BaseAgentImpl implements BaseAgent {
  protected readonly _config: AgentConfig;

  constructor(config: AgentConfig) {
    // Validate config with Zod schema
    const validatedConfig = agentConfigSchema.parse(config);
    this._config = validatedConfig;
  }

  get config(): AgentConfig {
    return this._config;
  }

  get name(): string {
    return this._config.frontmatter.name;
  }

  get description(): string {
    return this._config.frontmatter.description;
  }

  /**
   * Converts the agent to Cursor-compatible format (Markdown with frontmatter)
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
   * Converts the agent to Claude-compatible format
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

    return `# ${this.name}\n\n${this.description}\n\n${sections}`;
  }
}