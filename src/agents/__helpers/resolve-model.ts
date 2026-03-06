/**
 * Model resolution for per-agent routing.
 *
 * Resolves the effective model for an agent given its model routing
 * configuration, model tier, purpose category, and the current
 * complexity level. The complexity matrix provides system-level
 * defaults; agent config can override.
 *
 * Priority chain (resolveModel):
 * 1. Agent's complexity_overrides[level] (most specific)
 * 2. Agent's model_routing.default_model (agent preference)
 * 3. Agent's model_tier mapped to ModelId (tier default)
 * 3.5. Routing table lookup via resolveModelForAgent (centralized table)
 * 4. Agent's purpose mapped via ROLE_MODEL_DEFAULTS (role default)
 * 5. Complexity gate's default_model (system-level default)
 * 6. "sonnet" (universal fallback)
 *
 * Zone-aware routing (resolveModelWithZone):
 * - After resolving the base model, applies ZONE_MODEL_ADJUSTMENTS
 *   to downgrade the model in degrading/stop quality zones.
 *
 * Decision logging (resolveModelWithDecision):
 * - Returns a ModelRoutingDecision with the resolved model and the
 *   reason it was selected, enabling observability and debugging.
 */
import type { AgentFrontmatter } from "~/agents/__schemas/agent.schemas";
import {
  MODEL_TIER_TO_MODEL,
  ROLE_MODEL_DEFAULTS,
  ZONE_MODEL_ADJUSTMENTS,
  type ComplexityGate,
  type ComplexityLevel,
  type ModelId,
  type RolePurpose,
} from "~/complexity/__schemas/complexity.schemas";
import { resolveModelForAgent } from "~/complexity/__helpers/model-routing";
import type { QualityZone } from "~/planner/__schemas/planner.schemas";

/**
 * A structured record of how a model was resolved.
 *
 * Enables observability, debugging, and audit logging for model
 * routing decisions.
 */
export interface ModelRoutingDecision {
  /** The resolved model identifier */
  model: ModelId;
  /** Human-readable reason explaining which priority level was used */
  reason: string;
  /** Which step in the priority chain produced the result */
  source:
    | "complexity_override"
    | "agent_default"
    | "model_tier"
    | "routing_table"
    | "role_default"
    | "gate_default"
    | "universal_fallback"
    | "zone_adjustment";
  /** If zone adjustment was applied, the original pre-adjustment model */
  originalModel?: ModelId;
  /** If zone adjustment was applied, the zone that triggered it */
  zone?: QualityZone;
}

/**
 * Resolves the effective model for an agent at a given complexity level.
 *
 * Priority chain:
 * 1. Agent's complexity_overrides[level] (most specific)
 * 2. Agent's model_routing.default_model (agent preference)
 * 3. Agent's model_tier mapped to ModelId (tier default)
 * 3.5. Routing table lookup via resolveModelForAgent (centralized table)
 * 4. Agent's purpose mapped via ROLE_MODEL_DEFAULTS (role default)
 * 5. Complexity gate's default_model (system-level default)
 * 6. "sonnet" (universal fallback)
 *
 * @param agentFrontmatter - The agent's frontmatter configuration
 * @param complexityLevel - Current task complexity level (e.g., "MODERATE")
 * @param complexityGate - The complexity gate for the current level
 * @param agentName - Optional agent name for routing table lookup (step 3.5)
 * @returns The resolved model identifier
 *
 * @example
 * ```typescript
 * // lu-executor at CRITICAL: agent override wins
 * resolveModel(
 *   { model_routing: { default_model: "sonnet", complexity_overrides: { CRITICAL: "opus" } } },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "lu-executor"
 * ) // Returns "opus"
 *
 * // Agent in routing table with no frontmatter overrides: table wins
 * resolveModel(
 *   {},
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "lu-executor"
 * ) // Returns "opus" (from routing table: capable -> opus)
 * ```
 */
export function resolveModel(
  agentFrontmatter: Pick<
    AgentFrontmatter,
    "model_routing" | "model_tier" | "purpose"
  >,
  complexityLevel: string,
  complexityGate: Pick<ComplexityGate, "default_model">,
  agentName?: string,
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

  // 3. Agent model tier -> mapped to ModelId
  if (agentFrontmatter.model_tier) {
    return MODEL_TIER_TO_MODEL[agentFrontmatter.model_tier];
  }

  // 3.5. Routing table lookup (centralized model routing table)
  if (agentName) {
    const routingTier = resolveModelForAgent(
      agentName,
      complexityLevel as ComplexityLevel,
    );
    return MODEL_TIER_TO_MODEL[routingTier];
  }

  // 4. Agent purpose -> role-based default
  if (agentFrontmatter.purpose) {
    const roleModel =
      ROLE_MODEL_DEFAULTS[agentFrontmatter.purpose as RolePurpose];
    if (roleModel) {
      return roleModel;
    }
  }

  // 5. Complexity gate default
  if (complexityGate.default_model) {
    return complexityGate.default_model;
  }

  // 6. Universal fallback
  return "sonnet";
}

