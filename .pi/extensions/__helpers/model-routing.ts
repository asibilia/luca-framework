/**
 * Portable model resolver for Pi extensions.
 *
 * Ports the 5-step resolve chain from `src/agents/__helpers/resolve-model.ts`
 * into a self-contained helper that runs at Pi runtime. Reads agent frontmatter
 * model_tier + STATE.md complexity to resolve the effective model.
 *
 * Priority chain:
 * 1. Explicit model override (passed by caller)
 * 2. Agent frontmatter `model` field (pre-resolved by compiler)
 * 3. Agent frontmatter `model_tier` mapped to model name
 * 4. Complexity-level default model (from config.json matrix)
 * 5. Universal fallback: "gemini-3.1-pro-preview"
 *
 * Source: src/hooks/pi-extensions/__helpers/model-routing.ts
 * Deployed to: .pi/extensions/__helpers/model-routing.ts
 */
import { COMPLEXITY_LEVELS, MODEL_TIER_TO_MODEL } from "./luca-constants";
import type { ComplexityLevel, ModelId } from "./luca-constants";

import type { AgentFrontmatter } from "./frontmatter";
import { readComplexity as bridgeReadComplexity } from "./state-bridge";

/** Default model per complexity level (mirrors config.json matrix defaults). */
const COMPLEXITY_DEFAULT_MODEL: Record<ComplexityLevel, ModelId> = {
  TRIVIAL: "gemini-3-flash-preview",
  SIMPLE: "gemini-3-flash-preview",
  MODERATE: "gemini-3.1-pro-preview",
  COMPLEX: "gemini-3.1-pro-preview",
  CRITICAL: "gemini-3.1-pro-preview",
};

/**
 * Read current complexity level via the state bridge.
 *
 * Primary: reads from state.json context.complexity
 * Fallback: parses STATE.md Task Complexity field
 * Default: "MODERATE" if both sources unavailable
 *
 * @param cwd - Project root directory
 * @returns The current complexity level, or "MODERATE" as default
 */
export function readComplexityLevel(cwd: string): ComplexityLevel {
  const level = bridgeReadComplexity(cwd).toUpperCase();
  if (COMPLEXITY_LEVELS.includes(level as ComplexityLevel)) {
    return level as ComplexityLevel;
  }
  return "MODERATE";
}

/**
 * Resolve the effective model for an agent at Pi runtime.
 *
 * Follows a 5-step priority chain:
 * 1. Explicit override (caller-provided model)
 * 2. Agent frontmatter `model` field (pre-resolved by compiler)
 * 3. Agent `model_tier` mapped via MODEL_TIER_TO_MODEL
 * 4. Complexity-level default from COMPLEXITY_DEFAULT_MODEL
 * 5. Universal fallback: "gemini-3.1-pro-preview"
 *
 * @param frontmatter - Parsed agent frontmatter (from parseFrontmatter)
 * @param cwd - Project root directory (for reading STATE.md complexity)
 * @param explicitModel - Caller-provided model override (highest priority)
 * @returns Resolved model identifier
 *
 * @example
 * ```typescript
 * const fm = parseFrontmatter(agentContent);
 * const model = resolveAgentModel(fm, process.cwd());
 * // "gemini-3.1-pro-preview" if agent has model_tier: capable
 * // "gemini-3.1-pro-preview" if agent has model: gemini-3.1-pro-preview
 * // "gemini-3-flash-preview" at TRIVIAL complexity with no agent config
 * ```
 */
export function resolveAgentModel(
  frontmatter: AgentFrontmatter | null,
  cwd: string,
  explicitModel?: string,
): ModelId {
  // 1. Explicit override (highest priority)
  if (explicitModel && isValidModelId(explicitModel)) {
    return explicitModel as ModelId;
  }

  // 2. Agent frontmatter `model` (pre-resolved by compiler)
  if (frontmatter?.model && isValidModelId(frontmatter.model)) {
    return frontmatter.model as ModelId;
  }

  // 3. Agent model_tier → mapped to ModelId
  if (frontmatter?.model_tier) {
    const mapped =
      MODEL_TIER_TO_MODEL[
        frontmatter.model_tier as keyof typeof MODEL_TIER_TO_MODEL
      ];
    if (mapped) return mapped;
  }

  // 4. Complexity-level default
  const complexity = readComplexityLevel(cwd);
  const complexityDefault = COMPLEXITY_DEFAULT_MODEL[complexity];
  if (complexityDefault) return complexityDefault;

  // 5. Universal fallback
  return "gemini-3.1-pro-preview";
}

/**
 * Check if a string is a valid ModelId.
 *
 * @param value - String to check
 * @returns true if the value is a valid Gemini model identifier
 */
function isValidModelId(value: string): boolean {
  return (
    value === "gemini-3.1-pro-preview" || value === "gemini-3-flash-preview"
  );
}

/**
 * Get the model tier label for a given model identifier.
 *
 * Reverse lookup: maps model names back to tier labels.
 * Useful for display purposes (e.g., showing "capable" instead of "opus").
 *
 * @param model - Model identifier
 * @returns Tier label, or "balanced" if no match
 */
export function getModelTier(model: string): string {
  if (model === "gemini-3-flash-preview") return "fast";
  return "balanced";
}

export { MODEL_TIER_TO_MODEL, COMPLEXITY_DEFAULT_MODEL };
export type { ModelId, ComplexityLevel } from "./luca-constants";
