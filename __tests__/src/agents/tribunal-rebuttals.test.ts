import { describe, test, expect } from "bun:test";
import {
  buildRebuttalPrompts,
  resolveRebuttals,
  buildTribunalResult,
} from "../../../src/agents/__helpers/tribunal-rebuttals";
import type {
  ReviewFinding,
  Disagreement,
  Rebuttal,
} from "../../../src/agents/__schemas/tribunal.schemas";

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

describe("buildRebuttalPrompts", () => {
  test("generates prompt pairs for each disagreement", () => {
    const disagreements = [makeDisagreement()];
    const prompts = buildRebuttalPrompts(disagreements);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.disagreement_id).toBe("disagreement-1");
    expect(prompts[0]!.defender_agent).toBe("dx-advocate");
    expect(prompts[0]!.challenger_agent).toBe("code-simplifier");
  });

  test("higher severity finding is the defender", () => {
    const disagreement = makeDisagreement({
      conflicting_findings: [
        makeFinding({
          id: "f-critical",
          severity: "CRITICAL",
          source_agent: "security-auditor",
        }),
        makeFinding({
          id: "f-medium",
          severity: "MEDIUM",
          source_agent: "dx-advocate",
        }),
      ],
    });

    const prompts = buildRebuttalPrompts([disagreement]);

    expect(prompts[0]!.defender_agent).toBe("security-auditor");
    expect(prompts[0]!.challenger_agent).toBe("dx-advocate");
  });

  test("challenger prompt references the defended finding", () => {
    const prompts = buildRebuttalPrompts([makeDisagreement()]);

    expect(prompts[0]!.challenger_prompt).toContain("dx-advocate");
    expect(prompts[0]!.challenger_prompt).toContain("src/foo.ts");
    expect(prompts[0]!.challenger_prompt).toContain("severity_mismatch");
  });

  test("defender prompt references challenger assessment", () => {
    const prompts = buildRebuttalPrompts([makeDisagreement()]);

    expect(prompts[0]!.defender_prompt).toContain("code-simplifier");
    expect(prompts[0]!.defender_prompt).toContain("upheld");
  });

  test("generates prompts for multiple disagreements", () => {
    const disagreements = [
      makeDisagreement({ id: "d-1" }),
      makeDisagreement({ id: "d-2" }),
    ];

    const prompts = buildRebuttalPrompts(disagreements);
    expect(prompts).toHaveLength(2);
  });

  test("handles empty disagreements", () => {
    expect(buildRebuttalPrompts([])).toHaveLength(0);
  });

  test("skips disagreements with fewer than 2 findings", () => {
    const disagreement = makeDisagreement({
      conflicting_findings: [makeFinding({ id: "f-1" })],
    });

    // This shouldn't normally happen but guard against it
    const prompts = buildRebuttalPrompts([disagreement]);
    expect(prompts).toHaveLength(0);
  });
});

