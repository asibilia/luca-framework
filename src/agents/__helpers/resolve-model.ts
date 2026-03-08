/**
 * Model resolution for per-agent routing.
 *
 * Resolves the effective model for an agent given its purpose category
 * and the current complexity level. The MODEL_ROUTING_TABLE is the
 * single source of truth for complexity-to-model mapping.
 *
 * Priority chain (resolveModel):
 * 1. Routing table lookup via resolveModelForAgent (primary, authoritative)
 * 2. Agent's purpose mapped via ROLE_MODEL_DEFAULTS (role default)
 * 3. Complexity gate's default_model (system-level default)
 * 4. "sonnet" (universal fallback)
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
import { resolveModelForAgent } from "~/complexity";
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
 * 1. Routing table lookup via resolveModelForAgent (primary, authoritative)
 * 2. Agent's purpose mapped via ROLE_MODEL_DEFAULTS (role default)
 * 3. Complexity gate's default_model (system-level default)
 * 4. "sonnet" (universal fallback)
 *
 * @param agentFrontmatter - The agent's frontmatter configuration
 * @param complexityLevel - Current task complexity level (e.g., "MODERATE")
 * @param complexityGate - The complexity gate for the current level
 * @param agentName - Optional agent name for routing table lookup
 * @returns The resolved model identifier
 *
 * @example
 * ```typescript
 * // lu-executor at CRITICAL: routing table resolves to opus
 * resolveModel(
 *   { purpose: "executor" },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "lu-executor"
 * ) // Returns "opus" (from routing table: ORCHESTRATOR preset -> capable -> opus)
 *
 * // Unknown agent falls back to role default or gate default
 * resolveModel(
 *   { purpose: "researcher" },
 *   "MODERATE",
 *   { default_model: "sonnet" },
 * ) // Returns role default for "researcher", or "sonnet" gate default
 * ```
 */
export function resolveModel(
  agentFrontmatter: Pick<AgentFrontmatter, "purpose">,
  complexityLevel: string,
  complexityGate: Pick<ComplexityGate, "default_model">,
  agentName?: string,
): ModelId {
  // 1. Routing table lookup (primary, authoritative source of truth)
  if (agentName) {
    const routingTier = resolveModelForAgent(
      agentName,
      complexityLevel as ComplexityLevel,
    );
    return MODEL_TIER_TO_MODEL[routingTier];
  }

  // 2. Agent purpose -> role-based default
  if (agentFrontmatter.purpose) {
    const roleModel =
      ROLE_MODEL_DEFAULTS[agentFrontmatter.purpose as RolePurpose];
    if (roleModel) {
      return roleModel;
    }
  }

  // 3. Complexity gate default
  if (complexityGate.default_model) {
    return complexityGate.default_model;
  }

  // 4. Universal fallback
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
 *   { purpose: "executor" },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "peak",
 *   "lu-executor"
 * ) // Returns "opus"
 *
 * // In stop zone: downgraded to haiku
 * resolveModelWithZone(
 *   { purpose: "executor" },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "stop",
 *   "lu-executor"
 * ) // Returns "haiku"
 * ```
 */
export function resolveModelWithZone(
  agentFrontmatter: Pick<AgentFrontmatter, "purpose">,
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
 *   { purpose: "executor" },
 *   "CRITICAL",
 *   { default_model: "sonnet" },
 *   "degrading",
 *   "lu-executor"
 * );
 * // decision.model === "sonnet" (zone downgrade from opus)
 * // decision.source === "zone_adjustment"
 * // decision.originalModel === "opus"
 * // decision.zone === "degrading"
 * ```
 */
export function resolveModelWithDecision(
  agentFrontmatter: Pick<AgentFrontmatter, "purpose">,
  complexityLevel: string,
  complexityGate: Pick<ComplexityGate, "default_model">,
  zone?: QualityZone,
  agentName?: string,
): ModelRoutingDecision {
  // Determine base decision through priority chain
  let model: ModelId;
  let reason: string;
  let source: ModelRoutingDecision["source"];

  if (agentName) {
    // 1. Routing table lookup (primary, authoritative source of truth)
    const routingTier = resolveModelForAgent(
      agentName,
      complexityLevel as ComplexityLevel,
    );
    model = MODEL_TIER_TO_MODEL[routingTier];
    reason = `Routing table for "${agentName}" at ${complexityLevel}: tier "${routingTier}" maps to ${model}`;
    source = "routing_table";
  } else if (agentFrontmatter.purpose) {
    // 2. Agent purpose -> role-based default
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
    // 3. Complexity gate default
    model = complexityGate.default_model;
    reason = `Gate default: ${model}`;
    source = "gate_default";
  } else {
    // 4. Universal fallback
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
