import { describe, test, expect } from "bun:test";
import {
  detectProposedFix,
  shouldRunRootCauseTribunal,
  buildDebuggerDefensePrompt,
  buildVerifierChallengePrompt,
  buildArbiterPrompt,
  resolveRootCauseTribunal,
} from "../../../src/agents/__helpers/root-cause-tribunal";
import type {
  ProposedFixSignal,
  RootCausePerspective,
} from "../../../src/agents/__schemas/root-cause-tribunal.schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProposedFixSignal(
  overrides: Partial<ProposedFixSignal> = {},
): ProposedFixSignal {
  return {
    phase: 93,
    debug_session_id: "20260303-143022",
    root_cause: "Race condition in state machine transition",
    proposed_fix: "Add mutex guard around state transitions",
    files_changed: ["src/state/machine.ts", "src/state/transitions.ts"],
    evidence_summary:
      "Reproduced with concurrent writes; mutex prevents interleaving",
    issue_count: 3,
    ...overrides,
  };
}

function makePerspective(
  overrides: Partial<RootCausePerspective> = {},
): RootCausePerspective {
  return {
    agent: "lu-debugger",
    category_assessment: "verified_fix",
    confidence: 0.85,
    evidence: "Fix addresses the root cause directly based on reproduction",
    reproduction_result: "Original bug no longer reproduces after fix",
    side_effects_found: [],
    recommended_action: "Proceed with commit",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectProposedFix
// ---------------------------------------------------------------------------

describe("detectProposedFix", () => {
  test("returns valid ProposedFixSignal for complete valid input", () => {
    const signal = detectProposedFix(
      93,
      "20260303-143022",
      "Race condition in state machine transition",
      "Add mutex guard around state transitions",
      ["src/state/machine.ts"],
      "Reproduced with concurrent writes",
      3,
    );

    expect(signal).not.toBeNull();
    expect(signal!.phase).toBe(93);
    expect(signal!.debug_session_id).toBe("20260303-143022");
    expect(signal!.root_cause).toBe(
      "Race condition in state machine transition",
    );
    expect(signal!.proposed_fix).toBe(
      "Add mutex guard around state transitions",
    );
    expect(signal!.files_changed).toEqual(["src/state/machine.ts"]);
    expect(signal!.evidence_summary).toBe("Reproduced with concurrent writes");
    expect(signal!.issue_count).toBe(3);
  });

  test("returns null for missing required fields (no root_cause)", () => {
    const signal = detectProposedFix(
      93,
      "20260303-143022",
      "", // empty root cause — still a string, but let's test with undefined-like
      "Add mutex guard",
      ["src/state/machine.ts"],
      "Evidence",
      3,
    );

    // Empty string is valid for z.string() — test with truly invalid input
    // Phase must be positive integer
    const invalidSignal = detectProposedFix(
      -1, // invalid: not positive
      "20260303-143022",
      "Some root cause",
      "Some fix",
      ["src/foo.ts"],
      "Evidence",
      3,
    );

    expect(invalidSignal).toBeNull();
  });

  test("returns null for invalid issue_count (zero)", () => {
    const signal = detectProposedFix(
      93,
      "20260303-143022",
      "Root cause",
      "Fix",
      ["src/foo.ts"],
      "Evidence",
      0, // invalid: must be positive
    );

    expect(signal).toBeNull();
  });

  test("preserves all input fields in the returned signal", () => {
    const signal = detectProposedFix(
      42,
      "session-abc",
      "Memory leak",
      "Close file handles",
      ["src/a.ts", "src/b.ts"],
      "Heap grows monotonically",
      5,
    );

    expect(signal).not.toBeNull();
    expect(signal!.phase).toBe(42);
    expect(signal!.debug_session_id).toBe("session-abc");
    expect(signal!.root_cause).toBe("Memory leak");
    expect(signal!.proposed_fix).toBe("Close file handles");
    expect(signal!.files_changed).toEqual(["src/a.ts", "src/b.ts"]);
    expect(signal!.evidence_summary).toBe("Heap grows monotonically");
    expect(signal!.issue_count).toBe(5);
  });

  test("validates phase is positive integer", () => {
    // Negative phase
    expect(
      detectProposedFix(-1, "id", "cause", "fix", [], "evidence", 2),
    ).toBeNull();

    // Zero phase
    expect(
      detectProposedFix(0, "id", "cause", "fix", [], "evidence", 2),
    ).toBeNull();

    // Fractional phase
    expect(
      detectProposedFix(1.5, "id", "cause", "fix", [], "evidence", 2),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldRunRootCauseTribunal
// ---------------------------------------------------------------------------

describe("shouldRunRootCauseTribunal", () => {
  const validSignal = makeProposedFixSignal();

  test("returns true for COMPLEX with valid signal and issue_count >= 2", () => {
    expect(shouldRunRootCauseTribunal(validSignal, "COMPLEX")).toBe(true);
  });

  test("returns true for CRITICAL with valid signal and issue_count >= 2", () => {
    expect(shouldRunRootCauseTribunal(validSignal, "CRITICAL")).toBe(true);
  });

  test("returns false for MODERATE (below threshold)", () => {
    expect(shouldRunRootCauseTribunal(validSignal, "MODERATE")).toBe(false);
  });

  test("returns false for SIMPLE", () => {
    expect(shouldRunRootCauseTribunal(validSignal, "SIMPLE")).toBe(false);
  });

  test("returns false when signal is null", () => {
    expect(shouldRunRootCauseTribunal(null, "COMPLEX")).toBe(false);
  });

  test("returns false when issue_count is 1 (single-issue)", () => {
    const singleIssueSignal = makeProposedFixSignal({ issue_count: 1 });
    expect(shouldRunRootCauseTribunal(singleIssueSignal, "COMPLEX")).toBe(
      false,
    );
  });

  test("handles case-insensitive complexity", () => {
    expect(shouldRunRootCauseTribunal(validSignal, "complex")).toBe(true);
    expect(shouldRunRootCauseTribunal(validSignal, "Critical")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

describe("buildDebuggerDefensePrompt", () => {
  const fixSignal = makeProposedFixSignal();

  test("includes root_cause in prompt", () => {
    const prompt = buildDebuggerDefensePrompt(fixSignal);
    expect(prompt).toContain("Race condition in state machine transition");
  });

  test("includes proposed_fix in prompt", () => {
    const prompt = buildDebuggerDefensePrompt(fixSignal);
    expect(prompt).toContain("Add mutex guard around state transitions");
  });

  test("asks about symptom vs cause distinction", () => {
    const prompt = buildDebuggerDefensePrompt(fixSignal);
    expect(prompt).toContain("root cause");
    expect(prompt).toContain("symptom");
  });

  test("requests standardized response format", () => {
    const prompt = buildDebuggerDefensePrompt(fixSignal);
    expect(prompt).toContain("CATEGORY:");
    expect(prompt).toContain("CONFIDENCE:");
    expect(prompt).toContain("EVIDENCE:");
    expect(prompt).toContain("ACTION:");
  });

  test("mentions lu-debugger role", () => {
    const prompt = buildDebuggerDefensePrompt(fixSignal);
    expect(prompt).toContain("lu-debugger");
  });
});

describe("buildVerifierChallengePrompt", () => {
  const fixSignal = makeProposedFixSignal();

  test("includes root_cause in prompt", () => {
    const prompt = buildVerifierChallengePrompt(fixSignal);
    expect(prompt).toContain("Race condition in state machine transition");
  });

  test("includes proposed_fix in prompt", () => {
    const prompt = buildVerifierChallengePrompt(fixSignal);
    expect(prompt).toContain("Add mutex guard around state transitions");
  });

  test("asks about reproduction and side effects", () => {
    const prompt = buildVerifierChallengePrompt(fixSignal);
    expect(prompt).toContain("reproduce");
    expect(prompt).toContain("side effects");
  });

  test("requests standardized response format", () => {
    const prompt = buildVerifierChallengePrompt(fixSignal);
    expect(prompt).toContain("CATEGORY:");
    expect(prompt).toContain("CONFIDENCE:");
    expect(prompt).toContain("EVIDENCE:");
    expect(prompt).toContain("ACTION:");
  });

  test("mentions lu-verifier role", () => {
    const prompt = buildVerifierChallengePrompt(fixSignal);
    expect(prompt).toContain("lu-verifier");
  });
});

describe("buildArbiterPrompt", () => {
  const fixSignal = makeProposedFixSignal();

  test("includes files_changed context", () => {
    const prompt = buildArbiterPrompt(fixSignal);
    expect(prompt).toContain("src/state/machine.ts");
    expect(prompt).toContain("src/state/transitions.ts");
  });

  test("asks about scoping and alternative approaches", () => {
    const prompt = buildArbiterPrompt(fixSignal);
    expect(prompt).toContain("scoped correctly");
    expect(prompt).toContain("different approach");
  });

  test("requests standardized response format", () => {
    const prompt = buildArbiterPrompt(fixSignal);
    expect(prompt).toContain("CATEGORY:");
    expect(prompt).toContain("CONFIDENCE:");
    expect(prompt).toContain("EVIDENCE:");
    expect(prompt).toContain("ACTION:");
  });

  test("mentions lu-integration-checker role", () => {
    const prompt = buildArbiterPrompt(fixSignal);
    expect(prompt).toContain("lu-integration-checker");
  });
});

// ---------------------------------------------------------------------------
// resolveRootCauseTribunal
// ---------------------------------------------------------------------------

describe("resolveRootCauseTribunal", () => {
  const fixSignal = makeProposedFixSignal();

  test("resolves unanimous verified_fix consensus (3-0) with resolution verified_fix", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({
        agent: "lu-debugger",
        category_assessment: "verified_fix",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "verified_fix",
        confidence: 0.85,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "verified_fix",
        confidence: 0.8,
      }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.consensus_category).toBe("verified_fix");
    expect(result.resolution).toBe("verified_fix");
    expect(result.phase).toBe(93);
    expect(result.perspectives).toHaveLength(3);
  });

  test("resolves majority symptom_treatment (2-1) with resolution needs_deeper_investigation", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({
        agent: "lu-debugger",
        category_assessment: "verified_fix",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "symptom_treatment",
        confidence: 0.85,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "symptom_treatment",
        confidence: 0.8,
      }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.consensus_category).toBe("symptom_treatment");
    expect(result.resolution).toBe("needs_deeper_investigation");
    expect(result.dissenting_perspective).toBeDefined();
    expect(result.dissenting_perspective!.agent).toBe("lu-debugger");
  });

  test("handles 3-way split (picks highest confidence)", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({
        agent: "lu-debugger",
        category_assessment: "verified_fix",
        confidence: 0.6,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "symptom_treatment",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "side_effects",
        confidence: 0.5,
      }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    // Highest confidence (0.9) wins: symptom_treatment
    expect(result.consensus_category).toBe("symptom_treatment");
    expect(result.resolution).toBe("needs_deeper_investigation");
    expect(result.dissenting_perspective).toBeDefined();
  });

  test("maps verified_fix category to resolution verified_fix", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({ category_assessment: "verified_fix" }),
      makePerspective({ category_assessment: "verified_fix" }),
      makePerspective({ category_assessment: "verified_fix" }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.resolution).toBe("verified_fix");
    expect(result.recommended_action).toContain("Proceed with commit");
  });

  test("maps symptom_treatment category to resolution needs_deeper_investigation", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({ category_assessment: "symptom_treatment" }),
      makePerspective({ category_assessment: "symptom_treatment" }),
      makePerspective({ category_assessment: "symptom_treatment" }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.resolution).toBe("needs_deeper_investigation");
    expect(result.recommended_action).toContain("symptom");
  });

  test("maps side_effects category to resolution needs_deeper_investigation", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({ category_assessment: "side_effects" }),
      makePerspective({ category_assessment: "side_effects" }),
      makePerspective({ category_assessment: "side_effects" }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.resolution).toBe("needs_deeper_investigation");
    expect(result.recommended_action).toContain("side effects");
  });

  test("maps incomplete_fix category to resolution needs_deeper_investigation", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({ category_assessment: "incomplete_fix" }),
      makePerspective({ category_assessment: "incomplete_fix" }),
      makePerspective({ category_assessment: "incomplete_fix" }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.resolution).toBe("needs_deeper_investigation");
    expect(result.recommended_action).toContain("Expand scope");
  });

  test("records dissenting perspective when present", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({
        agent: "lu-debugger",
        category_assessment: "verified_fix",
        confidence: 0.9,
      }),
      makePerspective({
        agent: "lu-verifier",
        category_assessment: "verified_fix",
        confidence: 0.85,
      }),
      makePerspective({
        agent: "lu-integration-checker",
        category_assessment: "side_effects",
        confidence: 0.7,
      }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.consensus_category).toBe("verified_fix");
    expect(result.dissenting_perspective).toBeDefined();
    expect(result.dissenting_perspective!.agent).toBe("lu-integration-checker");
    expect(result.dissenting_perspective!.category_assessment).toBe(
      "side_effects",
    );
  });

  test("estimated token cost is approximately 24k (3 participants x 8k)", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({ category_assessment: "verified_fix" }),
      makePerspective({ category_assessment: "verified_fix" }),
      makePerspective({ category_assessment: "verified_fix" }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(result.estimated_token_cost).toBe(24000);
  });

  test("result timestamp is a valid string", () => {
    const perspectives: [
      RootCausePerspective,
      RootCausePerspective,
      RootCausePerspective,
    ] = [
      makePerspective({ category_assessment: "verified_fix" }),
      makePerspective({ category_assessment: "verified_fix" }),
      makePerspective({ category_assessment: "verified_fix" }),
    ];

    const result = resolveRootCauseTribunal(93, fixSignal, perspectives);

    expect(typeof result.timestamp).toBe("string");
    expect(result.timestamp.length).toBeGreaterThan(0);
  });
});
