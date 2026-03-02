/**
 * Agent registry for the Luca Framework
 *
 * Pure barrel file — re-exports only. All logic lives in __helpers/.
 */

// Registry
export { agentRegistry } from "./__helpers/build-agent-registry";

// Factory function
export { createAgent } from "./__helpers/create-agent";

// Model resolution
export {
  resolveModel,
  resolveModelWithZone,
  resolveModelWithDecision,
} from "./__helpers/resolve-model";

export type { ModelRoutingDecision } from "./__helpers/resolve-model";

// Types
export type {
  BaseAgent,
  AgentConfig,
  AgentFrontmatter,
  AgentSection,
  ModelRoutingConfig,
} from "./__schemas/agent.schemas";
