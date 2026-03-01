import { describe, test, expect } from "bun:test";
import {
  resolveModel,
  resolveModelWithZone,
  resolveModelWithDecision,
} from "../../../../src/agents/__helpers/resolve-model";
import {
  MODEL_TIER_TO_MODEL,
  ModelTierSchema,
  ROLE_MODEL_DEFAULTS,
  ZONE_MODEL_ADJUSTMENTS,
} from "../../../../src/complexity/__schemas/complexity.schemas";

describe("resolveModel", () => {
  const gateWithModel = { default_model: "sonnet" as const };
  const gateWithoutModel = {};

  test("returns agent complexity override when set", () => {
    const agent = {
      model_routing: {
        default_model: "sonnet" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
    };
    expect(resolveModel(agent, "CRITICAL", gateWithModel)).toBe("opus");
  });

  test("returns agent default when no override matches", () => {
    const agent = {
      model_routing: {
        default_model: "haiku" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
    };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("returns agent default when no overrides defined", () => {
    const agent = {
      model_routing: {
        default_model: "haiku" as const,
      },
    };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("returns gate default when agent has no model_routing", () => {
    const agent = {};
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("sonnet");
  });

  test("returns sonnet as universal fallback when gate has no default_model", () => {
    const agent = {};
    expect(resolveModel(agent, "MODERATE", gateWithoutModel as any)).toBe(
      "sonnet",
    );
  });

  test("priority chain: agent override > agent default > gate default > fallback", () => {
    // Agent with all levels configured
    const fullAgent = {
      model_routing: {
        default_model: "sonnet" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
    };

    // 1. Agent override wins when matching
    expect(resolveModel(fullAgent, "CRITICAL", gateWithModel)).toBe("opus");

    // 2. Agent default wins when no override
    expect(resolveModel(fullAgent, "SIMPLE", gateWithModel)).toBe("sonnet");

    // 3. Gate default wins when no agent routing
    expect(resolveModel({}, "SIMPLE", gateWithModel)).toBe("sonnet");

    // 4. Fallback when nothing configured
    expect(resolveModel({}, "SIMPLE", gateWithoutModel as any)).toBe("sonnet");
  });

  test("handles undefined model_routing gracefully", () => {
    const agent = { model_routing: undefined };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("sonnet");
  });

  test("handles empty complexity_overrides", () => {
    const agent = {
      model_routing: {
        default_model: "haiku" as const,
        complexity_overrides: {},
      },
    };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  // -----------------------------------------------------------------------
  // model_tier resolution (v2.3.0)
  // -----------------------------------------------------------------------

  test("returns model from model_tier when no model_routing", () => {
    const agent = { model_tier: "capable" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("opus");
  });

  test("model_tier fast maps to haiku", () => {
    const agent = { model_tier: "fast" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("model_tier balanced maps to sonnet", () => {
    const agent = { model_tier: "balanced" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("sonnet");
  });

  test("model_routing.default_model takes priority over model_tier", () => {
    const agent = {
      model_routing: { default_model: "haiku" as const },
      model_tier: "capable" as const,
    };
    // model_routing.default_model (haiku) wins over model_tier (capable->opus)
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("complexity_overrides takes priority over model_tier", () => {
    const agent = {
      model_routing: {
        default_model: "sonnet" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
      model_tier: "fast" as const,
    };
    expect(resolveModel(agent, "CRITICAL", gateWithModel)).toBe("opus");
  });

  test("model_tier takes priority over gate default", () => {
    const agent = { model_tier: "fast" as const };
    // model_tier (fast->haiku) wins over gate default (sonnet)
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("full priority chain with model_tier", () => {
    // 1. Override wins
    const agentWithAll = {
      model_routing: {
        default_model: "sonnet" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
      model_tier: "fast" as const,
    };
    expect(resolveModel(agentWithAll, "CRITICAL", gateWithModel)).toBe("opus");

    // 2. model_routing.default wins over model_tier
    expect(resolveModel(agentWithAll, "SIMPLE", gateWithModel)).toBe("sonnet");

    // 3. model_tier wins over gate default
    const agentTierOnly = { model_tier: "capable" as const };
    expect(resolveModel(agentTierOnly, "SIMPLE", gateWithModel)).toBe("opus");

    // 4. Gate default when nothing
    expect(resolveModel({}, "SIMPLE", gateWithModel)).toBe("sonnet");

    // 5. Universal fallback
    expect(resolveModel({}, "SIMPLE", gateWithoutModel as any)).toBe("sonnet");
  });

  // -----------------------------------------------------------------------
  // purpose-based resolution (v2.5.0)
  // -----------------------------------------------------------------------

  test("returns role default for purpose 'researcher' (opus)", () => {
    const agent = { purpose: "researcher" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("opus");
  });

  test("returns role default for purpose 'planner' (opus)", () => {
    const agent = { purpose: "planner" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("opus");
  });

  test("returns role default for purpose 'auditor' (opus)", () => {
    const agent = { purpose: "auditor" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("opus");
  });

  test("returns role default for purpose 'executor' (sonnet)", () => {
    const agent = { purpose: "executor" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("sonnet");
  });

  test("returns role default for purpose 'general' (haiku)", () => {
    const agent = { purpose: "general" as const };
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("model_tier takes priority over purpose", () => {
    const agent = {
      model_tier: "fast" as const,
      purpose: "researcher" as const,
    };
    // model_tier (fast->haiku) wins over purpose (researcher->opus)
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("haiku");
  });

  test("purpose takes priority over gate default", () => {
    const agent = { purpose: "researcher" as const };
    // purpose (researcher->opus) wins over gate default (sonnet)
    expect(resolveModel(agent, "MODERATE", gateWithModel)).toBe("opus");
  });

  test("full priority chain with purpose", () => {
    // 1. Override wins
    const agentFull = {
      model_routing: {
        default_model: "haiku" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
      model_tier: "balanced" as const,
      purpose: "researcher" as const,
    };
    expect(resolveModel(agentFull, "CRITICAL", gateWithModel)).toBe("opus");

    // 2. model_routing.default wins
    expect(resolveModel(agentFull, "SIMPLE", gateWithModel)).toBe("haiku");

    // 3. model_tier wins over purpose
    const agentTierAndPurpose = {
      model_tier: "fast" as const,
      purpose: "researcher" as const,
    };
    expect(resolveModel(agentTierAndPurpose, "SIMPLE", gateWithModel)).toBe(
      "haiku",
    );

    // 4. purpose wins over gate default
    const agentPurposeOnly = { purpose: "auditor" as const };
    expect(resolveModel(agentPurposeOnly, "SIMPLE", gateWithModel)).toBe(
      "opus",
    );

    // 5. Gate default when nothing
    expect(resolveModel({}, "SIMPLE", gateWithModel)).toBe("sonnet");

    // 6. Universal fallback
    expect(resolveModel({}, "SIMPLE", gateWithoutModel as any)).toBe("sonnet");
  });
});

// ---------------------------------------------------------------------------
// MODEL_TIER_TO_MODEL mapping
// ---------------------------------------------------------------------------

describe("MODEL_TIER_TO_MODEL", () => {
  test("maps fast to haiku", () => {
    expect(MODEL_TIER_TO_MODEL.fast).toBe("haiku");
  });

  test("maps balanced to sonnet", () => {
    expect(MODEL_TIER_TO_MODEL.balanced).toBe("sonnet");
  });

  test("maps capable to opus", () => {
    expect(MODEL_TIER_TO_MODEL.capable).toBe("opus");
  });

  test("covers all ModelTier values", () => {
    const tiers = ModelTierSchema.options;
    for (const tier of tiers) {
      expect(MODEL_TIER_TO_MODEL[tier]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// ROLE_MODEL_DEFAULTS mapping
// ---------------------------------------------------------------------------

describe("ROLE_MODEL_DEFAULTS", () => {
  test("researcher maps to opus", () => {
    expect(ROLE_MODEL_DEFAULTS.researcher).toBe("opus");
  });

  test("planner maps to opus", () => {
    expect(ROLE_MODEL_DEFAULTS.planner).toBe("opus");
  });

  test("auditor maps to opus", () => {
    expect(ROLE_MODEL_DEFAULTS.auditor).toBe("opus");
  });

  test("executor maps to sonnet", () => {
    expect(ROLE_MODEL_DEFAULTS.executor).toBe("sonnet");
  });

  test("verifier maps to sonnet", () => {
    expect(ROLE_MODEL_DEFAULTS.verifier).toBe("sonnet");
  });

  test("reviewer maps to sonnet", () => {
    expect(ROLE_MODEL_DEFAULTS.reviewer).toBe("sonnet");
  });

  test("synthesizer maps to sonnet", () => {
    expect(ROLE_MODEL_DEFAULTS.synthesizer).toBe("sonnet");
  });

  test("general maps to haiku", () => {
    expect(ROLE_MODEL_DEFAULTS.general).toBe("haiku");
  });
});

// ---------------------------------------------------------------------------
// resolveModelWithZone
// ---------------------------------------------------------------------------

describe("resolveModelWithZone", () => {
  const gate = { default_model: "sonnet" as const };

  test("returns base model in peak zone (no adjustment)", () => {
    const agent = { model_tier: "capable" as const };
    expect(resolveModelWithZone(agent, "MODERATE", gate, "peak")).toBe("opus");
  });

  test("returns base model in good zone (no adjustment)", () => {
    const agent = { model_tier: "capable" as const };
    expect(resolveModelWithZone(agent, "MODERATE", gate, "good")).toBe("opus");
  });

  test("returns sonnet in degrading zone", () => {
    const agent = { model_tier: "capable" as const };
    expect(resolveModelWithZone(agent, "MODERATE", gate, "degrading")).toBe(
      "sonnet",
    );
  });

  test("returns haiku in stop zone", () => {
    const agent = { model_tier: "capable" as const };
    expect(resolveModelWithZone(agent, "MODERATE", gate, "stop")).toBe("haiku");
  });

  test("zone adjustment overrides even agent complexity override", () => {
    const agent = {
      model_routing: {
        default_model: "opus" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
    };
    expect(resolveModelWithZone(agent, "CRITICAL", gate, "stop")).toBe("haiku");
  });

  test("purpose-based model is adjusted by zone", () => {
    const agent = { purpose: "researcher" as const };
    // researcher -> opus, but degrading -> sonnet
    expect(resolveModelWithZone(agent, "MODERATE", gate, "degrading")).toBe(
      "sonnet",
    );
  });
});

// ---------------------------------------------------------------------------
// ZONE_MODEL_ADJUSTMENTS mapping
// ---------------------------------------------------------------------------

describe("ZONE_MODEL_ADJUSTMENTS", () => {
  test("peak has no adjustment", () => {
    expect(ZONE_MODEL_ADJUSTMENTS.peak).toBeNull();
  });

  test("good has no adjustment", () => {
    expect(ZONE_MODEL_ADJUSTMENTS.good).toBeNull();
  });

  test("degrading adjusts to sonnet", () => {
    expect(ZONE_MODEL_ADJUSTMENTS.degrading).toBe("sonnet");
  });

  test("stop adjusts to haiku", () => {
    expect(ZONE_MODEL_ADJUSTMENTS.stop).toBe("haiku");
  });
});

// ---------------------------------------------------------------------------
// resolveModelWithDecision
// ---------------------------------------------------------------------------

describe("resolveModelWithDecision", () => {
  const gate = { default_model: "sonnet" as const };
  const gateEmpty = {} as any;

  test("returns complexity_override source when override matches", () => {
    const agent = {
      model_routing: {
        default_model: "sonnet" as const,
        complexity_overrides: { CRITICAL: "opus" as const },
      },
    };
    const decision = resolveModelWithDecision(agent, "CRITICAL", gate);
    expect(decision.model).toBe("opus");
    expect(decision.source).toBe("complexity_override");
    expect(decision.reason).toContain("Complexity override");
  });

  test("returns agent_default source when agent default model is set", () => {
    const agent = {
      model_routing: { default_model: "haiku" as const },
    };
    const decision = resolveModelWithDecision(agent, "MODERATE", gate);
    expect(decision.model).toBe("haiku");
    expect(decision.source).toBe("agent_default");
    expect(decision.reason).toContain("Agent default");
  });

  test("returns model_tier source when tier is set", () => {
    const agent = { model_tier: "capable" as const };
    const decision = resolveModelWithDecision(agent, "MODERATE", gate);
    expect(decision.model).toBe("opus");
    expect(decision.source).toBe("model_tier");
    expect(decision.reason).toContain("capable");
  });

  test("returns role_default source when purpose is set", () => {
    const agent = { purpose: "researcher" as const };
    const decision = resolveModelWithDecision(agent, "MODERATE", gate);
    expect(decision.model).toBe("opus");
    expect(decision.source).toBe("role_default");
    expect(decision.reason).toContain("researcher");
  });

  test("returns gate_default source when only gate has model", () => {
    const decision = resolveModelWithDecision({}, "MODERATE", gate);
    expect(decision.model).toBe("sonnet");
    expect(decision.source).toBe("gate_default");
    expect(decision.reason).toContain("Gate default");
  });

  test("returns universal_fallback source when nothing configured", () => {
    const decision = resolveModelWithDecision({}, "MODERATE", gateEmpty);
    expect(decision.model).toBe("sonnet");
    expect(decision.source).toBe("universal_fallback");
    expect(decision.reason).toContain("Universal fallback");
  });

  test("applies zone adjustment and returns zone_adjustment source", () => {
    const agent = { purpose: "researcher" as const };
    const decision = resolveModelWithDecision(
      agent,
      "MODERATE",
      gate,
      "degrading",
    );
    expect(decision.model).toBe("sonnet");
    expect(decision.source).toBe("zone_adjustment");
    expect(decision.originalModel).toBe("opus");
    expect(decision.zone).toBe("degrading");
    expect(decision.reason).toContain("opus -> sonnet");
  });

  test("no zone adjustment in peak zone", () => {
    const agent = { purpose: "researcher" as const };
    const decision = resolveModelWithDecision(agent, "MODERATE", gate, "peak");
    expect(decision.model).toBe("opus");
    expect(decision.source).toBe("role_default");
    expect(decision.originalModel).toBeUndefined();
    expect(decision.zone).toBeUndefined();
  });

  test("stop zone downgrades to haiku with decision record", () => {
    const agent = { model_tier: "capable" as const };
    const decision = resolveModelWithDecision(agent, "CRITICAL", gate, "stop");
    expect(decision.model).toBe("haiku");
    expect(decision.source).toBe("zone_adjustment");
    expect(decision.originalModel).toBe("opus");
    expect(decision.zone).toBe("stop");
  });
});
