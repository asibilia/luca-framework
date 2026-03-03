import { describe, test, expect } from "bun:test";
import {
  detectVerdictSplits,
  buildDissenterPrompt,
  buildMajorityResponsePrompt,
  buildSplitVerdictResult,
  formatSplitVerdictForPR,
} from "../../../src/skills/__helpers/pr-verdict-debate";
import type {
  ValidatorVerdict,
  VerdictSplit,
  VerdictRebuttal,
} from "../../../src/skills/__schemas/pr-verdict-debate.schemas";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeVerdict(
  overrides: Partial<ValidatorVerdict> = {},
): ValidatorVerdict {
  return {
    comment_id: "c-1",
    agent: "dx-advocate",
    valid: true,
    reasoning: "This is a valid concern",
    severity: "medium",
    ...overrides,
  };
}

function makeSplit(overrides: Partial<VerdictSplit> = {}): VerdictSplit {
  return {
    comment_id: "c-1",
    comment_text: "You should use dependency injection here",
    valid_count: 3,
    invalid_count: 3,
    valid_verdicts: [
      makeVerdict({ agent: "security-auditor", valid: true }),
      makeVerdict({ agent: "code-architect", valid: true }),
      makeVerdict({ agent: "dx-advocate", valid: true }),
    ],
    invalid_verdicts: [
      makeVerdict({ agent: "performance-auditor", valid: false }),
      makeVerdict({ agent: "lu-pr-reviewer", valid: false }),
      makeVerdict({ agent: "ux", valid: false }),
    ],
    split_ratio: "3-3",
    is_tie: true,
    ...overrides,
  };
}

