import { describe, test, expect } from "bun:test";
import {
  workflowGuards,
  guardNames,
} from "../../../packages/luca-framework/src/state/guards";
import { DEFAULT_COMPLEXITY_MATRIX } from "../../../packages/luca-framework/src/state/defaults";
import { initializeContext } from "../../../packages/luca-framework/src/state/types";
import type { WorkflowContext } from "../../../packages/luca-framework/src/state/types";

/**
 * Helper to build a full WorkflowContext with a complexity matrix.
 * Uses initializeContext for defaults, then applies overrides.
 * Uses the DEFAULT_COMPLEXITY_MATRIX for realistic gating values.
 */
function makeContext(
  overrides: Partial<WorkflowContext> = {},
): WorkflowContext {
  return initializeContext({
    complexity: "TRIVIAL",
    complexity_matrix: DEFAULT_COMPLEXITY_MATRIX,
    gates: {},
    oversight: "milestone",
    verification_attempts: 0,
    max_verification_attempts: 3,
    phase_results: [],
    workflow_config: {},
    autopilot_config: {},
    ...overrides,
  });
}

/** Helper to create a minimal phase result for testing */
function makePhaseResult(
  overrides: Partial<WorkflowContext["phase_results"][number]> & {
    phase_id: number;
  },
): WorkflowContext["phase_results"][number] {
  return {
    status: "passed",
    summary: "",
    errors: [],
    duration_ms: 0,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Guard Introspection ──────────────────────────────────────────────────────

describe("guardNames", () => {
  test("exports all guard function names", () => {
    expect(guardNames.length).toBeGreaterThanOrEqual(16);
    expect(guardNames).toContain("shouldRunResearch");
    expect(guardNames).toContain("shouldRunDiscussion");
    expect(guardNames).toContain("shouldRunUAT");
    expect(guardNames).toContain("shouldCaptureLearnings");
    expect(guardNames).toContain("shouldRunCodeReview");
    expect(guardNames).toContain("shouldRunLearning");
    expect(guardNames).toContain("gateEnabled");
    expect(guardNames).toContain("gateDisabled");
    expect(guardNames).toContain("needsHumanApproval");
    expect(guardNames).toContain("isFullAuto");
    expect(guardNames).toContain("withinBudget");
    expect(guardNames).toContain("canRetryVerification");
    expect(guardNames).toContain("meetsComplexityThreshold");
    expect(guardNames).toContain("hasMorePhases");
    expect(guardNames).toContain("hasCurrentPhase");
    expect(guardNames).toContain("lastPhaseSucceeded");
  });
});

// ─── shouldRunDiscussion ──────────────────────────────────────────────────────

describe("shouldRunDiscussion", () => {
  test("returns false for TRIVIAL (discussion=skip)", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(workflowGuards.shouldRunDiscussion({ context: ctx })).toBe(false);
  });

  test("returns false for SIMPLE (discussion=skip)", () => {
    const ctx = makeContext({ complexity: "SIMPLE" });
    expect(workflowGuards.shouldRunDiscussion({ context: ctx })).toBe(false);
  });

  test("returns true for MODERATE (discussion=optional, not skip)", () => {
    const ctx = makeContext({ complexity: "MODERATE" });
    expect(workflowGuards.shouldRunDiscussion({ context: ctx })).toBe(true);
  });

  test("returns true for COMPLEX (discussion=run)", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(workflowGuards.shouldRunDiscussion({ context: ctx })).toBe(true);
  });

  test("returns true for CRITICAL (discussion=required)", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(workflowGuards.shouldRunDiscussion({ context: ctx })).toBe(true);
  });
});

// ─── shouldRunResearch ────────────────────────────────────────────────────────

