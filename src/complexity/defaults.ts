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
} from "./complexity.schemas";

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

/** The default gating matrix */
export const DEFAULT_COMPLEXITY_MATRIX: ComplexityMatrix = {
  TRIVIAL: {
    cognitivePreflight: "lite",
    research: "skip",
    discussion: "skip",
    planVerificationIterations: 0,
    harnessFixIterations: 1,
    verifyFixIterations: 0,
    verificationMode: "quick",
    codeReviewAgents: [],
    uat: "skip",
    learningCapture: "skip",
  },
  SIMPLE: {
    cognitivePreflight: "lite",
    research: "skip",
    discussion: "skip",
    planVerificationIterations: 0,
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "quick",
    codeReviewAgents: [],
    uat: "skip",
    learningCapture: "brief",
  },
  MODERATE: {
    cognitivePreflight: "full",
    research: "optional",
    discussion: "optional",
    planVerificationIterations: 1,
    harnessFixIterations: 3,
    verifyFixIterations: 1,
    verificationMode: "standard",
    codeReviewAgents: ["dx-advocate", "code-simplifier"],
    uat: "optional",
    learningCapture: "standard",
    contextPromotions: { T0: "T1", T1: "T2" },
  },
  COMPLEX: {
    cognitivePreflight: "full",
    research: "required",
    discussion: "run",
    planVerificationIterations: 2,
    harnessFixIterations: 3,
    verifyFixIterations: 2,
    verificationMode: "full",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "tailwind-auditor",
    ],
    uat: "required",
    learningCapture: "full",
    cognitionPromotions: { T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
  },
  CRITICAL: {
    cognitivePreflight: "full",
    research: "required",
    discussion: "required",
    planVerificationIterations: 3,
    harnessFixIterations: 5,
    verifyFixIterations: 3,
    verificationMode: "full+human",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "tailwind-auditor",
      "security-auditor",
    ],
    uat: "required+thorough",
    learningCapture: "full+debrief",
    cognitionPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
  },
};

/** Default complexity config used when no config.json complexity section exists */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  defaultLevel: "auto",
  matrix: DEFAULT_COMPLEXITY_MATRIX,
};
