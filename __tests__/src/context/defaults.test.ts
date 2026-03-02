import { describe, test, expect } from "bun:test";
import {
  TIER_DOCUMENTS,
  ISOLATION_OVERRIDES,
  DEFAULT_AGENT_CONTEXT_PROFILES,
  FALLBACK_CONTEXT_PROFILE,
} from "../../../src/context/__helpers/defaults";
import { CONTEXT_TIERS, contextConfigSchema } from "../../../src/context";

// ---------------------------------------------------------------------------
// TIER_DOCUMENTS
// ---------------------------------------------------------------------------

describe("TIER_DOCUMENTS", () => {
  test("T0 contains only plan_content", () => {
    expect(TIER_DOCUMENTS.T0).toEqual(["plan_content"]);
  });

  test("T1 is additive over T0 (adds brain_summary)", () => {
    for (const key of TIER_DOCUMENTS.T0) {
      expect(TIER_DOCUMENTS.T1).toContain(key);
    }
    expect(TIER_DOCUMENTS.T1).toContain("brain_summary");
  });

  test("T2 is additive over T1 (adds state, memory_entries, working)", () => {
    // T2 should contain all T1 keys
    for (const key of TIER_DOCUMENTS.T1) {
      expect(TIER_DOCUMENTS.T2).toContain(key);
    }
    expect(TIER_DOCUMENTS.T2).toContain("state_content");
    expect(TIER_DOCUMENTS.T2).toContain("memory_entries");
    expect(TIER_DOCUMENTS.T2).toContain("working_content");
  });

  test("T3 replaces summaries with full and adds agent_summaries", () => {
    // T3 uses brain_full instead of brain_summary
    expect(TIER_DOCUMENTS.T3).toContain("brain_full");
    expect(TIER_DOCUMENTS.T3).not.toContain("brain_summary");
    // T3 uses memory_full instead of memory_entries
    expect(TIER_DOCUMENTS.T3).toContain("memory_full");
    expect(TIER_DOCUMENTS.T3).not.toContain("memory_entries");
    // T3 adds agent_summaries
    expect(TIER_DOCUMENTS.T3).toContain("agent_summaries");
  });

  test("every tier is a non-empty array", () => {
    for (const tier of CONTEXT_TIERS) {
      expect(Array.isArray(TIER_DOCUMENTS[tier])).toBe(true);
      expect(TIER_DOCUMENTS[tier].length).toBeGreaterThan(0);
    }
  });

  test("all tiers include plan_content", () => {
    for (const tier of CONTEXT_TIERS) {
      expect(TIER_DOCUMENTS[tier]).toContain("plan_content");
    }
  });
});

// ---------------------------------------------------------------------------
// ISOLATION_OVERRIDES
// ---------------------------------------------------------------------------

describe("ISOLATION_OVERRIDES", () => {
  test("none mode has empty include and exclude", () => {
    expect(ISOLATION_OVERRIDES.none.include).toEqual([]);
    expect(ISOLATION_OVERRIDES.none.exclude).toEqual([]);
  });

  test("cold mode includes only git_diff and brain_summary", () => {
    expect(ISOLATION_OVERRIDES.cold.include).toEqual([
      "git_diff",
      "brain_summary",
    ]);
  });

  test("cold mode excludes many document types", () => {
    const excluded = ISOLATION_OVERRIDES.cold.exclude;
    expect(excluded).toContain("plan_content");
    expect(excluded).toContain("state_content");
    expect(excluded).toContain("memory_entries");
    expect(excluded).toContain("working_content");
  });

  test("warm mode includes plan_content, plan_summaries, brain_summary", () => {
    expect(ISOLATION_OVERRIDES.warm.include).toContain("plan_content");
    expect(ISOLATION_OVERRIDES.warm.include).toContain("plan_summaries");
    expect(ISOLATION_OVERRIDES.warm.include).toContain("brain_summary");
  });

  test("warm mode excludes working_content, memory_full, brain_full", () => {
    expect(ISOLATION_OVERRIDES.warm.exclude).toContain("working_content");
    expect(ISOLATION_OVERRIDES.warm.exclude).toContain("memory_full");
    expect(ISOLATION_OVERRIDES.warm.exclude).toContain("brain_full");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_AGENT_CONTEXT_PROFILES
// ---------------------------------------------------------------------------

describe("DEFAULT_AGENT_CONTEXT_PROFILES", () => {
  test("contains exactly 13 agent profiles", () => {
    expect(Object.keys(DEFAULT_AGENT_CONTEXT_PROFILES)).toHaveLength(13);
  });

  test("every profile validates against contextConfigSchema", () => {
    for (const [name, profile] of Object.entries(
      DEFAULT_AGENT_CONTEXT_PROFILES,
    )) {
      const result = contextConfigSchema.safeParse(profile);
      expect(result.success).toBe(true);
    }
  });

  test("lu-executor has T2 default, T3 promotable, none isolation", () => {
    const p = DEFAULT_AGENT_CONTEXT_PROFILES["lu-executor"]!;
    expect(p.default_tier).toBe("T2");
    expect(p.promotable_to).toBe("T3");
    expect(p.isolation).toBe("none");
  });

  test("dx-advocate has cold isolation and no promotion", () => {
    const p = DEFAULT_AGENT_CONTEXT_PROFILES["dx-advocate"]!;
    expect(p.default_tier).toBe("T0");
    expect(p.promotable_to).toBe("T0");
    expect(p.isolation).toBe("cold");
  });

  test("lu-verifier has warm isolation", () => {
    const p = DEFAULT_AGENT_CONTEXT_PROFILES["lu-verifier"]!;
    expect(p.isolation).toBe("warm");
  });

  test("lu-cognition has T3 default and T3 ceiling (no promotion possible)", () => {
    const p = DEFAULT_AGENT_CONTEXT_PROFILES["lu-cognition"]!;
    expect(p.default_tier).toBe("T3");
    expect(p.promotable_to).toBe("T3");
    expect(p.isolation).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// FALLBACK_CONTEXT_PROFILE
// ---------------------------------------------------------------------------

describe("FALLBACK_CONTEXT_PROFILE", () => {
  test("has T0 default tier", () => {
    expect(FALLBACK_CONTEXT_PROFILE.default_tier).toBe("T0");
  });

  test("has T0 promotable_to ceiling", () => {
    expect(FALLBACK_CONTEXT_PROFILE.promotable_to).toBe("T0");
  });

  test("has none isolation", () => {
    expect(FALLBACK_CONTEXT_PROFILE.isolation).toBe("none");
  });

  test("validates against contextConfigSchema", () => {
    const result = contextConfigSchema.safeParse(FALLBACK_CONTEXT_PROFILE);
    expect(result.success).toBe(true);
  });
});
