/**
 * Default complexity configuration.
 * Defines the standard gating matrix used when no custom config exists.
 *
 * Design principle: 5 levels, 3 behavioral tiers.
 * - Group A (lightweight): TRIVIAL, SIMPLE — skip most optional steps
 * - Group B (standard): MODERATE — standard workflow
 * - Group C (thorough): COMPLEX, CRITICAL — full workflow with scaling
 */
import type {
  ComplexityConfig,
  ComplexityLevel,
  ComplexityMatrix,
  ComplexityClassification,
} from "../__schemas/complexity.schemas";

/** Classification criteria for each level (used by lu-router) */
export const COMPLEXITY_CLASSIFICATIONS: Record<
  ComplexityLevel,
  ComplexityClassification
> = {
  TRIVIAL: {
    level: "TRIVIAL",
    fileCount: "1",
    scope: "Single component",
    risk: "Low",
    estimatedTime: "< 15 min",
    examples: [
      "Fix typo",
      "Update config value",
      "Add simple field",
      "Rename variable",
    ],
  },
  SIMPLE: {
    level: "SIMPLE",
    fileCount: "2-3",
    scope: "Related components",
    risk: "Low-Medium",
    estimatedTime: "15-30 min",
    examples: [
      "Add utility function + tests",
      "Update component + styles",
      "Add new route handler",
    ],
  },
  MODERATE: {
    level: "MODERATE",
    fileCount: "3-5",
    scope: "Feature-scoped",
    risk: "Medium",
    estimatedTime: "30-60 min",
    examples: [
      "Add new component with API",
      "Create new schema + migration",
      "Implement feature flag",
    ],
  },
  COMPLEX: {
    level: "COMPLEX",
    fileCount: "5-10",
    scope: "Cross-cutting",
    risk: "High",
    estimatedTime: "1-3 hours",
    examples: [
      "Auth system changes",
      "Multi-file refactor",
      "New integration",
      "Database redesign",
    ],
  },
  CRITICAL: {
    level: "CRITICAL",
    fileCount: "10+ OR architectural",
    scope: "System-wide",
    risk: "Very High",
    estimatedTime: "3+ hours",
    examples: [
      "Major architecture change",
      "Payment integration",
      "Security overhaul",
      "Platform migration",
    ],
  },
};

/**
 * The default gating matrix.
 *
 * DEPRECATION NOTICE — Step Activation Fields
 * =============================================
 * The following fields in each gate entry are deprecated and retained
 * solely for backward compatibility with existing skill/rule consumers:
 *
 *   - `research`        — replaced by MODEL_ROUTING_TABLE entry for lu-phase-researcher
 *   - `discussion`      — replaced by MODEL_ROUTING_TABLE entry for lu-discuss-researcher
 *   - `codeReviewAgents` — replaced by MODEL_ROUTING_TABLE entries for each reviewer agent
 *   - `uat`             — replaced by `verificationMode` + MODEL_ROUTING_TABLE for lu-verifier
 *   - `learningCapture` — replaced by MODEL_ROUTING_TABLE entry for lu-learner
 *
 * The forward-looking replacement is the centralized model routing table
 * in `src/complexity/__helpers/model-routing.ts` (MODEL_ROUTING_TABLE),
 * which maps (agent name, complexity level) -> model tier. Use
 * `resolveModelForAgent(agentName, complexity)` to determine the
 * appropriate tier for any agent at any complexity level.
 *
 * These matrix values are retained so that skill consumers
 * (phase-plan.skill.ts, phase-execute.skill.ts) and rule consumers
 * (complexity-gating.rule.ts) continue to work without modification.
 * They will be removed once all consumers are migrated to use the
 * routing table directly.
 */
export const DEFAULT_COMPLEXITY_MATRIX: ComplexityMatrix = {
  TRIVIAL: {
    cognitivePreflight: "lite",
    research: "run",
    discussion: "run",
    planVerificationIterations: 1,
    harnessFixIterations: 1,
    verifyFixIterations: 1,
    verificationMode: "quick",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "performance-auditor",
      "security-auditor",
    ],
    uat: "run",
    learningCapture: "standard",
    default_model: "haiku",
  },
  SIMPLE: {
    cognitivePreflight: "lite",
    research: "run",
    discussion: "run",
    planVerificationIterations: 1,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "quick",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "performance-auditor",
      "security-auditor",
    ],
    uat: "run",
    learningCapture: "standard",
    default_model: "haiku",
  },
  MODERATE: {
    cognitivePreflight: "full",
    research: "run",
    discussion: "run",
    planVerificationIterations: 1,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "standard",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "performance-auditor",
      "security-auditor",
    ],
    uat: "run",
    learningCapture: "standard",
    contextPromotions: { T0: "T1", T1: "T2" },
    default_model: "sonnet",
  },
  COMPLEX: {
    cognitivePreflight: "full",
    research: "run",
    discussion: "run",
    planVerificationIterations: 2,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "full",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "performance-auditor",
      "security-auditor",
    ],
    uat: "run",
    learningCapture: "full",
    cognitionPromotions: { T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    default_model: "sonnet",
  },
  CRITICAL: {
    cognitivePreflight: "full",
    research: "run",
    discussion: "run",
    planVerificationIterations: 3,
    harnessFixIterations: 3,
    verifyFixIterations: 2,
    verificationMode: "full+human",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "performance-auditor",
      "security-auditor",
    ],
    uat: "required+thorough",
    learningCapture: "full+debrief",
    cognitionPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    default_model: "opus",
  },
};

/** Default complexity config used when no config.json complexity section exists */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  defaultLevel: "auto",
  matrix: DEFAULT_COMPLEXITY_MATRIX,
};
