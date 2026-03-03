import { describe, test, expect } from "bun:test";
import {
  detectT1T3Conflict,
  shouldRunVerificationTribunal,
  buildTestWriterDiagnosticPrompt,
  buildVerifierDiagnosticPrompt,
  buildIntegrationDiagnosticPrompt,
  resolveVerificationTribunal,
} from "../../../src/agents/__helpers/verification-tribunal";
import type {
  ConflictSignal,
  DiagnosticPerspective,
} from "../../../src/agents/__schemas/verification-tribunal.schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConflictSignal(
  overrides: Partial<ConflictSignal> = {},
): ConflictSignal {
  return {
    phase: 92,
    t1_status: "strong_pass",
    t1_evidence: "All 47 tests pass, TDD-generated",
    t3_status: "partial",
    t3_evidence: "Chat component renders but no error handling verified",
    conflict_type: "t1_pass_t3_partial",
    ...overrides,
  };
}

function makePerspective(
  overrides: Partial<DiagnosticPerspective> = {},
): DiagnosticPerspective {
  return {
    agent: "lu-test-writer",
    category_assessment: "tests_incomplete",
    confidence: 0.8,
    evidence: "Tests don't cover error handling paths",
    recommended_action: "Add error handling tests",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectT1T3Conflict
// ---------------------------------------------------------------------------

describe("detectT1T3Conflict", () => {
  test("detects strong_pass + partial conflict", () => {
    const conflict = detectT1T3Conflict(
      92,
      "strong_pass",
      "All tests pass",
      "partial",
      "Goal partially met",
    );

    expect(conflict).not.toBeNull();
    expect(conflict!.conflict_type).toBe("t1_pass_t3_partial");
    expect(conflict!.phase).toBe(92);
    expect(conflict!.t1_status).toBe("strong_pass");
    expect(conflict!.t3_status).toBe("partial");
  });

  test("detects strong_pass + fail conflict", () => {
    const conflict = detectT1T3Conflict(
      92,
      "strong_pass",
      "All tests pass",
      "fail",
      "Objective not met",
    );

    expect(conflict).not.toBeNull();
    expect(conflict!.conflict_type).toBe("t1_pass_t3_fail");
  });

  test("detects partial + partial conflict", () => {
    const conflict = detectT1T3Conflict(
      92,
      "partial",
      "Basic checks pass, no TDD tests",
      "partial",
      "Some objectives met",
    );

    expect(conflict).not.toBeNull();
    expect(conflict!.conflict_type).toBe("t1_partial_t3_partial");
  });

  test("returns null when T1 fails (T1 failure is blocking)", () => {
    const conflict = detectT1T3Conflict(
      92,
      "fail",
      "3 tests failing",
      "partial",
      "Goal partially met",
    );

    expect(conflict).toBeNull();
  });

  test("returns null when T1 is absent (no T1 to conflict)", () => {
    const conflict = detectT1T3Conflict(
      92,
      "absent",
      "No harness results",
      "fail",
      "Goal not met",
    );

    expect(conflict).toBeNull();
  });

  test("returns null when T1 strong_pass and T3 pass (no conflict)", () => {
    const conflict = detectT1T3Conflict(
      92,
      "strong_pass",
      "All tests pass",
      "pass",
      "All objectives met",
    );

    expect(conflict).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldRunVerificationTribunal
// ---------------------------------------------------------------------------

describe("shouldRunVerificationTribunal", () => {
  const conflict = makeConflictSignal();

  test("returns true for COMPLEX with conflict", () => {
    expect(shouldRunVerificationTribunal(conflict, "COMPLEX")).toBe(true);
  });

  test("returns true for CRITICAL with conflict", () => {
    expect(shouldRunVerificationTribunal(conflict, "CRITICAL")).toBe(true);
  });

  test("returns false for MODERATE with conflict", () => {
    expect(shouldRunVerificationTribunal(conflict, "MODERATE")).toBe(false);
  });

  test("returns false when conflict is null", () => {
    expect(shouldRunVerificationTribunal(null, "COMPLEX")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

describe("buildTestWriterDiagnosticPrompt", () => {
  const conflict = makeConflictSignal();

  test("includes conflict type in prompt", () => {
    const prompt = buildTestWriterDiagnosticPrompt(conflict);
    expect(prompt).toContain("t1_pass_t3_partial");
  });

  test("includes T1 evidence in prompt", () => {
    const prompt = buildTestWriterDiagnosticPrompt(conflict);
    expect(prompt).toContain("All 47 tests pass, TDD-generated");
  });

  test("includes T3 evidence in prompt", () => {
    const prompt = buildTestWriterDiagnosticPrompt(conflict);
    expect(prompt).toContain(
      "Chat component renders but no error handling verified",
    );
  });

  test("mentions lu-test-writer role", () => {
    const prompt = buildTestWriterDiagnosticPrompt(conflict);
    expect(prompt).toContain("lu-test-writer");
  });
});

describe("buildVerifierDiagnosticPrompt", () => {
  const conflict = makeConflictSignal();

  test("includes conflict type in prompt", () => {
    const prompt = buildVerifierDiagnosticPrompt(conflict);
    expect(prompt).toContain("t1_pass_t3_partial");
  });

  test("mentions lu-verifier role", () => {
    const prompt = buildVerifierDiagnosticPrompt(conflict);
    expect(prompt).toContain("lu-verifier");
  });
});

describe("buildIntegrationDiagnosticPrompt", () => {
  const conflict = makeConflictSignal();

  test("includes conflict type in prompt", () => {
    const prompt = buildIntegrationDiagnosticPrompt(conflict);
    expect(prompt).toContain("t1_pass_t3_partial");
  });

  test("mentions lu-integration-checker role", () => {
    const prompt = buildIntegrationDiagnosticPrompt(conflict);
    expect(prompt).toContain("lu-integration-checker");
  });
});

// ---------------------------------------------------------------------------
// resolveVerificationTribunal
// ---------------------------------------------------------------------------

describe("resolveVerificationTribunal", () => {
  const conflict = makeConflictSignal();

  test("resolves unanimous agreement (3-0)", () => {
    const perspectives: [
      DiagnosticPerspective,
      DiagnosticPerspective,
      DiagnosticPerspective,
    ] = [
      makePerspective({
        agent: "lu-test-writer",
        category_assessment: "tests_incomplete",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "tests_incomplete",
        confidence: 0.85,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "tests_incomplete",
        confidence: 0.8,
      }),
    ];

    const result = resolveVerificationTribunal(92, conflict, perspectives);

    expect(result.consensus_category).toBe("tests_incomplete");
    expect(result.phase).toBe(92);
    expect(result.perspectives).toHaveLength(3);
    expect(result.estimated_token_cost).toBe(10500);
    expect(result.timestamp).toBeTruthy();
  });

  test("resolves majority agreement (2-1)", () => {
    const perspectives: [
      DiagnosticPerspective,
      DiagnosticPerspective,
      DiagnosticPerspective,
    ] = [
      makePerspective({
        agent: "lu-test-writer",
        category_assessment: "tests_incomplete",
        confidence: 0.8,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "goal_over_specified",
        confidence: 0.7,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "tests_incomplete",
        confidence: 0.85,
      }),
    ];

    const result = resolveVerificationTribunal(92, conflict, perspectives);

    expect(result.consensus_category).toBe("tests_incomplete");
    expect(result.dissenting_perspective).toBeDefined();
    expect(result.dissenting_perspective!.agent).toBe("lu-verifier");
  });

  test("resolves three-way split using highest confidence", () => {
    const perspectives: [
      DiagnosticPerspective,
      DiagnosticPerspective,
      DiagnosticPerspective,
    ] = [
      makePerspective({
        agent: "lu-test-writer",
        category_assessment: "tests_incomplete",
        confidence: 0.6,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "goal_over_specified",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "wiring_issue",
        confidence: 0.5,
      }),
    ];

    const result = resolveVerificationTribunal(92, conflict, perspectives);

    // Highest confidence (0.9) wins: goal_over_specified
    expect(result.consensus_category).toBe("goal_over_specified");
    expect(result.dissenting_perspective).toBeDefined();
  });

  test("maps tests_incomplete to appropriate remediation", () => {
    const perspectives: [
      DiagnosticPerspective,
      DiagnosticPerspective,
      DiagnosticPerspective,
    ] = [
      makePerspective({ category_assessment: "tests_incomplete" }),
      makePerspective({ category_assessment: "tests_incomplete" }),
      makePerspective({ category_assessment: "tests_incomplete" }),
    ];

    const result = resolveVerificationTribunal(92, conflict, perspectives);

    expect(result.recommended_remediation).toContain("additional tests");
  });

  test("maps goal_over_specified to appropriate remediation", () => {
    const perspectives: [
      DiagnosticPerspective,
      DiagnosticPerspective,
      DiagnosticPerspective,
    ] = [
      makePerspective({ category_assessment: "goal_over_specified" }),
      makePerspective({ category_assessment: "goal_over_specified" }),
      makePerspective({ category_assessment: "goal_over_specified" }),
    ];

    const result = resolveVerificationTribunal(92, conflict, perspectives);

    expect(result.recommended_remediation).toContain("must-have truths");
  });

  test("maps wiring_issue to appropriate remediation", () => {
    const perspectives: [
      DiagnosticPerspective,
      DiagnosticPerspective,
      DiagnosticPerspective,
    ] = [
      makePerspective({ category_assessment: "wiring_issue" }),
      makePerspective({ category_assessment: "wiring_issue" }),
      makePerspective({ category_assessment: "wiring_issue" }),
    ];

    const result = resolveVerificationTribunal(92, conflict, perspectives);

    expect(result.recommended_remediation).toContain("wiring gaps");
  });
});