describe("shouldRunResearch", () => {
  test("returns false for TRIVIAL (research=skip)", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(workflowGuards.shouldRunResearch({ context: ctx })).toBe(false);
  });

  test("returns false for SIMPLE (research=skip)", () => {
    const ctx = makeContext({ complexity: "SIMPLE" });
    expect(workflowGuards.shouldRunResearch({ context: ctx })).toBe(false);
  });

  test("returns false for MODERATE (research=optional, not required/run)", () => {
    const ctx = makeContext({ complexity: "MODERATE" });
    expect(workflowGuards.shouldRunResearch({ context: ctx })).toBe(false);
  });

  test("returns true for COMPLEX (research=required)", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(workflowGuards.shouldRunResearch({ context: ctx })).toBe(true);
  });

  test("returns true for CRITICAL (research=required)", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(workflowGuards.shouldRunResearch({ context: ctx })).toBe(true);
  });
});

// ─── shouldRunUAT ─────────────────────────────────────────────────────────────

describe("shouldRunUAT", () => {
  test("returns false for TRIVIAL (uat=skip)", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(workflowGuards.shouldRunUAT({ context: ctx })).toBe(false);
  });

  test("returns false for SIMPLE (uat=skip)", () => {
    const ctx = makeContext({ complexity: "SIMPLE" });
    expect(workflowGuards.shouldRunUAT({ context: ctx })).toBe(false);
  });

  test("returns false for MODERATE (uat=optional)", () => {
    const ctx = makeContext({ complexity: "MODERATE" });
    expect(workflowGuards.shouldRunUAT({ context: ctx })).toBe(false);
  });

  test("returns true for COMPLEX (uat=required)", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(workflowGuards.shouldRunUAT({ context: ctx })).toBe(true);
  });

  test("returns true for CRITICAL (uat=required+thorough)", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(workflowGuards.shouldRunUAT({ context: ctx })).toBe(true);
  });
});

// ─── shouldCaptureLearnings ───────────────────────────────────────────────────

describe("shouldCaptureLearnings", () => {
  test("returns false for TRIVIAL (learningCapture=skip)", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(workflowGuards.shouldCaptureLearnings({ context: ctx })).toBe(false);
  });

  test("returns true for SIMPLE (learningCapture=brief)", () => {
    const ctx = makeContext({ complexity: "SIMPLE" });
    expect(workflowGuards.shouldCaptureLearnings({ context: ctx })).toBe(true);
  });

  test("returns true for MODERATE (learningCapture=standard)", () => {
    const ctx = makeContext({ complexity: "MODERATE" });
    expect(workflowGuards.shouldCaptureLearnings({ context: ctx })).toBe(true);
  });

  test("returns true for COMPLEX (learningCapture=full)", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(workflowGuards.shouldCaptureLearnings({ context: ctx })).toBe(true);
  });

  test("returns true for CRITICAL (learningCapture=full+debrief)", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(workflowGuards.shouldCaptureLearnings({ context: ctx })).toBe(true);
  });
});

// ─── gateEnabled / gateDisabled ───────────────────────────────────────────────

describe("gateEnabled", () => {
  test("returns true when gate is true in config", () => {
    const ctx = makeContext({ gates: { confirm_plan: true } });
    expect(
      workflowGuards.gateEnabled({ context: ctx }, { gate: "confirm_plan" }),
    ).toBe(true);
  });

  test("returns false when gate is absent", () => {
    const ctx = makeContext({ gates: {} });
    expect(
      workflowGuards.gateEnabled({ context: ctx }, { gate: "confirm_plan" }),
    ).toBe(false);
  });

  test("returns false when gate is explicitly false", () => {
    const ctx = makeContext({ gates: { confirm_plan: false } });
    expect(
      workflowGuards.gateEnabled({ context: ctx }, { gate: "confirm_plan" }),
    ).toBe(false);
  });
});