describe("resolveRebuttals", () => {
  test("undisputed findings get full confidence", () => {
    const findings = [makeFinding({ id: "f-1" }), makeFinding({ id: "f-2" })];

    const recommendations = resolveRebuttals(findings, []);

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0]!.confidence).toBe(1.0);
    expect(recommendations[0]!.agreement_count).toBe(1);
    expect(recommendations[0]!.dissent_count).toBe(0);
    expect(recommendations[0]!.debate_history).toHaveLength(0);
  });

  test("upheld finding retains high confidence", () => {
    const findings = [makeFinding({ id: "f-1" })];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "This is not an issue",
        defender_response: "It is critical for security",
        resolution: "upheld",
      },
    ];

    const recommendations = resolveRebuttals(findings, rebuttals);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]!.confidence).toBe(1.0);
    expect(recommendations[0]!.agreement_count).toBe(1);
    expect(recommendations[0]!.debate_history).toHaveLength(1);
  });

  test("withdrawn finding is excluded from recommendations", () => {
    const findings = [makeFinding({ id: "f-1" }), makeFinding({ id: "f-2" })];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "Not an issue",
        defender_response: "You're right, withdrawing",
        resolution: "withdrawn",
      },
    ];

    const recommendations = resolveRebuttals(findings, rebuttals);

    // f-1 withdrawn, f-2 undisputed
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]!.finding.id).toBe("f-2");
  });

  test("modified finding gets partial confidence", () => {
    const findings = [makeFinding({ id: "f-1" })];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "Severity too high",
        defender_response: "Agree, modifying to MEDIUM",
        resolution: "modified",
      },
    ];

    const recommendations = resolveRebuttals(findings, rebuttals);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]!.confidence).toBe(0.5); // modified * 0.5 / 1 = 0.5
    expect(recommendations[0]!.agreement_count).toBe(1);
  });

  test("multiple rebuttals on same finding aggregate correctly", () => {
    const findings = [makeFinding({ id: "f-1" })];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "Not important",
        defender_response: "It is important",
        resolution: "upheld",
      },
      {
        finding_id: "f-1",
        challenger_agent: "code-architect",
        challenge: "Severity too high",
        defender_response: "Agreed, lowering",
        resolution: "modified",
      },
    ];

    const recommendations = resolveRebuttals(findings, rebuttals);

    expect(recommendations).toHaveLength(1);
    // (1 upheld + 0.5 modified) / 2 = 0.75
    expect(recommendations[0]!.confidence).toBe(0.75);
    expect(recommendations[0]!.debate_history).toHaveLength(2);
  });

  test("handles empty findings", () => {
    expect(resolveRebuttals([], [])).toHaveLength(0);
  });
});

describe("buildTribunalResult", () => {
  test("builds complete tribunal result", () => {
    const findings = [makeFinding({ id: "f-1" }), makeFinding({ id: "f-2" })];
    const disagreements = [makeDisagreement()];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "code-simplifier",
        challenge: "Challenge",
        defender_response: "Defense",
        resolution: "upheld",
      },
    ];
    const recommendations = resolveRebuttals(findings, rebuttals);

    const result = buildTribunalResult(
      91,
      findings,
      disagreements,
      rebuttals,
      recommendations,
    );

    expect(result).not.toBeNull();
    expect(result!.phase).toBe(91);
    expect(result!.total_findings).toBe(2);
    expect(result!.disagreements_detected).toBe(1);
    expect(result!.rebuttals_conducted).toBe(1);
    expect(result!.findings_withdrawn).toBe(0);
    expect(result!.findings_modified).toBe(0);
    expect(result!.unified_recommendations).toHaveLength(2);
    expect(result!.debate_token_cost).toBe(400); // 1 rebuttal * 400
    expect(result!.timestamp).toBeTruthy();
  });

  test("tracks withdrawn and modified counts", () => {
    const findings = [makeFinding({ id: "f-1" }), makeFinding({ id: "f-2" })];
    const rebuttals: Rebuttal[] = [
      {
        finding_id: "f-1",
        challenger_agent: "a",
        challenge: "C",
        defender_response: "D",
        resolution: "withdrawn",
      },
      {
        finding_id: "f-2",
        challenger_agent: "b",
        challenge: "C",
        defender_response: "D",
        resolution: "modified",
      },
    ];
    const recommendations = resolveRebuttals(findings, rebuttals);

    const result = buildTribunalResult(
      91,
      findings,
      [],
      rebuttals,
      recommendations,
    );

    expect(result).not.toBeNull();
    expect(result!.findings_withdrawn).toBe(1);
    expect(result!.findings_modified).toBe(1);
    expect(result!.debate_token_cost).toBe(800); // 2 rebuttals * 400
  });

  test("handles empty inputs", () => {
    const result = buildTribunalResult(91, [], [], [], []);

    expect(result).not.toBeNull();
    expect(result!.phase).toBe(91);
    expect(result!.total_findings).toBe(0);
    expect(result!.disagreements_detected).toBe(0);
    expect(result!.rebuttals_conducted).toBe(0);
    expect(result!.debate_token_cost).toBe(0);
  });
});
