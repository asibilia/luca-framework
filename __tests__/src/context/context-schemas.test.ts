import { describe, test, expect } from "bun:test";
import {
  CONTEXT_TIERS,
  contextTierSchema,
  CONTEXT_TIER_ORDER,
  ISOLATION_MODES,
  isolationModeSchema,
  contextConfigSchema,
  budgetAllocationSchema,
  contextDocumentSetSchema,
  meetsContextThreshold,
  maxContextTier,
} from "../../../src/context";
import type { ContextTier } from "../../../src/context";

// ---------------------------------------------------------------------------
// contextTierSchema
// ---------------------------------------------------------------------------

describe("contextTierSchema", () => {
  test("has exactly 4 tiers", () => {
    expect(CONTEXT_TIERS).toHaveLength(4);
  });

  test("tiers are T0 through T3 in order", () => {
    expect(CONTEXT_TIERS).toEqual(["T0", "T1", "T2", "T3"]);
  });

  test("accepts valid tiers", () => {
    for (const tier of CONTEXT_TIERS) {
      const result = contextTierSchema.safeParse(tier);
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid tier strings", () => {
    const invalid = ["T4", "T-1", "t0", "tier0", "", "X"];
    for (const v of invalid) {
      const result = contextTierSchema.safeParse(v);
      expect(result.success).toBe(false);
    }
  });

  test("CONTEXT_TIER_ORDER maps T0=0 through T3=3", () => {
    expect(CONTEXT_TIER_ORDER.T0).toBe(0);
    expect(CONTEXT_TIER_ORDER.T1).toBe(1);
    expect(CONTEXT_TIER_ORDER.T2).toBe(2);
    expect(CONTEXT_TIER_ORDER.T3).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// isolationModeSchema
// ---------------------------------------------------------------------------

describe("isolationModeSchema", () => {
  test("has exactly 3 modes", () => {
    expect(ISOLATION_MODES).toHaveLength(3);
  });

  test("modes are none, cold, warm", () => {
    expect(ISOLATION_MODES).toEqual(["none", "cold", "warm"]);
  });

  test("accepts valid modes", () => {
    for (const mode of ISOLATION_MODES) {
      const result = isolationModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid mode strings", () => {
    const invalid = ["hot", "NONE", "Cold", "", "freeze"];
    for (const v of invalid) {
      const result = isolationModeSchema.safeParse(v);
      expect(result.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// meetsContextThreshold
// ---------------------------------------------------------------------------

describe("meetsContextThreshold", () => {
  test("same tier meets its own threshold", () => {
    for (const tier of CONTEXT_TIERS) {
      expect(meetsContextThreshold(tier, tier)).toBe(true);
    }
  });

  test("higher tier meets lower threshold", () => {
    expect(meetsContextThreshold("T3", "T0")).toBe(true);
    expect(meetsContextThreshold("T2", "T1")).toBe(true);
    expect(meetsContextThreshold("T3", "T2")).toBe(true);
  });

  test("lower tier does not meet higher threshold", () => {
    expect(meetsContextThreshold("T0", "T1")).toBe(false);
    expect(meetsContextThreshold("T1", "T2")).toBe(false);
    expect(meetsContextThreshold("T0", "T3")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maxContextTier
// ---------------------------------------------------------------------------

describe("maxContextTier", () => {
  test("returns the higher of two different tiers", () => {
    expect(maxContextTier("T0", "T3")).toBe("T3");
    expect(maxContextTier("T3", "T0")).toBe("T3");
    expect(maxContextTier("T1", "T2")).toBe("T2");
  });

  test("returns the same tier when both are equal", () => {
    for (const tier of CONTEXT_TIERS) {
      expect(maxContextTier(tier, tier)).toBe(tier);
    }
  });
});

// ---------------------------------------------------------------------------
// contextConfigSchema
// ---------------------------------------------------------------------------

describe("contextConfigSchema", () => {
  test("parses a fully specified config", () => {
    const result = contextConfigSchema.safeParse({
      default_tier: "T2",
      promotable_to: "T3",
      isolation: "warm",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_tier).toBe("T2");
      expect(result.data.promotable_to).toBe("T3");
      expect(result.data.isolation).toBe("warm");
    }
  });

  test("applies defaults for empty object", () => {
    const result = contextConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_tier).toBe("T0");
      expect(result.data.promotable_to).toBe("T0");
      expect(result.data.isolation).toBe("none");
    }
  });

  test("rejects invalid tier value", () => {
    const result = contextConfigSchema.safeParse({
      default_tier: "T5",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// budgetAllocationSchema
// ---------------------------------------------------------------------------

describe("budgetAllocationSchema", () => {
  test("parses valid budget allocation", () => {
    const result = budgetAllocationSchema.safeParse({
      total_tokens: 8000,
      output_reservation_pct: 0.4,
      advisory: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_tokens).toBe(8000);
      expect(result.data.output_reservation_pct).toBe(0.4);
      expect(result.data.advisory).toBe(true);
    }
  });

  test("applies defaults for output_reservation_pct and advisory", () => {
    const result = budgetAllocationSchema.safeParse({
      total_tokens: 4000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output_reservation_pct).toBe(0.3);
      expect(result.data.advisory).toBe(false);
    }
  });

  test("rejects non-positive total_tokens", () => {
    const result = budgetAllocationSchema.safeParse({
      total_tokens: -1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects output_reservation_pct outside 0.25-0.5 range", () => {
    const tooLow = budgetAllocationSchema.safeParse({
      total_tokens: 1000,
      output_reservation_pct: 0.1,
    });
    expect(tooLow.success).toBe(false);

    const tooHigh = budgetAllocationSchema.safeParse({
      total_tokens: 1000,
      output_reservation_pct: 0.9,
    });
    expect(tooHigh.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// contextDocumentSetSchema
// ---------------------------------------------------------------------------

describe("contextDocumentSetSchema", () => {
  test("parses empty object (all fields optional)", () => {
    const result = contextDocumentSetSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("parses full document set", () => {
    const result = contextDocumentSetSchema.safeParse({
      plan_content: "plan",
      brain_summary: "brain",
      state_content: "state",
      memory_entries: "memories",
      working_content: "working",
      brain_full: "full brain",
      memory_full: "full memory",
      agent_summaries: "summaries",
      git_diff: "diff",
      plan_summaries: "plan summaries",
    });
    expect(result.success).toBe(true);
  });

  test("ignores extra properties via strip", () => {
    const result = contextDocumentSetSchema.safeParse({
      plan_content: "plan",
      unknown_field: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan_content).toBe("plan");
      expect(
        (result.data as Record<string, unknown>)["unknown_field"],
      ).toBeUndefined();
    }
  });
});
