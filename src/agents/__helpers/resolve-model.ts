/**
 * Model resolution for per-agent routing.
 *
 * Resolves the effective model for an agent given its model routing
 * configuration and the current complexity level. The complexity
 * matrix provides system-level defaults; agent config can override.
 *
 * Priority chain:
 * 1. Agent's complexity_overrides[level] (most specific)
 * 2. Agent's model_routing.default_model (agent preference)
 * 3. Complexity gate's default_model (system-level default)
 * 4. "sonnet" (universal fallback)
 */
import type { AgentFrontmatter } from "~/agents/__schemas/agent.schemas";
import type {
  ComplexityGate,
  ModelId,
} from "~/complexity/__schemas/complexity.schemas";

/**
 * Resolves the effective model for an agent at a given complexity level.
 *
 * @param agentFrontmatter - The agent's frontmatter configuration
 * @param complexityLevel - Current task complexity level (e.g., "MODERATE")
 * @param complexityGate - The complexity gate for the current level
 * @returns The resolved model identifier
 *
 * @example
 * ```typescript
 * // lu-executor at CRITICAL: agent override wins
 * resolveModel(
 *   { model_routing: { default_model: "sonnet", complexity_overrides: { CRITICAL: "opus" } } },
 *   "CRITICAL",
 *   { default_model: "sonnet" }
 * ) // Returns "opus"
 *
 * // lu-cognition at MODERATE: agent default wins
 * resolveModel(
 *   { model_routing: { default_model: "haiku" } },
 *   "MODERATE",
 *   { default_model: "sonnet" }
 * ) // Returns "haiku"
 *
 * // Agent with no routing config: gate default wins
 * resolveModel({}, "MODERATE", { default_model: "sonnet" })
 * // Returns "sonnet"
 * ```
 */
export function resolveModel(
  agentFrontmatter: Pick<AgentFrontmatter, "model_routing">,
  complexityLevel: string,
  complexityGate: Pick<ComplexityGate, "default_model">,
): ModelId {
  // 1. Agent complexity override (most specific)
  const overrides = agentFrontmatter.model_routing?.complexity_overrides;
  if (overrides && complexityLevel in overrides) {
    return overrides[complexityLevel] as ModelId;
  }

  // 2. Agent default model
  if (agentFrontmatter.model_routing?.default_model) {
    return agentFrontmatter.model_routing.default_model;
  }

  // 3. Complexity gate default
  if (complexityGate.default_model) {
    return complexityGate.default_model;
  }

  // 4. Universal fallback
  return "sonnet";
}
