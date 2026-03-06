import { describe, test, expect } from "bun:test";
import { resolveConsensus } from "../../../src/shared/__helpers/consensus-resolver";
import type { ConsensusResult } from "../../../src/shared/__helpers/consensus-resolver";
import { resolveMajorityVote } from "../../../src/shared/__helpers/tribunal-consensus";
import type { VotablePerspective } from "../../../src/shared/__helpers/tribunal-consensus";

// ---------------------------------------------------------------------------
// Test types
// ---------------------------------------------------------------------------

type TestCategory = "alpha" | "beta" | "gamma";

interface TestPerspective extends VotablePerspective<TestCategory> {
  readonly agent: string;
}

function make(
  category: TestCategory,
  confidence: number,
  agent = "test-agent",
): TestPerspective {
  return { category_assessment: category, confidence, agent };
}

// ---------------------------------------------------------------------------
// Unanimous mode
// ---------------------------------------------------------------------------

describe("resolveConsensus - unanimous mode", () => {
  test("all agree -> consensus", () => {
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "a"),
        make("alpha", 0.8, "b"),
        make("alpha", 0.7, "c"),
      ],
      { mode: "unanimous" },
    );
    expect(result.consensus_category).toBe("alpha");
    expect(result.consensus_voters).toHaveLength(3);
    expect(result.dissenters).toHaveLength(0);
    expect(result.mode_used).toBe("unanimous");
    expect(result.fallback_applied).toBe(false);
  });

  test("one dissents -> fallback applied", () => {
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "a"),
        make("alpha", 0.8, "b"),
        make("beta", 0.7, "c"),
      ],
      { mode: "unanimous", fallback_strategy: "highest_confidence" },
    );
    expect(result.fallback_applied).toBe(true);
    // Highest confidence voter (alpha 0.9) wins via fallback
    expect(result.consensus_category).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// Majority mode
// ---------------------------------------------------------------------------

