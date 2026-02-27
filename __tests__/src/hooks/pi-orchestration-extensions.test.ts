/**
 * Tests for Pi orchestration extensions (Phase 64).
 *
 * Validates that all 4 Luca agent orchestration extensions for Pi register
 * the correct tools, handle events, and follow the Pi extension API.
 *
 * Extensions tested:
 * - luca-roles: Tool-restricted agent role enforcement
 * - luca-teams: Agent team dispatcher pattern
 * - luca-chain: Sequential agent pipeline orchestration
 * - luca-tilldone: Task-gated retry loops
 */
import { describe, test, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Create a mock Pi context that records tool registrations and event handlers.
 */
function createMockPi() {
  const tools: Array<{
    name: string;
    label: string;
    description: string;
    parameters: any;
    execute: Function;
  }> = [];
  const events: Array<{
    event: string;
    handler: Function;
  }> = [];

  return {
    tools,
    events,
    registerTool(tool: any) {
      tools.push(tool);
    },
    on(event: string, handler: Function) {
      events.push({ event, handler });
    },
  };
}

// ---------------------------------------------------------------------------
// luca-roles extension
// ---------------------------------------------------------------------------

describe("luca-roles extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 4 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(4);
  });

  test("registers luca_list_roles tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_list_roles");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("agent roles");
  });

  test("registers luca_activate_role tool with required role param", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_activate_role");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("role");
  });

  test("registers luca_deactivate_role tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_deactivate_role");
    expect(tool).toBeDefined();
  });

  test("registers luca_active_role tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_active_role");
    expect(tool).toBeDefined();
  });

  test("subscribes to tool_call event for enforcement", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const toolCall = pi.events.find((e) => e.event === "tool_call");
    expect(toolCall).toBeDefined();
  });

  test("luca_active_role returns inactive when no role set", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_active_role");
    const result = await tool!.execute();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.active).toBe(false);
    expect(parsed.role).toBeNull();
  });

  test("luca_activate_role rejects non-existent role", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_activate_role");
    const result = await tool!.execute("test-id", {
      role: "nonexistent-role-12345",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_deactivate_role works when no role active", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_deactivate_role");
    const result = await tool!.execute();
    expect(result.content[0].text).toContain("Deactivated");
  });

  test("tool_call handler allows all tools when no role active", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const toolCallHandler = pi.events.find(
      (e) => e.event === "tool_call",
    )!.handler;
    const result = await toolCallHandler({ toolName: "SomeTool" }, {});
    // Should return undefined (no block) when no role active
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// luca-teams extension
// ---------------------------------------------------------------------------

describe("luca-teams extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 3 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(3);
  });

  test("registers luca_list_teams tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_list_teams");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("teams");
  });

  test("registers luca_define_team tool with required params", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_team");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("name");
    expect(tool!.parameters.required).toContain("description");
    expect(tool!.parameters.required).toContain("agents");
  });

  test("registers luca_dispatch_team tool with required params", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_dispatch_team");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("team");
    expect(tool!.parameters.required).toContain("task");
  });

  test("luca_list_teams returns pre-defined teams", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_list_teams");
    const result = await tool!.execute();
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);

    const teamNames = parsed.map((t: any) => t.name);
    expect(teamNames).toContain("code-review");
    expect(teamNames).toContain("research");
    expect(teamNames).toContain("quality");
    expect(teamNames).toContain("security");
  });

  test("luca_dispatch_team rejects non-existent team", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_dispatch_team");
    const result = await tool!.execute("test-id", {
      team: "nonexistent-team",
      task: "test task",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_define_team rejects agents that do not exist", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_team");
    const result = await tool!.execute("test-id", {
      name: "test-team",
      description: "Test",
      agents: "fake-agent-1,fake-agent-2",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("does not subscribe to any events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-teams");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// luca-chain extension
// ---------------------------------------------------------------------------

describe("luca-chain extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 3 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(3);
  });

  test("registers luca_define_chain tool with required params", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_chain");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("name");
    expect(tool!.parameters.required).toContain("steps");
  });

  test("registers luca_chain_next tool with required chain param", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_chain_next");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("chain");
  });

  test("registers luca_chain_status tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_chain_status");
    expect(tool).toBeDefined();
  });

  test("luca_define_chain rejects invalid step format", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_chain");
    const result = await tool!.execute("test-id", {
      name: "test-chain",
      steps: "invalid-no-colon -> also-invalid",
    });
    expect(result.content[0].text).toContain("Invalid step format");
  });

  test("luca_define_chain rejects non-existent agents", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_chain");
    const result = await tool!.execute("test-id", {
      name: "test-chain",
      steps: "fake-agent-xyz:do something",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_chain_next rejects non-existent chain", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_chain_next");
    const result = await tool!.execute("test-id", {
      chain: "nonexistent-chain",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_chain_status returns empty array when no chains defined", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_chain_status");
    const result = await tool!.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);
  });

  test("does not subscribe to any events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-chain");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// luca-tilldone extension
