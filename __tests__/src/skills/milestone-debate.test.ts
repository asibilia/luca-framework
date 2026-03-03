import { describe, test, expect } from "bun:test";

import {
  milestoneDebateConfigSchema,
  milestoneDebateResultSchema,
} from "../../../src/skills/__schemas/milestone-debate.schemas";
import type { MilestoneDebateConfig } from "../../../src/skills/__schemas/milestone-debate.schemas";
import {
  shouldRunMilestoneDebate,
  buildMilestoneRebuttalContext,
  buildMilestoneDebateResult,
} from "../../../src/skills/__helpers/milestone-debate";
import { normalizeFindings } from "../../../src/shared/__helpers/tribunal-detector";
import { resolveRebuttals } from "../../../src/shared/__helpers/tribunal-rebuttals";
import type {
  ReviewFinding,
  Disagreement,
  Rebuttal,
} from "../../../src/shared/__schemas/tribunal.schemas";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    severity: "HIGH",
    file: "src/foo.ts",
    line: 42,
    issue: "Some issue",
    suggestion: "Fix it",
    source_agent: "dx-advocate",
    ...overrides,
  };
}

function makeDisagreement(overrides: Partial<Disagreement> = {}): Disagreement {
  return {
    id: "disagreement-1",
    file: "src/foo.ts",
    line: 42,
    conflicting_findings: [
      makeFinding({
        id: "f-high",
        severity: "HIGH",
        source_agent: "dx-advocate",
        issue: "DX issue",
      }),
      makeFinding({
        id: "f-low",
        severity: "LOW",
        source_agent: "code-simplifier",
        issue: "Simplifier issue",
      }),
    ],
    conflict_type: "severity_mismatch",
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<MilestoneDebateConfig> = {},
): MilestoneDebateConfig {
  return milestoneDebateConfigSchema.parse({
    enabled: true,
    min_complexity: "COMPLEX",
    max_rebuttal_rounds: 1,
    token_budget: 40000,
    ...overrides,
  });
}

// Reviewer outputs that produce disagreements (same file:line, different severities)
function makeDisagreeingReviewerOutputs(): Record<string, unknown> {
  return {
    "dx-advocate": [
      {
        severity: "HIGH",
        file: "src/foo.ts",
        line: 42,
        issue: "Bad naming convention",
        suggestion: "Use camelCase",
      },
    ],
    "code-simplifier": [
      {
        severity: "LOW",
        file: "src/foo.ts",
        line: 42,
        issue: "Minor style issue",
        suggestion: "Optional cleanup",
      },
    ],
  };
}

// Reviewer outputs that produce no disagreements
function makeAgreeingReviewerOutputs(): Record<string, unknown> {
  return {
    "dx-advocate": [
      {
        severity: "HIGH",
        file: "src/foo.ts",
        line: 10,
        issue: "Issue A",
      },
    ],
    "code-simplifier": [
      {
        severity: "HIGH",
        file: "src/bar.ts",
        line: 20,
        issue: "Issue B",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("milestoneDebateConfigSchema", () => {
  test("validates correctly with all defaults", () => {
    const result = milestoneDebateConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
      expect(result.data.min_complexity).toBe("COMPLEX");
      expect(result.data.max_rebuttal_rounds).toBe(1);
      expect(result.data.token_budget).toBe(40000);
    }
  });

  test("accepts valid explicit values", () => {
    const result = milestoneDebateConfigSchema.safeParse({
      enabled: true,
      min_complexity: "CRITICAL",
      max_rebuttal_rounds: 3,
      token_budget: 80000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.min_complexity).toBe("CRITICAL");
      expect(result.data.max_rebuttal_rounds).toBe(3);
      expect(result.data.token_budget).toBe(80000);
    }
  });

  test("rejects invalid min_complexity values", () => {
    const result = milestoneDebateConfigSchema.safeParse({
      min_complexity: "INVALID_LEVEL",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-positive max_rebuttal_rounds", () => {
    const result = milestoneDebateConfigSchema.safeParse({
      max_rebuttal_rounds: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-positive token_budget", () => {
    const result = milestoneDebateConfigSchema.safeParse({
      token_budget: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("milestoneDebateResultSchema", () => {
  test("includes all required fields", () => {
    const result = milestoneDebateResultSchema.safeParse({
      milestone_version: "v2.5.1",
      reviewer_count: 5,
      cross_phase_disagreements: 2,
      tribunal_result: {
        phase: 92,
        total_findings: 10,
        disagreements_detected: 3,
        rebuttals_conducted: 2,
        findings_withdrawn: 1,
        findings_modified: 1,
        unified_recommendations: [],
        debate_token_cost: 800,
        timestamp: new Date().toISOString(),
      },
      consensus_summary: "Test summary.",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const result = milestoneDebateResultSchema.safeParse({
      milestone_version: "v2.5.1",
      // missing other required fields
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gate tests
// ---------------------------------------------------------------------------

describe("shouldRunMilestoneDebate", () => {
  test("returns false when config.enabled is false", () => {
    const config = makeConfig({ enabled: false });
    const result = shouldRunMilestoneDebate(
      config,
      "COMPLEX",
      makeDisagreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  test("returns false when complexity is below threshold", () => {
    const config = makeConfig({ min_complexity: "COMPLEX" });
    const result = shouldRunMilestoneDebate(
      config,
      "MODERATE",
      makeDisagreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(false);
    expect(result.reason).toContain("below minimum threshold");
  });

  test("returns false when complexity is SIMPLE", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(
      config,
      "SIMPLE",
      makeDisagreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(false);
  });

  test("returns false when no findings exist (empty reviewers)", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(config, "COMPLEX", {
      "dx-advocate": [],
      "code-simplifier": [],
    });
    expect(result.should_run).toBe(false);
    expect(result.reason).toContain("No findings");
  });

  test("returns false when no disagreements found", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(
      config,
      "COMPLEX",
      makeAgreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(false);
    expect(result.reason).toContain("No disagreements");
  });

  test("returns false when disagreements are LOW/MEDIUM only", () => {
    const config = makeConfig();
    const outputs = {
      "dx-advocate": [
        {
          severity: "MEDIUM",
          file: "src/foo.ts",
          line: 42,
          issue: "Medium issue",
        },
      ],
      "code-simplifier": [
        {
          severity: "LOW",
          file: "src/foo.ts",
          line: 42,
          issue: "Low issue",
        },
      ],
    };
    const result = shouldRunMilestoneDebate(config, "COMPLEX", outputs);
    expect(result.should_run).toBe(false);
    expect(result.reason).toContain("none involve CRITICAL or HIGH");
  });

  test("returns true when all conditions met (enabled, COMPLEX, HIGH disagreements)", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(
      config,
      "COMPLEX",
      makeDisagreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(true);
    expect(result.reason).toContain("disagreement(s)");
  });

  test("returns true for CRITICAL complexity", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(
      config,
      "CRITICAL",
      makeDisagreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(true);
  });

  test("is case-insensitive for complexity", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(
      config,
      "complex",
      makeDisagreeingReviewerOutputs(),
    );
    expect(result.should_run).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Orchestration tests
// ---------------------------------------------------------------------------

describe("buildMilestoneRebuttalContext", () => {
  test("generates augmented prompt pairs", () => {
    const disagreements = [makeDisagreement()];
    const prompts = buildMilestoneRebuttalContext(disagreements, "v2.5.1");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.challenger_prompt).toContain("Milestone v2.5.1");
    expect(prompts[0]!.challenger_prompt).toContain("cross-phase");
    expect(prompts[0]!.defender_prompt).toContain("Milestone v2.5.1");
    expect(prompts[0]!.defender_prompt).toContain("cross-phase");
  });

  test("preserves original prompt pair metadata", () => {
    const disagreements = [makeDisagreement()];
    const prompts = buildMilestoneRebuttalContext(disagreements, "v2.5.1");

    expect(prompts[0]!.disagreement_id).toBe("disagreement-1");
    expect(prompts[0]!.defender_agent).toBeTruthy();
    expect(prompts[0]!.challenger_agent).toBeTruthy();
  });

  test("handles empty disagreements", () => {
    const prompts = buildMilestoneRebuttalContext([], "v2.5.1");
    expect(prompts).toHaveLength(0);
  });

  test("generates prompts for multiple disagreements", () => {
    const disagreements = [
      makeDisagreement({ id: "d-1" }),
      makeDisagreement({ id: "d-2" }),
    ];
    const prompts = buildMilestoneRebuttalContext(disagreements, "v2.5.1");
    expect(prompts).toHaveLength(2);
  });
});

describe("buildMilestoneDebateResult", () => {
  test("correctly counts cross-phase disagreements", () => {
    // Findings in different directories = cross-phase
    const crossPhaseDisagreement = makeDisagreement({
      conflicting_findings: [
        makeFinding({
          id: "f-1",
          file: "src/agents/foo.ts",
          source_agent: "dx-advocate",
        }),
        makeFinding({
          id: "f-2",
          file: "src/skills/bar.ts",
          source_agent: "code-simplifier",
        }),
      ],
    });

    // Findings in same directory = same phase
    const samePhaseDisagreement = makeDisagreement({
      id: "d-2",
      conflicting_findings: [
        makeFinding({
          id: "f-3",
          file: "src/agents/a.ts",
          source_agent: "dx-advocate",
        }),
        makeFinding({
          id: "f-4",
          file: "src/agents/b.ts",
          source_agent: "code-architect",
        }),
      ],
    });

    const allFindings = [
      ...crossPhaseDisagreement.conflicting_findings,
      ...samePhaseDisagreement.conflicting_findings,
    ];
    const disagreements = [crossPhaseDisagreement, samePhaseDisagreement];

    const result = buildMilestoneDebateResult(
      "v2.5.1",
      5,
      allFindings,
      disagreements,
      [],
      resolveRebuttals(allFindings, []),
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.cross_phase_disagreements).toBe(1);
  });

  test("generates consensus summary from unified recommendations", () => {
    const findings = [makeFinding({ id: "f-1" }), makeFinding({ id: "f-2" })];
    const disagreements = [makeDisagreement()];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "Not important",
        defender_response: "It is important",
        resolution: "upheld",
      },
    ];
    const recommendations = resolveRebuttals(findings, rebuttals);

    const result = buildMilestoneDebateResult(
      "v2.5.1",
      5,
      findings,
      disagreements,
      rebuttals,
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.consensus_summary).toContain("disagreement(s)");
    expect(result!.consensus_summary).toContain("upheld");
  });

  test("includes correct milestone metadata", () => {
    const findings = [makeFinding({ id: "f-1" })];
    const recommendations = resolveRebuttals(findings, []);

    const result = buildMilestoneDebateResult(
      "v2.5.1",
      5,
      findings,
      [],
      [],
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.milestone_version).toBe("v2.5.1");
    expect(result!.reviewer_count).toBe(5);
    expect(result!.tribunal_result.phase).toBe(92);
  });

  test("consensus summary indicates no disagreements when empty", () => {
    const findings = [makeFinding({ id: "f-1" })];
    const recommendations = resolveRebuttals(findings, []);

    const result = buildMilestoneDebateResult(
      "v2.5.1",
      5,
      findings,
      [],
      [],
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.consensus_summary).toContain("No disagreements");
    expect(result!.consensus_summary).toContain("consensus");
  });

  test("handles withdrawn findings in summary", () => {
    const findings = [makeFinding({ id: "f-1" }), makeFinding({ id: "f-2" })];
    const disagreements = [makeDisagreement()];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "Not an issue",
        defender_response: "Withdrawing",
        resolution: "withdrawn",
      },
    ];
    const recommendations = resolveRebuttals(findings, rebuttals);

    const result = buildMilestoneDebateResult(
      "v2.5.1",
      5,
      findings,
      disagreements,
      rebuttals,
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.consensus_summary).toContain("withdrawn");
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("full pipeline integration", () => {
  test("reviewer outputs -> normalize -> detect -> rebuttal prompts -> resolve -> debate result", () => {
    const outputs = makeDisagreeingReviewerOutputs();

    // Step 1: Normalize
    const findings = normalizeFindings(outputs);
    expect(findings.length).toBeGreaterThan(0);

    // Step 2: Gate check
    const config = makeConfig();
    const gateResult = shouldRunMilestoneDebate(config, "COMPLEX", outputs);
    expect(gateResult.should_run).toBe(true);

    // Step 3: Build rebuttal prompts
    // Use findings to detect disagreements for prompts
    const {
      detectDisagreements,
    } = require("../../../src/shared/__helpers/tribunal-detector");
    const disagreements = detectDisagreements(findings);
    const prompts = buildMilestoneRebuttalContext(disagreements, "v2.5.1");
    expect(prompts.length).toBeGreaterThan(0);

    // Step 4: Simulate rebuttal responses
    const rebuttals: Rebuttal[] = prompts.map((p) => ({
      finding_id: p.finding_id,
      challenger_agent: p.challenger_agent,
      challenge: "Challenge argument",
      defender_response: "Defense argument",
      resolution: "upheld" as const,
    }));

    // Step 5: Resolve and build result
    const recommendations = resolveRebuttals(findings, rebuttals);
    const result = buildMilestoneDebateResult(
      "v2.5.1",
      2,
      findings,
      disagreements,
      rebuttals,
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.milestone_version).toBe("v2.5.1");
    expect(result!.reviewer_count).toBe(2);
    expect(result!.tribunal_result.total_findings).toBe(findings.length);
    expect(result!.tribunal_result.rebuttals_conducted).toBe(rebuttals.length);
    expect(result!.consensus_summary).toBeTruthy();
  });

  test("empty disagreements produce no debate activity", () => {
    const outputs = makeAgreeingReviewerOutputs();
    const config = makeConfig();

    const gateResult = shouldRunMilestoneDebate(config, "COMPLEX", outputs);
    expect(gateResult.should_run).toBe(false);

    // Even if we force building a result with no disagreements
    const findings = normalizeFindings(outputs);
    const recommendations = resolveRebuttals(findings, []);
    const result = buildMilestoneDebateResult(
      "v2.5.1",
      2,
      findings,
      [],
      [],
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.tribunal_result.disagreements_detected).toBe(0);
    expect(result!.tribunal_result.rebuttals_conducted).toBe(0);
    expect(result!.tribunal_result.findings_withdrawn).toBe(0);
    expect(result!.tribunal_result.findings_modified).toBe(0);
    expect(result!.consensus_summary).toContain("No disagreements");
  });

  test("debate result aggregates counts correctly", () => {
    const findings = [
      makeFinding({ id: "f-1", source_agent: "dx-advocate" }),
      makeFinding({ id: "f-2", source_agent: "code-simplifier" }),
      makeFinding({ id: "f-3", source_agent: "code-architect" }),
    ];
    const disagreements = [makeDisagreement()];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "C1",
        defender_response: "D1",
        resolution: "upheld",
      },
      {
        finding_id: "f-2",
        challenger_agent: "dx-advocate",
        challenge: "C2",
        defender_response: "D2",
        resolution: "withdrawn",
      },
      {
        finding_id: "f-3",
        challenger_agent: "dx-advocate",
        challenge: "C3",
        defender_response: "D3",
        resolution: "modified",
      },
    ];
    const recommendations = resolveRebuttals(findings, rebuttals);

    const result = buildMilestoneDebateResult(
      "v2.5.1",
      3,
      findings,
      disagreements,
      rebuttals,
      recommendations,
      92,
    );

    expect(result).not.toBeNull();
    expect(result!.tribunal_result.total_findings).toBe(3);
    expect(result!.tribunal_result.rebuttals_conducted).toBe(3);
    expect(result!.tribunal_result.findings_withdrawn).toBe(1);
    expect(result!.tribunal_result.findings_modified).toBe(1);
    expect(result!.tribunal_result.debate_token_cost).toBe(1200); // 3 * 400
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  test("single reviewer produces no disagreements", () => {
    const config = makeConfig();
    const outputs = {
      "dx-advocate": [
        { severity: "HIGH", file: "src/foo.ts", line: 42, issue: "Issue" },
      ],
    };
    const result = shouldRunMilestoneDebate(config, "COMPLEX", outputs);
    expect(result.should_run).toBe(false);
    expect(result.reason).toContain("No disagreements");
  });

  test("all reviewers agree on same issue same severity", () => {
    const config = makeConfig();
    const outputs = {
      "dx-advocate": [
        { severity: "HIGH", file: "src/foo.ts", line: 42, issue: "Issue A" },
      ],
      "code-simplifier": [
        { severity: "HIGH", file: "src/foo.ts", line: 42, issue: "Issue B" },
      ],
    };
    // Same severity = scope_overlap, but still needs HIGH/CRITICAL for tribunal
    const result = shouldRunMilestoneDebate(config, "COMPLEX", outputs);
    // scope_overlap with HIGH severity should trigger
    expect(result.should_run).toBe(true);
  });

  test("no reviewers (empty outputs) produces false", () => {
    const config = makeConfig();
    const result = shouldRunMilestoneDebate(config, "COMPLEX", {});
    expect(result.should_run).toBe(false);
  });
});