describe("gateDisabled", () => {
  test("returns true when gate is absent", () => {
    const ctx = makeContext({ gates: {} });
    expect(
      workflowGuards.gateDisabled({ context: ctx }, { gate: "unknown" }),
    ).toBe(true);
  });

  test("returns false when gate is true", () => {
    const ctx = makeContext({ gates: { confirm_plan: true } });
    expect(
      workflowGuards.gateDisabled({ context: ctx }, { gate: "confirm_plan" }),
    ).toBe(false);
  });
});

// ─── needsHumanApproval ──────────────────────────────────────────────────────

describe("needsHumanApproval", () => {
  test("returns true for oversight=plan", () => {
    const ctx = makeContext({ oversight: "plan" });
    expect(workflowGuards.needsHumanApproval({ context: ctx })).toBe(true);
  });

  test("returns true for oversight=phase", () => {
    const ctx = makeContext({ oversight: "phase" });
    expect(workflowGuards.needsHumanApproval({ context: ctx })).toBe(true);
  });

  test("returns false for oversight=milestone", () => {
    const ctx = makeContext({ oversight: "milestone" });
    expect(workflowGuards.needsHumanApproval({ context: ctx })).toBe(false);
  });

  test("returns false for oversight=full-auto", () => {
    const ctx = makeContext({ oversight: "full-auto" });
    expect(workflowGuards.needsHumanApproval({ context: ctx })).toBe(false);
  });
});

// ─── isFullAuto ──────────────────────────────────────────────────────────────

describe("isFullAuto", () => {
  test("returns true for oversight=full-auto", () => {
    const ctx = makeContext({ oversight: "full-auto" });
    expect(workflowGuards.isFullAuto({ context: ctx })).toBe(true);
  });

  test("returns false for oversight=milestone", () => {
    const ctx = makeContext({ oversight: "milestone" });
    expect(workflowGuards.isFullAuto({ context: ctx })).toBe(false);
  });
});

// ─── withinBudget ─────────────────────────────────────────────────────────────

describe("withinBudget", () => {
  test("returns true when no iteration_budget is set", () => {
    const ctx = makeContext({ iteration_budget: undefined });
    expect(workflowGuards.withinBudget({ context: ctx })).toBe(true);
  });

  test("returns true when under_budget", () => {
    const ctx = makeContext({
      iteration_budget: {
        max_iterations: 3,
        current_iteration: 1,
        soft_stop_percent: 80,
        status: "under_budget",
      },
    });
    expect(workflowGuards.withinBudget({ context: ctx })).toBe(true);
  });

  test("returns false when exceeded", () => {
    const ctx = makeContext({
      iteration_budget: {
        max_iterations: 3,
        current_iteration: 3,
        soft_stop_percent: 80,
        status: "exceeded",
      },
    });
    expect(workflowGuards.withinBudget({ context: ctx })).toBe(false);
  });

  test("returns false when soft_stop", () => {
    const ctx = makeContext({
      iteration_budget: {
        max_iterations: 5,
        current_iteration: 4,
        soft_stop_percent: 80,
        status: "soft_stop",
      },
    });
    expect(workflowGuards.withinBudget({ context: ctx })).toBe(false);
  });
});

// ─── canRetryVerification ─────────────────────────────────────────────────────

describe("canRetryVerification", () => {
  test("returns true when attempts=0, max=3", () => {
    const ctx = makeContext({
      verification_attempts: 0,
      max_verification_attempts: 3,
    });
    expect(workflowGuards.canRetryVerification({ context: ctx })).toBe(true);
  });

  test("returns true when attempts=2, max=3", () => {
    const ctx = makeContext({
      verification_attempts: 2,
      max_verification_attempts: 3,
    });
    expect(workflowGuards.canRetryVerification({ context: ctx })).toBe(true);
  });

  test("returns false when attempts=3, max=3", () => {
    const ctx = makeContext({
      verification_attempts: 3,
      max_verification_attempts: 3,
    });
    expect(workflowGuards.canRetryVerification({ context: ctx })).toBe(false);
  });

  test("returns false when attempts exceed max", () => {
    const ctx = makeContext({
      verification_attempts: 5,
      max_verification_attempts: 3,
    });
    expect(workflowGuards.canRetryVerification({ context: ctx })).toBe(false);
  });
});

