import { describe, test, expect } from "bun:test";
import { resolveModel } from "../../../../src/agents/__helpers/resolve-model";

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
});
