/**
 * Agent health check utilities.
 *
 * Validates that an AgentConfig has all required fields populated,
 * cognition tier is appropriate, and memory tags are configured.
 * Returns a structured result with any discovered issues.
 */
import isEmpty from "lodash/isEmpty";

import type { AgentConfig } from "../__schemas/agent.schemas";

/**
 * Agents that should use memory (T1+) based on their roles.
 * These agents benefit from recalling patterns, decisions, and pitfalls.
 */
const AGENTS_EXPECTING_MEMORY = new Set([
  "lu-debugger",
  "lu-test-writer",
  "lu-roadmap-architect",
  "lu-roadmap-prioritizer",
  "lu-roadmap-qa",
  "lu-roadmap-synthesizer",
  "code-architect",
  "code-developer",
  "code-simplifier",
  "dx-advocate",
  "security-auditor",
  "performance-auditor",
]);

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
  /** List of non-blocking warnings */
  warnings: string[];
}

/**
 * Check the health of a single agent configuration.
 *
 * Validates that the agent has:
 * - Required fields (name, description, sections)
 * - Appropriate cognition tier for its role
 * - Memory tags configured when using T1+ tiers
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
  const warnings: string[] = [];
  const name = config.frontmatter?.name || "unknown";

  // Required field checks
  if (isEmpty(config.frontmatter?.name)) {
    issues.push("Missing required field: frontmatter.name");
  }

  if (isEmpty(config.frontmatter?.description)) {
    issues.push("Missing required field: frontmatter.description");
  }

  if (!config.sections || config.sections.length === 0) {
    issues.push("Agent has no sections defined");
  }

  // Cognition tier checks
  const tier = config.frontmatter?.cognition?.default_tier ?? "T0";
  const memoryTags = config.frontmatter?.cognition?.memory_tags ?? [];

  if (AGENTS_EXPECTING_MEMORY.has(name) && tier === "T0") {
    warnings.push(
      `Agent "${name}" is T0 (stateless) but would benefit from memory (T1+)`,
    );
  }

  if (tier !== "T0" && memoryTags.length === 0) {
    warnings.push(
      `Agent "${name}" is ${tier} but has no memory_tags configured`,
    );
  }

  return {
    agent_name: name,
    healthy: issues.length === 0,
    issues,
    warnings,
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
 * const warned = results.filter(r => r.warnings.length > 0);
 * ```
 */
export function checkAllAgentsHealth(
  configs: AgentConfig[],
): HealthCheckResult[] {
  return configs.map(checkAgentHealth);
}

/**
 * Check the health of a named agent from the registry.
 *
 * @param agentName - Name of the agent to check
 * @param registry - Map of agent name to config
 * @returns HealthCheckResult, or a "not found" result if agent is missing
 */
export function checkNamedAgentHealth(
  agentName: string,
  registry: Map<string, AgentConfig>,
): HealthCheckResult {
  const config = registry.get(agentName);
  if (!config) {
    return {
      agent_name: agentName,
      healthy: false,
      issues: [`Agent "${agentName}" not found in registry`],
      warnings: [],
    };
  }
  return checkAgentHealth(config);
}
