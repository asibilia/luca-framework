import { describe, test, expect } from "bun:test";
import {
  DEFAULT_CONTEXT_PROMOTIONS,
  resolveEffectiveContextTier,
  resolveContextTierFromMatrix,
} from "../../../src/context/__helpers/resolve-context-tier";
import type { ComplexityLevel } from "../../../src/complexity";
import { COMPLEXITY_LEVELS } from "../../../src/complexity";
import { CONTEXT_TIERS } from "../../../src/context";

// ---------------------------------------------------------------------------
// DEFAULT_CONTEXT_PROMOTIONS
// ---------------------------------------------------------------------------

describe("DEFAULT_CONTEXT_PROMOTIONS", () => {
  test("TRIVIAL has no promotions (undefined)", () => {
    expect(DEFAULT_CONTEXT_PROMOTIONS.TRIVIAL).toBeUndefined();
  });

  test("SIMPLE has no promotions (undefined)", () => {
    expect(DEFAULT_CONTEXT_PROMOTIONS.SIMPLE).toBeUndefined();
  });

  test("MODERATE promotes T0->T1 and T1->T2", () => {
    const mod = DEFAULT_CONTEXT_PROMOTIONS.MODERATE;
    expect(mod).toBeDefined();
    expect(mod!.T0).toBe("T1");
    expect(mod!.T1).toBe("T2");
    expect(mod!.T2).toBeUndefined();
  });

  test("COMPLEX promotes T0->T1, T1->T2, T2->T3", () => {
    const cx = DEFAULT_CONTEXT_PROMOTIONS.COMPLEX;
    expect(cx).toBeDefined();
    expect(cx!.T0).toBe("T1");
    expect(cx!.T1).toBe("T2");
    expect(cx!.T2).toBe("T3");
  });

  test("CRITICAL has same promotions as COMPLEX", () => {
    const cr = DEFAULT_CONTEXT_PROMOTIONS.CRITICAL;
    expect(cr).toBeDefined();
    expect(cr!.T0).toBe("T1");
    expect(cr!.T1).toBe("T2");
    expect(cr!.T2).toBe("T3");
  });

  test("every complexity level has a key in the map", () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(level in DEFAULT_CONTEXT_PROMOTIONS).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveContextTier
// ---------------------------------------------------------------------------

describe("resolveEffectiveContextTier", () => {
  test("no promotion at TRIVIAL complexity", () => {
    expect(resolveEffectiveContextTier("T0", "T3", "TRIVIAL")).toBe("T0");
    expect(resolveEffectiveContextTier("T1", "T3", "TRIVIAL")).toBe("T1");
    expect(resolveEffectiveContextTier("T2", "T3", "TRIVIAL")).toBe("T2");
  });

  test("no promotion at SIMPLE complexity", () => {
    expect(resolveEffectiveContextTier("T0", "T3", "SIMPLE")).toBe("T0");
    expect(resolveEffectiveContextTier("T2", "T3", "SIMPLE")).toBe("T2");
  });

  test("MODERATE promotes T0->T1 within ceiling", () => {
    expect(resolveEffectiveContextTier("T0", "T3", "MODERATE")).toBe("T1");
  });

  test("MODERATE promotes T1->T2 within ceiling", () => {
    expect(resolveEffectiveContextTier("T1", "T3", "MODERATE")).toBe("T2");
  });

  test("MODERATE does not promote T2 (no mapping for T2)", () => {
    expect(resolveEffectiveContextTier("T2", "T3", "MODERATE")).toBe("T2");
  });

  test("COMPLEX promotes T2->T3 within ceiling", () => {
    expect(resolveEffectiveContextTier("T2", "T3", "COMPLEX")).toBe("T3");
  });

  test("ceiling caps the promotion", () => {
    // T0 would promote to T1 at MODERATE, but ceiling is T0
    expect(resolveEffectiveContextTier("T0", "T0", "MODERATE")).toBe("T0");
  });

  test("ceiling caps COMPLEX promotion", () => {
    // T0 would promote to T1 at COMPLEX, ceiling T1 allows it
    expect(resolveEffectiveContextTier("T0", "T1", "COMPLEX")).toBe("T1");
    // T1 would promote to T2 at COMPLEX, but ceiling is T1
    expect(resolveEffectiveContextTier("T1", "T1", "COMPLEX")).toBe("T1");
  });

  test("CRITICAL promotes T2->T3 within ceiling", () => {
    expect(resolveEffectiveContextTier("T2", "T3", "CRITICAL")).toBe("T3");
  });

  test("CRITICAL capped by T0 ceiling returns T0", () => {
    expect(resolveEffectiveContextTier("T0", "T0", "CRITICAL")).toBe("T0");
  });

  test("custom promotions map overrides defaults", () => {
    const custom: Record<
      ComplexityLevel,
      | Partial<
          Record<(typeof CONTEXT_TIERS)[number], (typeof CONTEXT_TIERS)[number]>
        >
      | undefined
    > = {
      TRIVIAL: { T0: "T2" },
      SIMPLE: undefined,
      MODERATE: undefined,
      COMPLEX: undefined,
      CRITICAL: undefined,
    };
    // Custom: TRIVIAL promotes T0->T2, ceiling T3
    expect(resolveEffectiveContextTier("T0", "T3", "TRIVIAL", custom)).toBe(
      "T2",
    );
  });

  test("custom promotions still respect ceiling", () => {
    const custom: Record<
      ComplexityLevel,
      | Partial<
          Record<(typeof CONTEXT_TIERS)[number], (typeof CONTEXT_TIERS)[number]>
        >
      | undefined
    > = {
      TRIVIAL: { T0: "T3" },
      SIMPLE: undefined,
      MODERATE: undefined,
      COMPLEX: undefined,
      CRITICAL: undefined,
    };
    // Custom: TRIVIAL promotes T0->T3, but ceiling is T1
    expect(resolveEffectiveContextTier("T0", "T1", "TRIVIAL", custom)).toBe(
      "T1",
    );
  });
});

// ---------------------------------------------------------------------------
// resolveContextTierFromMatrix
// ---------------------------------------------------------------------------

describe("resolveContextTierFromMatrix", () => {
  test("TRIVIAL returns default tier (no promotion in matrix)", () => {
    expect(resolveContextTierFromMatrix("T0", "T3", "TRIVIAL")).toBe("T0");
    expect(resolveContextTierFromMatrix("T2", "T3", "TRIVIAL")).toBe("T2");
  });

  test("SIMPLE returns default tier (no promotion in matrix)", () => {
    expect(resolveContextTierFromMatrix("T1", "T3", "SIMPLE")).toBe("T1");
  });

  test("MODERATE promotes T0->T1 from matrix", () => {
    expect(resolveContextTierFromMatrix("T0", "T3", "MODERATE")).toBe("T1");
  });

  test("COMPLEX promotes T2->T3 from matrix", () => {
    expect(resolveContextTierFromMatrix("T2", "T3", "COMPLEX")).toBe("T3");
  });

  test("CRITICAL promotes T1->T2 from matrix", () => {
    expect(resolveContextTierFromMatrix("T1", "T3", "CRITICAL")).toBe("T2");
  });

  test("matrix promotion is capped by ceiling", () => {
    // dx-advocate scenario: T0 default, T0 ceiling, CRITICAL complexity
    expect(resolveContextTierFromMatrix("T0", "T0", "CRITICAL")).toBe("T0");
  });
});
