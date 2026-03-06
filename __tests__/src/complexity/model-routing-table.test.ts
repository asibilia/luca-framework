import { describe, test, expect } from "bun:test";
import {
  resolveModelForAgent,
  getRoutingRow,
  MODEL_ROUTING_TABLE,
  DEFAULT_COMPLEXITY_TIERS,
  ModelRoutingRowSchema,
  ModelRoutingTableSchema,
} from "../../../src/complexity/__helpers/model-routing";

describe("DEFAULT_COMPLEXITY_TIERS", () => {
  test("TRIVIAL and SIMPLE map to fast", () => {
    expect(DEFAULT_COMPLEXITY_TIERS.TRIVIAL).toBe("fast");
    expect(DEFAULT_COMPLEXITY_TIERS.SIMPLE).toBe("fast");
  });

  test("MODERATE maps to balanced", () => {
    expect(DEFAULT_COMPLEXITY_TIERS.MODERATE).toBe("balanced");
  });

  test("COMPLEX and CRITICAL map to capable", () => {
    expect(DEFAULT_COMPLEXITY_TIERS.COMPLEX).toBe("capable");
    expect(DEFAULT_COMPLEXITY_TIERS.CRITICAL).toBe("capable");
  });
});

describe("MODEL_ROUTING_TABLE schema validation", () => {
  test("entire table validates against ModelRoutingTableSchema", () => {
    const result = ModelRoutingTableSchema.safeParse(MODEL_ROUTING_TABLE);
    expect(result.success).toBe(true);
  });

  test("each row validates against ModelRoutingRowSchema", () => {
    for (const [, row] of Object.entries(MODEL_ROUTING_TABLE)) {
      const result = ModelRoutingRowSchema.safeParse(row);
      expect(result.success).toBe(true);
    }
  });
});

describe("MODEL_ROUTING_TABLE entries", () => {
  test("lu-cognition is fast at all levels", () => {
    const row = MODEL_ROUTING_TABLE["lu-cognition"]!;
    expect(row.TRIVIAL).toBe("fast");
    expect(row.SIMPLE).toBe("fast");
    expect(row.MODERATE).toBe("fast");
    expect(row.COMPLEX).toBe("fast");
    expect(row.CRITICAL).toBe("fast");
  });

  test("lu-executor scales from fast to capable", () => {
    const row = MODEL_ROUTING_TABLE["lu-executor"]!;
    expect(row.TRIVIAL).toBe("fast");
    expect(row.SIMPLE).toBe("balanced");
    expect(row.MODERATE).toBe("balanced");
    expect(row.COMPLEX).toBe("capable");
    expect(row.CRITICAL).toBe("capable");
  });

  test("lu-verifier scales from fast to capable", () => {
    const row = MODEL_ROUTING_TABLE["lu-verifier"]!;
    expect(row.TRIVIAL).toBe("fast");
    expect(row.SIMPLE).toBe("balanced");
    expect(row.MODERATE).toBe("capable");
    expect(row.COMPLEX).toBe("capable");
    expect(row.CRITICAL).toBe("capable");
  });

  test("security-auditor is capable at MODERATE+", () => {
    const row = MODEL_ROUTING_TABLE["security-auditor"]!;
    expect(row.MODERATE).toBe("capable");
    expect(row.COMPLEX).toBe("capable");
    expect(row.CRITICAL).toBe("capable");
  });
});

describe("resolveModelForAgent", () => {
  test("returns agent-specific tier when agent is in table", () => {
    expect(resolveModelForAgent("lu-cognition", "CRITICAL")).toBe("fast");
    expect(resolveModelForAgent("lu-executor", "CRITICAL")).toBe("capable");
    expect(resolveModelForAgent("lu-executor", "TRIVIAL")).toBe("fast");
  });

  test("returns default tier when agent is not in table", () => {
    expect(resolveModelForAgent("unknown-agent", "TRIVIAL")).toBe("fast");
    expect(resolveModelForAgent("unknown-agent", "MODERATE")).toBe("balanced");
    expect(resolveModelForAgent("unknown-agent", "CRITICAL")).toBe("capable");
  });

  test("handles all five complexity levels for a known agent", () => {
    expect(resolveModelForAgent("lu-planner", "TRIVIAL")).toBe("fast");
    expect(resolveModelForAgent("lu-planner", "SIMPLE")).toBe("balanced");
    expect(resolveModelForAgent("lu-planner", "MODERATE")).toBe("balanced");
    expect(resolveModelForAgent("lu-planner", "COMPLEX")).toBe("capable");
    expect(resolveModelForAgent("lu-planner", "CRITICAL")).toBe("capable");
  });

  test("lu-learner stays fast except at CRITICAL", () => {
    expect(resolveModelForAgent("lu-learner", "TRIVIAL")).toBe("fast");
    expect(resolveModelForAgent("lu-learner", "COMPLEX")).toBe("fast");
    expect(resolveModelForAgent("lu-learner", "CRITICAL")).toBe("balanced");
  });
});

describe("getRoutingRow", () => {
  test("returns agent-specific row for known agent", () => {
    const row = getRoutingRow("lu-cognition");
    const expected = MODEL_ROUTING_TABLE["lu-cognition"];
    expect(expected).toBeDefined();
    expect(row).toEqual(expected!);
  });

  test("returns default row for unknown agent", () => {
    const row = getRoutingRow("nonexistent-agent");
    expect(row).toEqual(DEFAULT_COMPLEXITY_TIERS);
  });
});