function makeRebuttal(
  overrides: Partial<VerdictRebuttal> = {},
): VerdictRebuttal {
  return {
    comment_id: "c-1",
    dissenter_agent: "performance-auditor",
    dissenter_position: "invalid",
    dissent_argument: "The concern is not applicable in this context",
    majority_response: "The concern is valid because of X, Y, Z",
    resolution: "majority_upheld",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectVerdictSplits
// ---------------------------------------------------------------------------

describe("detectVerdictSplits", () => {
  const commentTexts = new Map([
    ["c-1", "You should use dependency injection here"],
    ["c-2", "Missing null check on user input"],
  ]);

  test("returns empty array when no verdicts provided", () => {
    const result = detectVerdictSplits([], commentTexts);
    expect(result).toHaveLength(0);
  });

  test("returns empty array when all comments have clear majority (5-1)", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a6", valid: false }),
    ];

    // 5-1 → majority ratio = 5/6 ≈ 0.833 > 0.6 → not a split
    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(0);
  });

  test("detects ties (3-3)", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a6", valid: false }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(1);
    expect(result[0]!.is_tie).toBe(true);
    expect(result[0]!.split_ratio).toBe("3-3");
    expect(result[0]!.valid_count).toBe(3);
    expect(result[0]!.invalid_count).toBe(3);
  });

  test("detects narrow splits (3-2 with threshold 0.6)", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: false }),
    ];

    // 3-2 → majority ratio = 3/5 = 0.6 → at threshold → IS a split
    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(1);
    expect(result[0]!.is_tie).toBe(false);
    expect(result[0]!.split_ratio).toBe("3-2");
  });

  test("does NOT detect 4-2 as split with default threshold 0.6", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a6", valid: false }),
    ];

    // 4-2 → majority ratio = 4/6 ≈ 0.667 > 0.6 → NOT a split
    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(0);
  });

  test("handles single validator (no split possible)", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(0);
  });

  test("handles all-agree (6-0, no split)", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a6", valid: true }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(0);
  });

  test("handles all-disagree (0-6, no split)", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a6", valid: false }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(0);
  });

  test("correctly separates valid vs invalid verdicts", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({
        comment_id: "c-1",
        agent: "security-auditor",
        valid: true,
        reasoning: "Security concern is real",
      }),
      makeVerdict({
        comment_id: "c-1",
        agent: "code-architect",
        valid: true,
        reasoning: "Architecture issue confirmed",
      }),
      makeVerdict({
        comment_id: "c-1",
        agent: "dx-advocate",
        valid: false,
        reasoning: "Not a DX concern",
      }),
      makeVerdict({
        comment_id: "c-1",
        agent: "performance-auditor",
        valid: false,
        reasoning: "No perf impact",
      }),
    ];

    // 2-2 → tie
    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(1);
    expect(result[0]!.valid_verdicts).toHaveLength(2);
    expect(result[0]!.invalid_verdicts).toHaveLength(2);
    expect(result[0]!.valid_verdicts[0]!.agent).toBe("security-auditor");
    expect(result[0]!.invalid_verdicts[0]!.agent).toBe("dx-advocate");
  });

  test("handles multiple comments with mixed splits", () => {
    const verdicts: ValidatorVerdict[] = [
      // Comment c-1: 2-2 tie → split
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: false }),
      // Comment c-2: 4-0 → no split
      makeVerdict({ comment_id: "c-2", agent: "b1", valid: true }),
      makeVerdict({ comment_id: "c-2", agent: "b2", valid: true }),
      makeVerdict({ comment_id: "c-2", agent: "b3", valid: true }),
      makeVerdict({ comment_id: "c-2", agent: "b4", valid: true }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(1);
    expect(result[0]!.comment_id).toBe("c-1");
  });

  test("uses comment text from map", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: false }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(1);
    expect(result[0]!.comment_text).toBe(
      "You should use dependency injection here",
    );
  });

  test("uses empty string for missing comment text", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-unknown", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-unknown", agent: "a2", valid: false }),
    ];

    const result = detectVerdictSplits(verdicts, commentTexts);
    expect(result).toHaveLength(1);
    expect(result[0]!.comment_text).toBe("");
  });

  test("respects custom threshold", () => {
    const verdicts: ValidatorVerdict[] = [
      makeVerdict({ comment_id: "c-1", agent: "a1", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a2", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a3", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a4", valid: true }),
      makeVerdict({ comment_id: "c-1", agent: "a5", valid: false }),
      makeVerdict({ comment_id: "c-1", agent: "a6", valid: false }),
    ];

    // 4-2 → majority ratio = 0.667
    // With threshold 0.7, this IS a split
    const resultWithHighThreshold = detectVerdictSplits(
      verdicts,
      commentTexts,
      0.7,
    );
    expect(resultWithHighThreshold).toHaveLength(1);

    // With default threshold 0.6, this is NOT a split
    const resultWithDefault = detectVerdictSplits(verdicts, commentTexts);
    expect(resultWithDefault).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildDissenterPrompt
// ---------------------------------------------------------------------------

describe("buildDissenterPrompt", () => {
  test("includes comment text", () => {
    const split = makeSplit();
    const prompt = buildDissenterPrompt(split);
    expect(prompt).toContain("You should use dependency injection here");
  });

  test("includes reasoning from both sides", () => {
    const split = makeSplit({
      valid_verdicts: [
        makeVerdict({
          agent: "security-auditor",
          valid: true,
          reasoning: "This improves security posture",
        }),
      ],
      invalid_verdicts: [
        makeVerdict({
          agent: "performance-auditor",
          valid: false,
          reasoning: "No performance benefit",
        }),
      ],
      valid_count: 1,
      invalid_count: 1,
    });

    const prompt = buildDissenterPrompt(split);
    expect(prompt).toContain("This improves security posture");
    expect(prompt).toContain("No performance benefit");
  });

  test("identifies majority and minority positions", () => {
    const split = makeSplit({
      valid_count: 4,
      invalid_count: 2,
      is_tie: false,
    });

    const prompt = buildDissenterPrompt(split);
    expect(prompt).toContain("Majority Position (4 validators)");
    expect(prompt).toContain("Your Position (2 validators)");
    expect(prompt).toContain("The concern is valid");
  });

  test("handles tie with equal validator counts", () => {
    const split = makeSplit({
      valid_count: 3,
      invalid_count: 3,
      is_tie: true,
    });

    const prompt = buildDissenterPrompt(split);
    expect(prompt).toContain("(3 validators)");
  });

  test("produces well-formed string without undefined values", () => {
    const split = makeSplit();
    const prompt = buildDissenterPrompt(split);
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("null");
    expect(prompt.length).toBeGreaterThan(50);
  });

  test("asks for 2-3 sentence argument", () => {
    const split = makeSplit();
    const prompt = buildDissenterPrompt(split);
    expect(prompt).toContain("2-3 sentences");
  });
});

// ---------------------------------------------------------------------------
// buildMajorityResponsePrompt
// ---------------------------------------------------------------------------

describe("buildMajorityResponsePrompt", () => {
  test("includes dissenter argument", () => {
    const split = makeSplit();
    const dissenterArgument =
      "The dependency injection pattern adds unnecessary complexity here";
    const prompt = buildMajorityResponsePrompt(split, dissenterArgument);
    expect(prompt).toContain(dissenterArgument);
  });

  test("includes comment text", () => {
    const split = makeSplit();
    const prompt = buildMajorityResponsePrompt(split, "Some argument");
    expect(prompt).toContain("You should use dependency injection here");
  });

  test("includes resolution format instructions", () => {
    const split = makeSplit();
    const prompt = buildMajorityResponsePrompt(split, "Some argument");
    expect(prompt).toContain("RESOLUTION:");
    expect(prompt).toContain("majority_upheld");
    expect(prompt).toContain("dissent_acknowledged");
    expect(prompt).toContain("escalate_to_human");
  });

  test("identifies majority position and count", () => {
    const split = makeSplit({
      valid_count: 4,
      invalid_count: 2,
    });
    const prompt = buildMajorityResponsePrompt(split, "Some argument");
    expect(prompt).toContain("Your Position (4 validators)");
    expect(prompt).toContain("The concern is valid");
  });

  test("produces well-formed string without undefined values", () => {
    const split = makeSplit();
    const prompt = buildMajorityResponsePrompt(split, "Argument text");
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("null");
    expect(prompt.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// buildSplitVerdictResult
// ---------------------------------------------------------------------------

describe("buildSplitVerdictResult", () => {
  test("returns 'fix' when majority says valid and is upheld", () => {
    const split = makeSplit({
      valid_count: 4,
      invalid_count: 2,
      is_tie: false,
    });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.final_recommendation).toBe("fix");
  });

  test("returns 'disagree' when majority says invalid and is upheld", () => {
    const split = makeSplit({
      valid_count: 2,
      invalid_count: 4,
      is_tie: false,
      valid_verdicts: [
        makeVerdict({ agent: "a1", valid: true }),
        makeVerdict({ agent: "a2", valid: true }),
      ],
      invalid_verdicts: [
        makeVerdict({ agent: "b1", valid: false }),
        makeVerdict({ agent: "b2", valid: false }),
        makeVerdict({ agent: "b3", valid: false }),
        makeVerdict({ agent: "b4", valid: false }),
      ],
    });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.final_recommendation).toBe("disagree");
  });

  test("returns 'defer_to_human' when dissent acknowledged", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "dissent_acknowledged" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.final_recommendation).toBe("defer_to_human");
  });

  test("returns 'defer_to_human' when escalated", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "escalate_to_human" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.final_recommendation).toBe("defer_to_human");
  });

  test("confidence is 0.5 for ties with majority upheld", () => {
    const split = makeSplit({
      valid_count: 3,
      invalid_count: 3,
      is_tie: true,
    });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
  });

  test("confidence is 0.65 for narrow splits with majority upheld", () => {
    const split = makeSplit({
      valid_count: 3,
      invalid_count: 2,
      is_tie: false,
    });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.65);
  });

  test("confidence reduced by 0.1 when dissent acknowledged", () => {
    const split = makeSplit({
      valid_count: 3,
      invalid_count: 3,
      is_tie: true,
    });
    const rebuttals = [makeRebuttal({ resolution: "dissent_acknowledged" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    // tie base 0.5 - 0.1 = 0.4
    expect(result!.confidence).toBe(0.4);
  });

  test("confidence is 0.3 when escalated to human", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "escalate_to_human" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.3);
  });

  test("includes both_perspectives_summary", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.both_perspectives_summary).toContain("3-3 split");
    expect(result!.both_perspectives_summary).toContain("validators");
  });

  test("preserves comment metadata", () => {
    const split = makeSplit({
      comment_id: "c-42",
      comment_text: "Test comment",
      split_ratio: "2-2",
    });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];

    const result = buildSplitVerdictResult(split, rebuttals);
    expect(result).not.toBeNull();
    expect(result!.comment_id).toBe("c-42");
    expect(result!.comment_text).toBe("Test comment");
    expect(result!.split_ratio).toBe("2-2");
  });

  test("handles empty rebuttals array", () => {
    const split = makeSplit();

    // Empty rebuttals → allUpheld is vacuously true (every() on empty = true)
    // majority is valid → "fix"
    const result = buildSplitVerdictResult(split, []);
    expect(result).not.toBeNull();
    expect(result!.final_recommendation).toBe("fix");
    expect(result!.rebuttals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatSplitVerdictForPR
// ---------------------------------------------------------------------------

describe("formatSplitVerdictForPR", () => {
  test("generates valid markdown", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];
    const result = buildSplitVerdictResult(split, rebuttals);

    const markdown = formatSplitVerdictForPR(result!);
    expect(markdown).toContain("**Split Verdict");
    expect(markdown).toContain("**Resolution:**");
  });

  test("includes split ratio", () => {
    const split = makeSplit({ split_ratio: "3-3" });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];
    const result = buildSplitVerdictResult(split, rebuttals);

    const markdown = formatSplitVerdictForPR(result!);
    expect(markdown).toContain("3-3");
  });

  test("includes confidence value", () => {
    const split = makeSplit({ is_tie: true });
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];
    const result = buildSplitVerdictResult(split, rebuttals);

    const markdown = formatSplitVerdictForPR(result!);
    expect(markdown).toContain("confidence: 0.50");
  });

  test("includes both perspectives summary", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "majority_upheld" })];
    const result = buildSplitVerdictResult(split, rebuttals);

    const markdown = formatSplitVerdictForPR(result!);
    expect(markdown).toContain("validators");
    expect(markdown).toContain("split");
  });

  test("includes rebuttal details when present", () => {
    const split = makeSplit();
    const rebuttals = [
      makeRebuttal({
        dissenter_agent: "performance-auditor",
        dissent_argument: "Performance impact is negligible",
        majority_response: "Security outweighs performance here",
        resolution: "majority_upheld",
      }),
    ];
    const result = buildSplitVerdictResult(split, rebuttals);

    const markdown = formatSplitVerdictForPR(result!);
    expect(markdown).toContain("performance-auditor");
    expect(markdown).toContain("Performance impact is negligible");
    expect(markdown).toContain("Security outweighs performance here");
  });

  test("shows human-readable resolution label", () => {
    const split = makeSplit();
    const rebuttals = [makeRebuttal({ resolution: "escalate_to_human" })];
    const result = buildSplitVerdictResult(split, rebuttals);

    const markdown = formatSplitVerdictForPR(result!);
    expect(markdown).toContain("escalate to human");
  });
});
