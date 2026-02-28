import { describe, test, expect } from "bun:test";
import { resolveModel } from "../../../../src/agents/__helpers/resolve-model";
import {
  MODEL_TIER_TO_MODEL,
  ModelTierSchema,
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
  // model_tier resolution (new in v2.3.0)
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
    // model_routing.default_model (haiku) wins over model_tier (capable→opus)
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
    // model_tier (fast→haiku) wins over gate default (sonnet)
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
