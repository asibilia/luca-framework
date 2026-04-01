/**
 * Multi-lens review gate helpers.
 *
 * Provides gate condition checking, predefined review lenses (Architecture
 * and Data), and a risk multiplier that weights complexity based on which
 * source domains the changed files touch.
 *
 * All functions are pure (no I/O). The actual MuninnDB metric query is
 * described as an instruction for the orchestrating agent to execute at
 * runtime — these helpers only structure the gate result and lens configs.
 *
 * @module multi-lens-gate
 */
import {
  MultiLensGateResultSchema,
  RiskMultiplierConfigSchema,
} from "~/skills/__schemas/multi-lens-review.schemas";
import type {
  ReviewLens,
  MultiLensGateConfig,
  MultiLensGateResult,
  RiskMultiplierConfig,
} from "~/skills/__schemas/multi-lens-review.schemas";

// ─── Predefined Review Lenses ───────────────────────────────────────────────

/**
 * Architecture lens: structural integrity, dependency direction, module boundaries.
 *
 * Focuses on the T0-T3 tier compliance, barrel purity, cross-domain
 * import violations, and archetype adherence (entity/core/infrastructure).
 */
export const ARCHITECTURE_LENS: ReviewLens = {
  name: "architecture-lens",
  focus_areas: [
    "Structural integrity — no flat files in domain root except index.ts",
    "Dependency direction — T0 -> T1 -> T2 -> T3, downward only",
    "Module boundaries — no cross-imports between entity domains (agents/skills/rules)",
    "Tier compliance — verify imports respect the 4-tier dependency map",
    "Barrel purity — index.ts files contain only re-export statements",
    "Domain archetype adherence — entity (A), core (B), infrastructure (C)",
  ],
  model_routing_preset: "DEEP_ANALYSIS",
  prompt_template: `Review the following changed files for **architecture and structural integrity** issues.

**Changed files:**
{CHANGED_FILES}

**Project standards:**
{CLAUDE_CONTENT}

**Your focus areas:**
1. **Dependency direction**: Imports must flow downward through tiers (T0 Foundation -> T1 Core -> T2 Entity -> T3 Build). Flag any upward or cross-tier violations.
2. **Module boundaries**: Entity domains (agents, skills, rules) must NEVER cross-import. Flag any agents importing from skills, rules importing from agents, etc.
3. **Barrel purity**: Every domain's index.ts must contain ONLY re-export statements. No logic, no schemas, no registries, no constants.
4. **Structural invariants**: No flat .ts files in domain root except index.ts. All code must live in __schemas/, __helpers/, entity dirs, or named subdirs.
5. **Tier compliance**: shared and complexity are T0 (imported by many). context/planner/harness/iteration/observability are T1. agents/skills/rules are T2 (parallel). compilers/hooks are T3 (terminal).
6. **Pre-mortem mitigations**: {PRE_MORTEM_MITIGATIONS}

**Return format:**
\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: architecture-lens
\`\`\`

If no issues found, return: \`issues: []\``,
};

/**
 * Data lens: data flow, state management, schema consistency.
 *
 * Focuses on Zod schema validation patterns, API snake_case compliance,
 * schema-first parsing, and data transformation correctness.
 */
export const DATA_LENS: ReviewLens = {
  name: "data-lens",
  focus_areas: [
    "Data flow — trace data from entry point through transformations to output",
    "State management — proper use of state machine bridge, dual-write guarantee",
    "Schema consistency — Zod schemas define all defaults, no destructuring defaults",
    "Zod validation patterns — safeParse over parse, proper error handling",
    "API snake_case compliance — all API payloads use snake_case properties",
    "Type inference — z.infer<typeof Schema> for all types derived from schemas",
  ],
  model_routing_preset: "DEEP_ANALYSIS",
  prompt_template: `Review the following changed files for **data flow and schema consistency** issues.

**Changed files:**
{CHANGED_FILES}

**Project standards:**
{CLAUDE_CONTENT}

**Your focus areas:**
1. **Schema-first parsing**: ALL component/function inputs must have Zod schema definitions. Defaults must be defined in schemas, NEVER in destructuring.
2. **API snake_case**: All API request/response payloads must use snake_case properties. Internal TypeScript uses camelCase.
3. **Zod patterns**: Prefer safeParse() over parse() to prevent runtime crashes. Always handle parse failures gracefully.
4. **Type inference**: Types must be inferred from schemas using z.infer<typeof Schema>, not manually defined.
5. **Data transformations**: Verify data flows correctly through transformations. Check for missing fields, wrong types, or lost data.
6. **State consistency**: state.json is the sole source of truth for workflow state. Verify state machine persists correctly.
7. **Pre-mortem mitigations**: {PRE_MORTEM_MITIGATIONS}

**Return format:**
\`\`\`yaml
issues:
  - severity: CRITICAL|HIGH|MEDIUM|LOW
    file: path/to/file.ts
    line: 42
    issue: Brief description
    suggestion: How to fix
    source_agent: data-lens
\`\`\`

If no issues found, return: \`issues: []\``,
};

// ─── Gate Check ─────────────────────────────────────────────────────────────

