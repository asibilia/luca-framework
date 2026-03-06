/**
 * Agent health check utilities.
 *
 * Validates that an AgentConfig has all required fields populated
 * and returns a structured result with any discovered issues.
 */
import isEmpty from "lodash/isEmpty";

import type { AgentConfig } from "../__schemas/agent.schemas";

/**
 * Result of a single agent health check.
 *
 * Uses snake_case for data schema compatibility.
 */
export interface HealthCheckResult {
  /** Name of the agent that was checked */
  agent_name: string;
  /** Whether the agent passed all health checks */
  healthy: boolean;
  /** List of issues found (empty when healthy) */
  issues: string[];
}

/**
 * Check the health of a single agent configuration.
 *
 * Validates that the agent has all required fields:
 * - frontmatter.name (non-empty)
 * - frontmatter.description (non-empty)
 * - At least one section defined
 *
 * @param config - The agent configuration to validate
 * @returns A HealthCheckResult describing the agent's health
 *
 * @example
 * ```typescript
 * const result = checkAgentHealth(myAgentConfig);
 * if (!result.healthy) {
 *   console.warn(`Agent ${result.agent_name} has issues:`, result.issues);
 * }
 * ```
 */
export function checkAgentHealth(config: AgentConfig): HealthCheckResult {
  const issues: string[] = [];
  const name = config.frontmatter?.name || "unknown";

  if (isEmpty(config.frontmatter?.name)) {
    issues.push("Missing required field: frontmatter.name");
  }

  if (isEmpty(config.frontmatter?.description)) {
    issues.push("Missing required field: frontmatter.description");
  }

  if (!config.sections || config.sections.length === 0) {
    issues.push("Agent has no sections defined");
  }

  return {
    agent_name: name,
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Check the health of multiple agent configurations.
 *
 * @param configs - Array of agent configurations to validate
 * @returns Array of HealthCheckResult, one per agent
 *
 * @example
 * ```typescript
 * const results = checkAllAgentsHealth(agentConfigs);
 * const unhealthy = results.filter(r => !r.healthy);
 * ```
 */
export function checkAllAgentsHealth(
  configs: AgentConfig[],
): HealthCheckResult[] {
  return configs.map(checkAgentHealth);
}