// ─── meetsComplexityThreshold ─────────────────────────────────────────────────

describe("meetsComplexityThreshold", () => {
  test("TRIVIAL meets TRIVIAL", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(
      workflowGuards.meetsComplexityThreshold(
        { context: ctx },
        { min: "TRIVIAL" },
      ),
    ).toBe(true);
  });

  test("TRIVIAL does not meet MODERATE", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(
      workflowGuards.meetsComplexityThreshold(
        { context: ctx },
        { min: "MODERATE" },
      ),
    ).toBe(false);
  });

  test("COMPLEX meets MODERATE", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(
      workflowGuards.meetsComplexityThreshold(
        { context: ctx },
        { min: "MODERATE" },
      ),
    ).toBe(true);
  });

  test("CRITICAL meets CRITICAL", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(
      workflowGuards.meetsComplexityThreshold(
        { context: ctx },
        { min: "CRITICAL" },
      ),
    ).toBe(true);
  });
});

// ─── hasMorePhases ────────────────────────────────────────────────────────────

describe("hasMorePhases", () => {
  test("returns true when 0 results and max=3", () => {
    const ctx = makeContext({
      phase_results: [],
      autopilot_config: { max_phases_per_session: 3 },
    });
    expect(workflowGuards.hasMorePhases({ context: ctx })).toBe(true);
  });

  test("returns true when 2 results and max=3", () => {
    const ctx = makeContext({
      phase_results: [
        makePhaseResult({ phase_id: 1 }),
        makePhaseResult({ phase_id: 2 }),
      ],
      autopilot_config: { max_phases_per_session: 3 },
    });
    expect(workflowGuards.hasMorePhases({ context: ctx })).toBe(true);
  });

  test("returns false when 3 results and max=3", () => {
    const ctx = makeContext({
      phase_results: [
        makePhaseResult({ phase_id: 1 }),
        makePhaseResult({ phase_id: 2 }),
        makePhaseResult({ phase_id: 3 }),
      ],
      autopilot_config: { max_phases_per_session: 3 },
    });
    expect(workflowGuards.hasMorePhases({ context: ctx })).toBe(false);
  });

  test("defaults to max=1 when max_phases_per_session is not set", () => {
    const ctx = makeContext({
      phase_results: [],
      autopilot_config: {},
    });
    expect(workflowGuards.hasMorePhases({ context: ctx })).toBe(true);
  });

  test("returns false when 1 result and default max=1", () => {
    const ctx = makeContext({
      phase_results: [makePhaseResult({ phase_id: 1 })],
      autopilot_config: {},
    });
    expect(workflowGuards.hasMorePhases({ context: ctx })).toBe(false);
  });
});

// ─── hasCurrentPhase / lastPhaseSucceeded ─────────────────────────────────────

describe("hasCurrentPhase", () => {
  test("returns true when current_phase is set", () => {
    const ctx = makeContext({ current_phase: 1 });
    expect(workflowGuards.hasCurrentPhase({ context: ctx })).toBe(true);
  });

  test("returns false when current_phase is undefined", () => {
    const ctx = makeContext({ current_phase: undefined });
    expect(workflowGuards.hasCurrentPhase({ context: ctx })).toBe(false);
  });
});

describe("lastPhaseSucceeded", () => {
  test("returns true when last phase status is passed", () => {
    const ctx = makeContext({
      phase_results: [makePhaseResult({ phase_id: 1, status: "passed" })],
    });
    expect(workflowGuards.lastPhaseSucceeded({ context: ctx })).toBe(true);
  });

  test("returns false when last phase status is failed", () => {
    const ctx = makeContext({
      phase_results: [makePhaseResult({ phase_id: 1, status: "failed" })],
    });
    expect(workflowGuards.lastPhaseSucceeded({ context: ctx })).toBe(false);
  });

  test("returns false when no phase results", () => {
    const ctx = makeContext({ phase_results: [] });
    expect(workflowGuards.lastPhaseSucceeded({ context: ctx })).toBe(false);
  });
});