/**
 * Check whether the multi-lens review gate condition is met.
 *
 * Evaluates the pre-mortem signal rate against the configured threshold.
 * Requires a minimum number of samples before the gate can activate.
 *
 * Since this runs in a skill context (markdown orchestration), the actual
 * MuninnDB metric query happens at runtime via the orchestrating agent.
 * This function accepts pre-fetched signal data and returns the structured
 * gate result.
 *
 * When no signal data is available (insufficient pre-mortem history),
 * returns a "gate not met" result with an explanatory reason.
 *
 * @param signalRate - Observed pre-mortem signal rate from MuninnDB (0.0 - 1.0)
 * @param sampleCount - Number of pre-mortem runs available
 * @param config - Gate configuration (uses schema defaults if not provided)
 * @returns Structured gate result indicating whether additional lenses should activate
 *
 * @example
 * ```typescript
 * // Insufficient data — gate not met
 * const result = checkMultiLensGate(0.0, 3);
 * // { gate_met: false, signal_rate: 0.0, sample_count: 3, reason: "..." }
 *
 * // Sufficient data, rate above threshold — gate met
 * const result = checkMultiLensGate(0.15, 25);
 * // { gate_met: true, signal_rate: 0.15, sample_count: 25, reason: "..." }
 * ```
 */
export function checkMultiLensGate(
  signalRate: number = 0,
  sampleCount: number = 0,
  config?: Partial<MultiLensGateConfig>,
): MultiLensGateResult {
  // Parse gate config with defaults
  const fullConfig: MultiLensGateConfig = {
    enabled: config?.enabled ?? true,
    gate_metric: config?.gate_metric ?? "metric:signal-rate-aggregate",
    gate_threshold: config?.gate_threshold ?? 0.1,
    min_samples: config?.min_samples ?? 20,
  };

  // Gate 1: Feature enabled
  if (!fullConfig.enabled) {
    return buildGateResult(
      false,
      signalRate,
      sampleCount,
      "Multi-lens gate is disabled",
    );
  }

  // Gate 2: Minimum sample count
  if (sampleCount < fullConfig.min_samples) {
    return buildGateResult(
      false,
      signalRate,
      sampleCount,
      `Insufficient samples: ${sampleCount} of ${fullConfig.min_samples} required`,
    );
  }

  // Gate 3: Signal rate threshold
  if (signalRate <= fullConfig.gate_threshold) {
    return buildGateResult(
      false,
      signalRate,
      sampleCount,
      `Signal rate ${(signalRate * 100).toFixed(1)}% is at or below threshold ${(fullConfig.gate_threshold * 100).toFixed(1)}%`,
    );
  }

  return buildGateResult(
    true,
    signalRate,
    sampleCount,
    `Signal rate ${(signalRate * 100).toFixed(1)}% exceeds threshold ${(fullConfig.gate_threshold * 100).toFixed(1)}% with ${sampleCount} samples`,
  );
}

// ─── Risk Multiplier ────────────────────────────────────────────────────────

/**
 * Compute a risk multiplier based on which domains the changed files touch.
 *
 * Matches each changed file path against the configured high-risk domain
 * patterns (state/, shared/__schemas/, context/, harness/, hooks/, etc.).
 * Returns the highest matching multiplier, capped at max_multiplier.
 *
 * The multiplier can be used to weight the effective complexity level
 * for reviewer model selection — files in high-risk domains get reviewed
 * with more capable models.
 *
 * @param changedFiles - Array of file paths changed in the current phase
 * @param config - Risk multiplier configuration (uses schema defaults if not provided)
 * @returns Risk multiplier (1.0 to max_multiplier, default max 2.0)
 *
 * @example
 * ```typescript
 * // No high-risk files
 * computeRiskMultiplier(["src/agents/general/lu-router.agent.ts"]);
 * // Returns 1.0
 *
 * // State management files changed
 * computeRiskMultiplier(["src/state/bridge.ts", "src/shared/__schemas/consensus.schemas.ts"]);
 * // Returns 1.8 (highest matching pattern)
 * ```
 */
export function computeRiskMultiplier(
  changedFiles: string[],
  config?: Partial<RiskMultiplierConfig>,
): number {
  const parsedConfig = RiskMultiplierConfigSchema.parse(config ?? {});
  const { domain_patterns, base_weight, max_multiplier } = parsedConfig;

  if (changedFiles.length === 0) {
    return base_weight;
  }

  // Find all matching patterns and their weights
  const matchingWeights: number[] = [];

  for (const filePath of changedFiles) {
    for (const [pattern, weight] of Object.entries(domain_patterns)) {
      if (filePath.includes(pattern)) {
        matchingWeights.push(weight);
      }
    }
  }

  if (matchingWeights.length === 0) {
    return base_weight;
  }

  // Use the highest matching weight, capped at max_multiplier
  const highestWeight = Math.max(...matchingWeights);
  return Math.min(highestWeight, max_multiplier);
}

/**
 * Get both predefined review lenses as an array.
 *
 * Convenience function for retrieving the Architecture and Data lenses
 * together, suitable for passing to the reviewer spawning logic.
 *
 * @returns Array containing ARCHITECTURE_LENS and DATA_LENS
 */
export function getAdditionalLenses(): ReviewLens[] {
  return [ARCHITECTURE_LENS, DATA_LENS];
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Build a validated gate result using safeParse.
 */
function buildGateResult(
  gateMet: boolean,
  signalRate: number,
  sampleCount: number,
  reason: string,
): MultiLensGateResult {
  const parsed = MultiLensGateResultSchema.safeParse({
    gate_met: gateMet,
    signal_rate: signalRate,
    sample_count: sampleCount,
    reason,
  });

  if (!parsed.success) {
    // Fallback: return a safe default (should never happen with valid inputs)
    return {
      gate_met: false,
      signal_rate: 0,
      sample_count: 0,
      reason: `Gate evaluation failed: ${parsed.error.message}`,
    };
  }

  return parsed.data;
}