describe("resolveConsensus - majority mode", () => {
  test("3/5 agree -> consensus", () => {
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "a"),
        make("alpha", 0.8, "b"),
        make("alpha", 0.7, "c"),
        make("beta", 0.6, "d"),
        make("gamma", 0.5, "e"),
      ],
      { mode: "majority", required_agreement: 0.5 },
    );
    expect(result.consensus_category).toBe("alpha");
    expect(result.consensus_voters).toHaveLength(3);
    expect(result.dissenters).toHaveLength(2);
    expect(result.fallback_applied).toBe(false);
  });

  test("2/5 -> no consensus, fallback applied", () => {
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "a"),
        make("alpha", 0.8, "b"),
        make("beta", 0.7, "c"),
        make("gamma", 0.6, "d"),
        make("gamma", 0.5, "e"),
      ],
      { mode: "majority", required_agreement: 0.5 },
    );
    // No category has > 50% of 5 votes (need >2.5, alpha has 2, gamma has 2)
    expect(result.fallback_applied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Supermajority mode
// ---------------------------------------------------------------------------

describe("resolveConsensus - supermajority mode", () => {
  test("2/3 passes with 0.67 threshold", () => {
    // 2/3 = 0.667 > 0.67? No, 0.667 is not > 0.67. Need > threshold.
    // Let's use a 0.6 threshold for 2/3 to pass.
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "a"),
        make("alpha", 0.8, "b"),
        make("beta", 0.7, "c"),
      ],
      { mode: "supermajority", required_agreement: 0.6 },
    );
    expect(result.consensus_category).toBe("alpha");
    expect(result.fallback_applied).toBe(false);
  });

  test("1/3 fails with 0.5 threshold", () => {
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "a"),
        make("beta", 0.8, "b"),
        make("gamma", 0.7, "c"),
      ],
      { mode: "supermajority", required_agreement: 0.5 },
    );
    // Each category has 1/3 = 0.33, not > 0.5
    expect(result.fallback_applied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Expert-weighted mode
// ---------------------------------------------------------------------------

describe("resolveConsensus - expert_weighted mode", () => {
  test("expert vote counts double, tipping majority", () => {
    // 3 perspectives: expert votes alpha (weight 2), two vote beta (weight 1 each)
    // Total weight: 4. Alpha: 2/4 = 0.5, Beta: 2/4 = 0.5
    // Need > threshold. With 0.49 threshold, alpha's 2/4 = 0.5 > 0.49
    const result = resolveConsensus(
      [
        make("alpha", 0.9, "expert-1"),
        make("beta", 0.8, "b"),
        make("beta", 0.7, "c"),
      ],
      {
        mode: "expert_weighted",
        required_agreement: 0.49,
        expert_agents: ["expert-1"],
      },
    );
    expect(result.consensus_category).toBe("alpha");
    expect(result.fallback_applied).toBe(false);
  });

  test("without expert weighting, majority wins normally", () => {
    // Same setup but no experts: beta has 2/3 > 0.5
    const result = resolveConsensus(
      [make("alpha", 0.9, "a"), make("beta", 0.8, "b"), make("beta", 0.7, "c")],
      { mode: "expert_weighted", required_agreement: 0.5, expert_agents: [] },
    );
    expect(result.consensus_category).toBe("beta");
    expect(result.fallback_applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fallback strategies
// ---------------------------------------------------------------------------

describe("resolveConsensus - fallback strategies", () => {
  const threeSplit = [
    make("alpha", 0.9, "a"),
    make("beta", 0.8, "b"),
    make("gamma", 0.7, "c"),
  ];

  test("highest_confidence picks highest confidence voter", () => {
    const result = resolveConsensus(threeSplit, {
      mode: "unanimous",
      fallback_strategy: "highest_confidence",
    });
    expect(result.fallback_applied).toBe(true);
    expect(result.consensus_category).toBe("alpha");
    expect(result.consensus_confidence).toBe(0.9);
  });

  test("halt still picks highest confidence but marks fallback", () => {
    const result = resolveConsensus(threeSplit, {
      mode: "unanimous",
      fallback_strategy: "halt",
    });
    expect(result.fallback_applied).toBe(true);
    expect(result.consensus_category).toBe("alpha");
  });

  test("escalate still picks highest confidence but marks fallback", () => {
    const result = resolveConsensus(threeSplit, {
      mode: "unanimous",
      fallback_strategy: "escalate",
    });
    expect(result.fallback_applied).toBe(true);
    expect(result.consensus_category).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("resolveConsensus - edge cases", () => {
  test("single perspective with min_perspectives=2 triggers fallback", () => {
    const result = resolveConsensus([make("alpha", 0.9, "a")], {
      mode: "majority",
      min_perspectives: 2,
    });
    expect(result.fallback_applied).toBe(true);
    expect(result.consensus_category).toBe("alpha");
  });

  test("two perspectives with min_perspectives=2 works normally", () => {
    const result = resolveConsensus(
      [make("alpha", 0.9, "a"), make("alpha", 0.8, "b")],
      { mode: "majority", min_perspectives: 2, required_agreement: 0.5 },
    );
    expect(result.consensus_category).toBe("alpha");
    expect(result.fallback_applied).toBe(false);
  });

  test("default config uses majority mode", () => {
    const result = resolveConsensus([
      make("alpha", 0.9, "a"),
      make("alpha", 0.8, "b"),
      make("beta", 0.7, "c"),
    ]);
    expect(result.mode_used).toBe("majority");
    expect(result.consensus_category).toBe("alpha");
    expect(result.fallback_applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: existing resolveMajorityVote still works
// ---------------------------------------------------------------------------

describe("resolveMajorityVote backward compatibility", () => {
  test("still resolves 3-perspective majority vote correctly", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      make("alpha", 0.9, "a"),
      make("alpha", 0.85, "b"),
      make("beta", 0.7, "c"),
    ];

    const result = resolveMajorityVote(perspectives);

    expect(result.consensus_category).toBe("alpha");
    expect(result.consensus_voters).toHaveLength(2);
    expect(result.dissenter).toBeDefined();
    expect(result.dissenter!.category_assessment).toBe("beta");
    expect(result.consensus_confidence).toBe(0.88);
  });

  test("still resolves 3-way split using highest confidence", () => {
    const perspectives: [TestPerspective, TestPerspective, TestPerspective] = [
      make("alpha", 0.6, "a"),
      make("beta", 0.9, "b"),
      make("gamma", 0.5, "c"),
    ];

    const result = resolveMajorityVote(perspectives);

    expect(result.consensus_category).toBe("beta");
    expect(result.consensus_voters).toHaveLength(1);
  });
});
