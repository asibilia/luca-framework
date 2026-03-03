import { describe, test, expect } from "bun:test";
import { resolveMajorityVote } from "../../../src/shared/__helpers/tribunal-consensus";
import type { VotablePerspective } from "../../../src/shared/__helpers/tribunal-consensus";

// ---------------------------------------------------------------------------
// Test types
// ---------------------------------------------------------------------------

type TestCategory = "alpha" | "beta" | "gamma";

interface TestPerspective extends VotablePerspective<TestCategory> {
  readonly agent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePerspective(
  overrides: Partial<TestPerspective> & { category_assessment: TestCategory },
): TestPerspective {
  return {
    agent: "test-agent",
    confidence: 0.8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveMajorityVote
// ---------------------------------------------------------------------------

describe("resolveMajorityVote", () => {
  test("resolves unanimous agreement (3-0)", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "alpha",
        confidence: 0.85,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "alpha",
        confidence: 0.8,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    expect(result.consensus_category).toBe("alpha");
    expect(result.consensus_voters).toHaveLength(3);
    // No dissenter when all 3 agree
    expect(result.dissenter).toBeUndefined();
  });

  test("resolves majority agreement (2-1)", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.8,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "beta",
        confidence: 0.7,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "alpha",
        confidence: 0.85,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    expect(result.consensus_category).toBe("alpha");
    expect(result.consensus_voters).toHaveLength(2);
    expect(result.dissenter).toBeDefined();
    expect(result.dissenter!.agent).toBe("b");
    expect(result.dissenter!.category_assessment).toBe("beta");
  });

  test("resolves three-way split using highest confidence as tiebreaker", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.6,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "beta",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "gamma",
        confidence: 0.5,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    // Highest confidence (0.9) wins
    expect(result.consensus_category).toBe("beta");
    expect(result.consensus_voters).toHaveLength(1);
    expect(result.consensus_voters[0]!.agent).toBe("b");
    // Dissenter is the runner-up by confidence
    expect(result.dissenter).toBeDefined();
    expect(result.dissenter!.agent).toBe("a");
    expect(result.dissenter!.confidence).toBe(0.6);
  });

  test("calculates consensus confidence as average of agreeing voters (2-1)", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.8,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "beta",
        confidence: 0.7,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "alpha",
        confidence: 0.9,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    // Average of 0.8 and 0.9 = 0.85
    expect(result.consensus_confidence).toBe(0.85);
  });

  test("calculates consensus confidence as average of all voters for unanimous (3-0)", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.7,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "alpha",
        confidence: 0.8,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "alpha",
        confidence: 0.9,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    // Average of 0.7, 0.8, 0.9 = 0.8
    expect(result.consensus_confidence).toBe(0.8);
  });

  test("rounds consensus confidence to 2 decimal places", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.77,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "alpha",
        confidence: 0.88,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "beta",
        confidence: 0.5,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    // Average of 0.77 and 0.88 = 0.825 → rounds to 0.83
    expect(result.consensus_confidence).toBe(0.83);
  });

  test("rounds confidence correctly for repeating decimals", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.7,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "alpha",
        confidence: 0.7,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "alpha",
        confidence: 0.8,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    // Average of 0.7, 0.7, 0.8 = 0.7333... → rounds to 0.73
    expect(result.consensus_confidence).toBe(0.73);
  });

  test("consensus confidence for single voter in 3-way split equals that voter's confidence", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.3,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "beta",
        confidence: 0.95,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "gamma",
        confidence: 0.4,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    // Single voter wins with their exact confidence
    expect(result.consensus_category).toBe("beta");
    expect(result.consensus_confidence).toBe(0.95);
  });

  test("preserves full perspective objects in consensus_voters", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      makePerspective({
        agent: "a",
        category_assessment: "alpha",
        confidence: 0.8,
      }),
      makePerspective({
        agent: "b",
        category_assessment: "alpha",
        confidence: 0.85,
      }),
      makePerspective({
        agent: "c",
        category_assessment: "beta",
        confidence: 0.7,
      }),
    ];

    const result = resolveMajorityVote(perspectives);

    expect(result.consensus_voters).toHaveLength(2);
    expect(result.consensus_voters[0]!.agent).toBe("a");
    expect(result.consensus_voters[1]!.agent).toBe("b");
  });

  test("works with different category type strings", () => {
    type CustomCategory =
      | "verified_fix"
      | "symptom_treatment"
      | "incomplete_fix";
    interface CustomPerspective extends VotablePerspective<CustomCategory> {
      readonly agent: string;
    }

    const perspectives: [
      CustomPerspective,
      CustomPerspective,
      CustomPerspective,
    ] = [
      {
        agent: "debugger",
        category_assessment: "verified_fix",
        confidence: 0.9,
      },
      {
        agent: "verifier",
        category_assessment: "symptom_treatment",
        confidence: 0.85,
      },
      {
        agent: "arbiter",
        category_assessment: "verified_fix",
        confidence: 0.8,
      },
    ];

    const result = resolveMajorityVote(perspectives);

    expect(result.consensus_category).toBe("verified_fix");
    expect(result.dissenter?.category_assessment).toBe("symptom_treatment");
  });
});