// ─── workflowConfigEnabled ───────────────────────────────────────────────────

describe("workflowConfigEnabled", () => {
  test("returns true when config key is true", () => {
    const ctx = makeContext({
      workflow_config: { code_review: true },
    });
    expect(
      workflowGuards.workflowConfigEnabled(
        { context: ctx },
        { key: "code_review" },
      ),
    ).toBe(true);
  });

  test("returns false when config key is false", () => {
    const ctx = makeContext({
      workflow_config: { code_review: false },
    });
    expect(
      workflowGuards.workflowConfigEnabled(
        { context: ctx },
        { key: "code_review" },
      ),
    ).toBe(false);
  });

  test("returns false when config key is absent", () => {
    const ctx = makeContext({ workflow_config: {} });
    expect(
      workflowGuards.workflowConfigEnabled(
        { context: ctx },
        { key: "code_review" },
      ),
    ).toBe(false);
  });
});

// ─── shouldRunCodeReview ────────────────────────────────────────────────────

describe("shouldRunCodeReview", () => {
  test("returns false for TRIVIAL (codeReviewAgents=[])", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(workflowGuards.shouldRunCodeReview({ context: ctx })).toBe(false);
  });

  test("returns false for SIMPLE (codeReviewAgents=[])", () => {
    const ctx = makeContext({ complexity: "SIMPLE" });
    expect(workflowGuards.shouldRunCodeReview({ context: ctx })).toBe(false);
  });

  test("returns true for MODERATE (codeReviewAgents=[dx-advocate, code-simplifier])", () => {
    const ctx = makeContext({ complexity: "MODERATE" });
    expect(workflowGuards.shouldRunCodeReview({ context: ctx })).toBe(true);
  });

  test("returns true for COMPLEX (codeReviewAgents has 4 agents)", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(workflowGuards.shouldRunCodeReview({ context: ctx })).toBe(true);
  });

  test("returns true for CRITICAL (codeReviewAgents has 5 agents)", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(workflowGuards.shouldRunCodeReview({ context: ctx })).toBe(true);
  });

  test("returns false when workflow_config.code_review is false (override)", () => {
    const ctx = makeContext({
      complexity: "CRITICAL",
      workflow_config: { code_review: false },
    });
    expect(workflowGuards.shouldRunCodeReview({ context: ctx })).toBe(false);
  });
});

// ─── shouldRunLearning ──────────────────────────────────────────────────────

describe("shouldRunLearning", () => {
  test("returns false for TRIVIAL (learningCapture=skip)", () => {
    const ctx = makeContext({ complexity: "TRIVIAL" });
    expect(workflowGuards.shouldRunLearning({ context: ctx })).toBe(false);
  });

  test("returns false for SIMPLE (learningCapture=brief)", () => {
    const ctx = makeContext({ complexity: "SIMPLE" });
    expect(workflowGuards.shouldRunLearning({ context: ctx })).toBe(false);
  });

  test("returns true for MODERATE (learningCapture=standard)", () => {
    const ctx = makeContext({ complexity: "MODERATE" });
    expect(workflowGuards.shouldRunLearning({ context: ctx })).toBe(true);
  });

  test("returns true for COMPLEX (learningCapture=full)", () => {
    const ctx = makeContext({ complexity: "COMPLEX" });
    expect(workflowGuards.shouldRunLearning({ context: ctx })).toBe(true);
  });

  test("returns true for CRITICAL (learningCapture=full+debrief)", () => {
    const ctx = makeContext({ complexity: "CRITICAL" });
    expect(workflowGuards.shouldRunLearning({ context: ctx })).toBe(true);
  });
});
