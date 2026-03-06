import { describe, test, expect } from "bun:test";
import {
  checkAgentHealth,
  checkAllAgentsHealth,
} from "../../../src/agents/__helpers/health-check";
import type { AgentConfig } from "~/agents/__schemas/agent.schemas";

function makeConfig(
  overrides: Partial<{
    name: string;
    description: string;
    sections: AgentConfig["sections"];
  }> = {},
): AgentConfig {
  return {
    frontmatter: {
      name: overrides.name ?? "test-agent",
      description: overrides.description ?? "A test agent",
    },
    sections: overrides.sections ?? [
      { title: "Instructions", content: "Do things", order: 1 },
    ],
  };
}

describe("checkAgentHealth", () => {
  test("healthy agent with all required fields", () => {
    const result = checkAgentHealth(makeConfig());
    expect(result.healthy).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.agent_name).toBe("test-agent");
  });

  test("missing name reports issue", () => {
    const result = checkAgentHealth(makeConfig({ name: "" }));
    expect(result.healthy).toBe(false);
    expect(result.issues).toContain("Missing required field: frontmatter.name");
    expect(result.agent_name).toBe("unknown");
  });

  test("missing description reports issue", () => {
    const result = checkAgentHealth(makeConfig({ description: "" }));
    expect(result.healthy).toBe(false);
    expect(result.issues).toContain(
      "Missing required field: frontmatter.description",
    );
  });

  test("empty sections reports issue", () => {
    const result = checkAgentHealth(makeConfig({ sections: [] }));
    expect(result.healthy).toBe(false);
    expect(result.issues).toContain("Agent has no sections defined");
  });

  test("multiple issues reported together", () => {
    const result = checkAgentHealth(
      makeConfig({ name: "", description: "", sections: [] }),
    );
    expect(result.healthy).toBe(false);
    expect(result.issues).toHaveLength(3);
  });

  test("agent with valid sections passes", () => {
    const result = checkAgentHealth(
      makeConfig({
        sections: [
          { title: "Role", content: "You are an agent", order: 1 },
          { title: "Rules", content: "Follow the rules", order: 2 },
        ],
      }),
    );
    expect(result.healthy).toBe(true);
  });
});

describe("checkAllAgentsHealth", () => {
  test("returns results for all agents", () => {
    const configs = [
      makeConfig({ name: "agent-a" }),
      makeConfig({ name: "agent-b" }),
      makeConfig({ name: "" }),
    ];
    const results = checkAllAgentsHealth(configs);
    expect(results).toHaveLength(3);
    expect(results[0]!.healthy).toBe(true);
    expect(results[1]!.healthy).toBe(true);
    expect(results[2]!.healthy).toBe(false);
  });

  test("empty array returns empty results", () => {
    const results = checkAllAgentsHealth([]);
    expect(results).toHaveLength(0);
  });
});