/**
 * Resolves the effective model with quality zone adjustment.
 *
 * First resolves the base model using the standard priority chain,
 * then applies zone-based adjustments from ZONE_MODEL_ADJUSTMENTS.
 * In degrading/stop zones, the model may be downgraded to conserve
 * context budget.
 *
 * @param agentFrontmatter - The agent's frontmatter configuration
 * @param complexityLevel - Current task complexity level
 * @param complexityGate - The complexity gate for the current level
 * @param zone - Current quality zone from context monitor
 * @param agentName - Optional agent name for routing table lookup
 * @returns The resolved model identifier (possibly zone-adjusted)
 *
 * @example
 * ```typescript
 * // In peak zone: no adjustment, returns opus
 * resolveModelWithZone(
 *   { model_tier: "capable" },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "peak"
 * ) // Returns "opus"
 *
 * // In stop zone: downgraded to haiku
 * resolveModelWithZone(
 *   { model_tier: "capable" },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "stop"
 * ) // Returns "haiku"
 * ```
 */
export function resolveModelWithZone(
  agentFrontmatter: Pick<
    AgentFrontmatter,
    "model_routing" | "model_tier" | "purpose"
  >,
  complexityLevel: string,
  complexityGate: Pick<ComplexityGate, "default_model">,
  zone: QualityZone,
  agentName?: string,
): ModelId {
  const baseModel = resolveModel(
    agentFrontmatter,
    complexityLevel,
    complexityGate,
    agentName,
  );

  const adjustment = ZONE_MODEL_ADJUSTMENTS[zone];
  if (adjustment !== null && adjustment !== undefined) {
    return adjustment;
  }

  return baseModel;
}

/**
 * Resolves the effective model and returns a decision record.
 *
 * Provides full observability into the routing decision, including
 * which priority level was used, the reason, and any zone adjustment.
 * Useful for debugging, audit logging, and cost tracking.
 *
 * @param agentFrontmatter - The agent's frontmatter configuration
 * @param complexityLevel - Current task complexity level
 * @param complexityGate - The complexity gate for the current level
 * @param zone - Optional quality zone for zone-aware adjustment
 * @param agentName - Optional agent name for routing table lookup
 * @returns A ModelRoutingDecision with model, reason, and source
 *
 * @example
 * ```typescript
 * const decision = resolveModelWithDecision(
 *   { purpose: "researcher" },
 *   "MODERATE",
 *   { default_model: "sonnet" },
 *   "degrading"
 * );
 * // decision.model === "sonnet" (zone downgrade from opus)
 * // decision.source === "zone_adjustment"
 * // decision.originalModel === "opus"
 * // decision.zone === "degrading"
 * ```
 */
export function resolveModelWithDecision(
  agentFrontmatter: Pick<
    AgentFrontmatter,
    "model_routing" | "model_tier" | "purpose"
  >,
  complexityLevel: string,
  complexityGate: Pick<ComplexityGate, "default_model">,
  zone?: QualityZone,
  agentName?: string,
): ModelRoutingDecision {
  // Determine base decision through priority chain
  const overrides = agentFrontmatter.model_routing?.complexity_overrides;
  let model: ModelId;
  let reason: string;
  let source: ModelRoutingDecision["source"];

  if (overrides && complexityLevel in overrides) {
    model = overrides[complexityLevel] as ModelId;
    reason = `Complexity override for ${complexityLevel}: ${model}`;
    source = "complexity_override";
  } else if (agentFrontmatter.model_routing?.default_model) {
    model = agentFrontmatter.model_routing.default_model;
    reason = `Agent default model: ${model}`;
    source = "agent_default";
  } else if (agentFrontmatter.model_tier) {
    model = MODEL_TIER_TO_MODEL[agentFrontmatter.model_tier];
    reason = `Model tier "${agentFrontmatter.model_tier}" maps to ${model}`;
    source = "model_tier";
  } else if (agentName) {
    // 3.5. Routing table lookup
    const routingTier = resolveModelForAgent(
      agentName,
      complexityLevel as ComplexityLevel,
    );
    model = MODEL_TIER_TO_MODEL[routingTier];
    reason = `Routing table for "${agentName}" at ${complexityLevel}: tier "${routingTier}" maps to ${model}`;
    source = "routing_table";
  } else if (agentFrontmatter.purpose) {
    const roleModel =
      ROLE_MODEL_DEFAULTS[agentFrontmatter.purpose as RolePurpose];
    if (roleModel) {
      model = roleModel;
      reason = `Role default for "${agentFrontmatter.purpose}": ${model}`;
      source = "role_default";
    } else {
      model = complexityGate.default_model ?? "sonnet";
      reason = complexityGate.default_model
        ? `Gate default: ${model}`
        : `Universal fallback: ${model}`;
      source = complexityGate.default_model
        ? "gate_default"
        : "universal_fallback";
    }
  } else if (complexityGate.default_model) {
    model = complexityGate.default_model;
    reason = `Gate default: ${model}`;
    source = "gate_default";
  } else {
    model = "sonnet";
    reason = `Universal fallback: ${model}`;
    source = "universal_fallback";
  }

  // Apply zone adjustment if provided
  if (zone) {
    const adjustment = ZONE_MODEL_ADJUSTMENTS[zone];
    if (adjustment !== null && adjustment !== undefined) {
      const originalModel = model;
      return {
        model: adjustment,
        reason: `Zone "${zone}" adjustment: ${originalModel} -> ${adjustment}`,
        source: "zone_adjustment",
        originalModel,
        zone,
      };
    }
  }

  return { model, reason, source };
}
