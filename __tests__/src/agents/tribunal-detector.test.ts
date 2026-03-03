import { describe, test, expect } from "bun:test";
import {
  normalizeFindings,
  detectDisagreements,
  shouldRunTribunal,
} from "../../../src/agents/__helpers/tribunal-detector";
import type {
  ReviewFinding,
  Disagreement,
} from "../../../src/agents/__schemas/tribunal.schemas";

describe("normalizeFindings", () => {
  test("normalizes array of finding objects", () => {
    const findings = normalizeFindings({
      "dx-advocate": [
        {
          severity: "HIGH",
          file: "src/foo.ts",
          line: 42,
          issue: "Bad naming",
          suggestion: "Use camelCase",
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("HIGH");
    expect(findings[0]!.file).toBe("src/foo.ts");
    expect(findings[0]!.line).toBe(42);
    expect(findings[0]!.source_agent).toBe("dx-advocate");
    expect(findings[0]!.id).toContain("dx-advocate");
  });

  test("normalizes object with issues array", () => {
    const findings = normalizeFindings({
      "code-simplifier": {
        issues: [
          {
            severity: "MEDIUM",
            file: "src/bar.ts",
            line: 10,
            issue: "DRY violation",
          },
        ],
      },
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("MEDIUM");
    expect(findings[0]!.source_agent).toBe("code-simplifier");
  });

  test("normalizes severity to uppercase", () => {
    const findings = normalizeFindings({
      "dx-advocate": [
        { severity: "high", file: "src/foo.ts", line: 1, issue: "Test" },
      ],
    });

    expect(findings[0]!.severity).toBe("HIGH");
  });

  test("defaults unknown severity to LOW", () => {
    const findings = normalizeFindings({
      "dx-advocate": [
        { severity: "unknown", file: "src/foo.ts", line: 1, issue: "Test" },
      ],
    });

    expect(findings[0]!.severity).toBe("LOW");
  });

  test("handles multiple agents with multiple findings", () => {
    const findings = normalizeFindings({
      "dx-advocate": [
        { severity: "HIGH", file: "src/a.ts", line: 1, issue: "Issue A" },
        { severity: "LOW", file: "src/b.ts", line: 2, issue: "Issue B" },
      ],
      "code-simplifier": [
        { severity: "MEDIUM", file: "src/a.ts", line: 1, issue: "Issue C" },
      ],
    });

    expect(findings).toHaveLength(3);
    const agents = new Set(findings.map((f) => f.source_agent));
    expect(agents.size).toBe(2);
  });

  test("skips invalid findings gracefully", () => {
    const findings = normalizeFindings({
      "dx-advocate": [
        { severity: "HIGH", file: "src/foo.ts", line: 1, issue: "Valid" },
        { invalid: true }, // Missing required fields
      ],
    });

    // Should get at least the valid one
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.issue).toBe("Valid");
  });

  test("handles empty output", () => {
    const findings = normalizeFindings({
      "dx-advocate": [],
    });

    expect(findings).toHaveLength(0);
  });

  test("generates unique IDs for each finding", () => {
    const findings = normalizeFindings({
      "dx-advocate": [
        { severity: "HIGH", file: "src/a.ts", line: 1, issue: "A" },
        { severity: "HIGH", file: "src/b.ts", line: 2, issue: "B" },
      ],
    });

    expect(findings[0]!.id).not.toBe(findings[1]!.id);
  });
});

describe("detectDisagreements", () => {
  function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
    return {
      id: `finding-${Math.random().toString(36).slice(2, 8)}`,
      severity: "HIGH",
      file: "src/foo.ts",
      line: 42,
      issue: "Some issue",
      suggestion: "",
      source_agent: "dx-advocate",
      ...overrides,
    };
  }

  test("detects severity mismatch between agents", () => {
    const findings = [
      makeFinding({
        source_agent: "dx-advocate",
        severity: "CRITICAL",
        file: "src/foo.ts",
        line: 42,
      }),
      makeFinding({
        source_agent: "code-simplifier",
        severity: "MEDIUM",
        file: "src/foo.ts",
        line: 42,
      }),
    ];

    const disagreements = detectDisagreements(findings);

    expect(disagreements).toHaveLength(1);
    expect(disagreements[0]!.conflict_type).toBe("severity_mismatch");
    expect(disagreements[0]!.file).toBe("src/foo.ts");
    expect(disagreements[0]!.line).toBe(42);
    expect(disagreements[0]!.conflicting_findings).toHaveLength(2);
  });

  test("detects scope overlap (same severity, different agents)", () => {
    const findings = [
      makeFinding({
        source_agent: "dx-advocate",
        severity: "HIGH",
        file: "src/bar.ts",
        line: 10,
        issue: "Naming issue",
      }),
      makeFinding({
        source_agent: "code-architect",
        severity: "HIGH",
        file: "src/bar.ts",
        line: 10,
        issue: "Architecture issue",
      }),
    ];

    const disagreements = detectDisagreements(findings);

    expect(disagreements).toHaveLength(1);
    expect(disagreements[0]!.conflict_type).toBe("scope_overlap");
  });

  test("does not flag findings from same agent", () => {
    const findings = [
      makeFinding({
        source_agent: "dx-advocate",
        file: "src/foo.ts",
        line: 42,
        severity: "HIGH",
      }),
      makeFinding({
        source_agent: "dx-advocate",
        file: "src/foo.ts",
        line: 42,
        severity: "MEDIUM",
      }),
    ];

    const disagreements = detectDisagreements(findings);
    expect(disagreements).toHaveLength(0);
  });

  test("does not flag findings at different locations", () => {
    const findings = [
      makeFinding({
        source_agent: "dx-advocate",
        file: "src/foo.ts",
        line: 42,
      }),
      makeFinding({
        source_agent: "code-simplifier",
        file: "src/foo.ts",
        line: 100,
      }),
    ];

    const disagreements = detectDisagreements(findings);
    expect(disagreements).toHaveLength(0);
  });

  test("handles empty findings array", () => {
    expect(detectDisagreements([])).toHaveLength(0);
  });

  test("handles single finding", () => {
    expect(detectDisagreements([makeFinding({})])).toHaveLength(0);
  });

  test("detects multiple disagreements at different locations", () => {
    const findings = [
      makeFinding({
        source_agent: "dx-advocate",
        file: "src/a.ts",
        line: 10,
        severity: "HIGH",
      }),
      makeFinding({
        source_agent: "code-simplifier",
        file: "src/a.ts",
        line: 10,
        severity: "LOW",
      }),
      makeFinding({
        source_agent: "dx-advocate",
        file: "src/b.ts",
        line: 20,
        severity: "CRITICAL",
      }),
      makeFinding({
        source_agent: "code-architect",
        file: "src/b.ts",
        line: 20,
        severity: "MEDIUM",
      }),
    ];

    const disagreements = detectDisagreements(findings);
    expect(disagreements).toHaveLength(2);
  });
});

describe("shouldRunTribunal", () => {
  function makeDisagreement(
    overrides: Partial<Disagreement> = {},
  ): Disagreement {
    return {
      id: "d-1",
      file: "src/foo.ts",
      line: 42,
      conflicting_findings: [
        {
          id: "f-1",
          severity: "HIGH",
          file: "src/foo.ts",
          line: 42,
          issue: "Issue",
          suggestion: "",
          source_agent: "dx-advocate",
        },
        {
          id: "f-2",
          severity: "MEDIUM",
          file: "src/foo.ts",
          line: 42,
          issue: "Issue",
          suggestion: "",
          source_agent: "code-simplifier",
        },
      ],
      conflict_type: "severity_mismatch",
      ...overrides,
    };
  }

  test("returns true for COMPLEX with HIGH disagreements", () => {
    expect(shouldRunTribunal([makeDisagreement()], "COMPLEX")).toBe(true);
  });

  test("returns true for CRITICAL complexity", () => {
    expect(shouldRunTribunal([makeDisagreement()], "CRITICAL")).toBe(true);
  });

  test("returns false for MODERATE complexity", () => {
    expect(shouldRunTribunal([makeDisagreement()], "MODERATE")).toBe(false);
  });

  test("returns false for SIMPLE complexity", () => {
    expect(shouldRunTribunal([makeDisagreement()], "SIMPLE")).toBe(false);
  });

  test("returns false for TRIVIAL complexity", () => {
    expect(shouldRunTribunal([makeDisagreement()], "TRIVIAL")).toBe(false);
  });

  test("returns false when no disagreements have HIGH/CRITICAL findings", () => {
    const lowDisagreement = makeDisagreement({
      conflicting_findings: [
        {
          id: "f-1",
          severity: "MEDIUM",
          file: "src/foo.ts",
          line: 42,
          issue: "Issue",
          suggestion: "",
          source_agent: "dx-advocate",
        },
        {
          id: "f-2",
          severity: "LOW",
          file: "src/foo.ts",
          line: 42,
          issue: "Issue",
          suggestion: "",
          source_agent: "code-simplifier",
        },
      ],
    });
    expect(shouldRunTribunal([lowDisagreement], "COMPLEX")).toBe(false);
  });

  test("returns false for empty disagreements", () => {
    expect(shouldRunTribunal([], "COMPLEX")).toBe(false);
  });

  test("is case-insensitive for complexity", () => {
    expect(shouldRunTribunal([makeDisagreement()], "complex")).toBe(true);
  });
});