// ---------------------------------------------------------------------------

describe("luca-tilldone extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 3 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(3);
  });

  test("registers luca_tilldone tool with required params", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_tilldone");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("name");
    expect(tool!.parameters.required).toContain("command");
    expect(tool!.description).toContain("until it succeeds");
  });

  test("registers luca_loop_status tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_loop_status");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("status");
  });

  test("registers luca_loop_reset tool with required name param", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_loop_reset");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("name");
  });

  test("luca_tilldone runs a passing command successfully", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_tilldone");
    const result = await tool!.execute("test-id", {
      name: "echo-test",
      command: "echo hello",
      max_iterations: 3,
      timeout: 10,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("passed");
    expect(parsed.iteration).toBe(1);
    expect(parsed.loop_status).toBe("passed");
    expect(parsed.output).toContain("hello");
  });

  test("luca_tilldone handles failing command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_tilldone");
    const result = await tool!.execute("test-id", {
      name: "fail-test",
      command: "false",
      max_iterations: 3,
      timeout: 10,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("failed");
    expect(parsed.iteration).toBe(1);
    expect(parsed.remaining).toBe(2);
    expect(parsed.instructions).toContain("Fix the issues");
  });

  test("luca_loop_status returns empty array when no loops", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_loop_status");
    const result = await tool!.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);
  });

  test("luca_loop_reset rejects non-existent loop", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_loop_reset");
    const result = await tool!.execute("test-id", {
      name: "nonexistent-loop",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("does not subscribe to any events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-tilldone");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-extension integration
// ---------------------------------------------------------------------------

describe("Pi orchestration extensions integration", () => {
  const extensionFiles = [
    "luca-roles.ts",
    "luca-teams.ts",
    "luca-chain.ts",
    "luca-tilldone.ts",
  ];

  test("all 4 extension source files exist", () => {
    for (const file of extensionFiles) {
      const fullPath = join(
        process.cwd(),
        "src",
        "hooks",
        "pi-extensions",
        file,
      );
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  test("each extension has a default export function", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
    ]);

    for (const mod of modules) {
      expect(typeof mod.default).toBe("function");
    }
  });

  test("total tool count across orchestration extensions is 13", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
    ]);

    let totalTools = 0;
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      totalTools += pi.tools.length;
    }

    // roles: 4 + teams: 3 + chain: 3 + tilldone: 3 = 13
    expect(totalTools).toBe(13);
  });

  test("no duplicate tool names across orchestration extensions", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
    ]);

    const toolNames: string[] = [];
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      toolNames.push(...pi.tools.map((t) => t.name));
    }

    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });

  test("no duplicate tool names across ALL Pi extensions (workflow + orchestration)", async () => {
    const modules = await Promise.all([
      // Phase 63 (workflow)
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
      // Phase 64 (orchestration)
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
    ]);

    const toolNames: string[] = [];
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      toolNames.push(...pi.tools.map((t) => t.name));
    }

    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });

  test("all tool names follow luca_ prefix convention", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
    ]);

    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      for (const tool of pi.tools) {
        expect(tool.name.startsWith("luca_")).toBe(true);
      }
    }
  });

  test("total tools across ALL 8 extensions is 24", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
    ]);

    let totalTools = 0;
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      totalTools += pi.tools.length;
    }

    // state:3 + memory:4 + harness:1 + complexity:3 + roles:4 + teams:3 + chain:3 + tilldone:3 = 24
    expect(totalTools).toBe(24);
  });
});
