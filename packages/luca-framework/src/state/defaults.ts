/**
 * Default complexity configuration for luca-state.
 *
 * Provides the standard 5-level complexity gating matrix used when
 * no custom config exists. Self-contained — uses local types only.
 *
 * @module luca-state/defaults
 */
import type {
  ComplexityLevel,
  StepActivation,
  VerificationMode,
} from "./utils/complexity-utils";

/**
 * Per-level workflow gating configuration.
 *
 * Simplified version for standalone package usage. The promotion fields
 * use `Record<string, string>` instead of framework-specific tier enums.
 */
export interface ComplexityGate {
  /** Cognitive pre-flight depth */
  cognitivePreflight: "lite" | "full";
  /** Whether research (lu-phase-researcher) runs */
  research: StepActivation;
  /** Whether discussion (phase-discuss) runs */
  discussion: StepActivation;
  /** Plan verification iterations (lu-plan-checker loop count) */
  planVerificationIterations: number;
  /** Harness fix iterations (Loop A: mechanical failure fix loop max) */
  harnessFixIterations: number;
  /** Verify fix iterations (Loop B: semantic gap fix loop max) */
  verifyFixIterations: number;
  /** Verification mode for lu-verifier */
  verificationMode: VerificationMode;
  /** Code review agents to spawn (by agent name) */
  codeReviewAgents: string[];
  /** UAT step activation */
  uat: StepActivation;
  /** Learning capture depth */
  learningCapture: "skip" | "brief" | "standard" | "full" | "full+debrief";
  /** Optional cognition tier promotions at this complexity level */
  cognitionPromotions?: Record<string, string>;
  /** Optional context tier promotions at this complexity level */
  contextPromotions?: Record<string, string>;
}

/** The complete complexity matrix type */
export type ComplexityMatrix = Record<ComplexityLevel, ComplexityGate>;

/**
 * The default gating matrix for luca-state.
 *
 * CANONICAL SOURCE OF TRUTH: src/complexity/__helpers/defaults.ts
 *
 * This is a standalone copy for the luca-state package (which cannot import
 * from src/ due to package isolation). When updating iteration counts or
 * verification modes, ensure values stay aligned with the canonical matrix
 * in src/complexity/__helpers/defaults.ts and the documentation in
 * .claude/rules/complexity-gating.md.
 *
 * Last verified alignment: 2026-03-08 (Phase 13, PLAN-01 Task 2)
 */
export const DEFAULT_COMPLEXITY_MATRIX: ComplexityMatrix = {
  TRIVIAL: {
    cognitivePreflight: "lite",
    research: "skip",
    discussion: "skip",
    planVerificationIterations: 1,
    harnessFixIterations: 1,
    verifyFixIterations: 1,
    verificationMode: "quick",
    codeReviewAgents: [],
    uat: "skip",
    learningCapture: "skip",
  },
  SIMPLE: {
    cognitivePreflight: "lite",
    research: "skip",
    discussion: "skip",
    planVerificationIterations: 1,
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
    harnessFixIterations: 2,
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
    harnessFixIterations: 2,
    verifyFixIterations: 1,
    verificationMode: "full",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "ui",
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
    harnessFixIterations: 3,
    verifyFixIterations: 2,
    verificationMode: "full+human",
    codeReviewAgents: [
      "dx-advocate",
      "code-simplifier",
      "code-architect",
      "ui",
      "security-auditor",
    ],
    uat: "required+thorough",
    learningCapture: "full+debrief",
    cognitionPromotions: { T0: "T1", T1: "T2", T2: "T3" },
    contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },
  },
};
