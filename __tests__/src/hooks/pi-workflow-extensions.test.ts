/**
 * Tests for Pi workflow extensions (Phase 63).
 *
 * Validates that all 4 Luca workflow extensions for Pi register
 * the correct tools, handle events, and follow the Pi extension API.
 *
 * Extensions tested:
 * - luca-state: STATE.md read/write tools
 * - luca-memory: BRAIN.md/MEMORY.md/WORKING.md tools
 * - luca-harness: Verification tools + agent_end hook
 * - luca-complexity: Complexity gating tools
 */
import { describe, test, expect, beforeEach } from "bun:test";
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
// luca-state extension
// ---------------------------------------------------------------------------

describe("luca-state extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 3 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(3);
  });

  test("registers luca_read_state tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_state");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("STATE.md");
  });

  test("registers luca_read_field tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_field");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("field");
  });

  test("registers luca_set_field tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_set_field");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("field");
    expect(tool!.parameters.required).toContain("value");
  });

  test("subscribes to session_start, tool_call, and tool_execution_end events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    const sessionStart = pi.events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeDefined();
    const toolCall = pi.events.find((e) => e.event === "tool_call");
    expect(toolCall).toBeDefined();
    const toolEnd = pi.events.find((e) => e.event === "tool_execution_end");
    expect(toolEnd).toBeDefined();
  });

  test("luca_read_state returns parsed state", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_state");
    // Execute against the real .planning/STATE.md
    const result = await tool!.execute();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");

    // Should be valid JSON
    const parsed = JSON.parse(result.content[0].text);
    expect(typeof parsed).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// luca-memory extension
// ---------------------------------------------------------------------------

describe("luca-memory extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 4 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(4);
  });

  test("registers luca_read_brain tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_brain");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("BRAIN.md");
  });

  test("registers luca_read_memory tool with category filter", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_memory");
    expect(tool).toBeDefined();
    expect(tool!.parameters.properties.category).toBeDefined();
  });

  test("registers luca_read_working tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_working");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("WORKING.md");
  });

  test("registers luca_append_working tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_append_working");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("section");
    expect(tool!.parameters.required).toContain("content");
  });

  test("luca_append_working rejects unknown sections", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_append_working");
    const result = await tool!.execute("test-id", {
      section: "nonexistent",
      content: "test",
    });
    expect(result.content[0].text).toContain("Unknown section");
  });

  test("subscribes to session_start event", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const sessionStart = pi.events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeDefined();
  });

  test("luca_read_brain returns file content", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_brain");
    const result = await tool!.execute();
    expect(result.content[0].type).toBe("text");

    // Should contain content or "not found" message
    const text = result.content[0].text;
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// luca-harness extension
// ---------------------------------------------------------------------------

describe("luca-harness extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-harness");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 1 tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-harness");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(1);
  });

  test("registers luca_verify tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-harness");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_verify");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("verification");
  });

  test("luca_verify accepts optional checks filter", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-harness");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_verify");
    expect(tool!.parameters.properties.checks).toBeDefined();
    expect(tool!.parameters.properties.checks.type).toBe("string");
  });

  test("subscribes to agent_end event", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-harness");
    const pi = createMockPi();
    mod.default(pi);

    const agentEnd = pi.events.find((e) => e.event === "agent_end");
    expect(agentEnd).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// luca-complexity extension
// ---------------------------------------------------------------------------

describe("luca-complexity extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 3 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(3);
  });

  test("registers luca_read_complexity tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_complexity");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("TRIVIAL");
  });

  test("registers luca_set_complexity tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_set_complexity");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("level");
  });

  test("registers luca_gate_check tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_gate_check");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("gating");
  });

  test("luca_read_complexity returns level and tier", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_read_complexity");
    const result = await tool!.execute();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.level).toBeDefined();
    expect(parsed.tier).toBeDefined();
    expect(["lightweight", "standard", "thorough"]).toContain(parsed.tier);
  });

  test("luca_set_complexity rejects invalid levels", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_set_complexity");
    const result = await tool!.execute("test-id", {
      level: "INVALID",
    });
    expect(result.content[0].text).toContain("Invalid level");
  });

  test("luca_gate_check returns full matrix without step param", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_gate_check");
    const result = await tool!.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.gates).toBeDefined();
    expect(parsed.gates.research).toBeDefined();
    expect(parsed.gates.uat).toBeDefined();
  });

  test("luca_gate_check returns specific step decision", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_gate_check");
    const result = await tool!.execute("test-id", {
      step: "research",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.step).toBe("research");
    expect(parsed.decision).toBeDefined();
  });

  test("luca_gate_check rejects unknown steps", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_gate_check");
    const result = await tool!.execute("test-id", {
      step: "nonexistent",
    });
    expect(result.content[0].text).toContain("Unknown step");
  });

  test("does not subscribe to session_start (owned by luca-state)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-complexity");
    const pi = createMockPi();
    mod.default(pi);

    const sessionStart = pi.events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Build pipeline integration
// ---------------------------------------------------------------------------

describe("Pi workflow extensions in build output", () => {
  const extensionFiles = [
    "luca-state.ts",
    "luca-memory.ts",
    "luca-harness.ts",
    "luca-complexity.ts",
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
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
    ]);

    for (const mod of modules) {
      expect(typeof mod.default).toBe("function");
    }
  });

  test("total tool count across all extensions is 11", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
    ]);

    let totalTools = 0;
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      totalTools += pi.tools.length;
    }

    // state: 3 + memory: 4 + harness: 1 + complexity: 3 = 11
    expect(totalTools).toBe(11);
  });

  test("no duplicate tool names across extensions", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
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
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
    ]);

    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      for (const tool of pi.tools) {
        expect(tool.name.startsWith("luca_")).toBe(true);
      }
    }
  });
});
