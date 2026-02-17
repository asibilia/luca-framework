/**
 * Base class for all agents in the Luca Framework
 */
import type { BaseAgent, AgentConfig } from "../types/agent.types";
import { toCursorFormat, toClaudeFormat } from "../../shared/format";
import { agentConfigSchema } from "../types/agent.schemas";

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

  toCursorFormat(): string {
    return toCursorFormat(this._config.frontmatter, this._config.sections);
  }

  toClaudeFormat(): string {
    return toClaudeFormat(
      `# ${this.name}\n\n${this.description}`,
      this._config.sections,
    );
  }
}
