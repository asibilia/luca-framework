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

  test("subscribes to session_start, tool_call, tool_execution_end, turn_start, and session events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    const sessionStart = pi.events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeDefined();
    const toolCall = pi.events.find((e) => e.event === "tool_call");
    expect(toolCall).toBeDefined();
    const toolEnd = pi.events.find((e) => e.event === "tool_execution_end");
    expect(toolEnd).toBeDefined();
    const turnStart = pi.events.find((e) => e.event === "turn_start");
    expect(turnStart).toBeDefined();
    // Plan 70-C: session reconstruction events
    const sessionSwitch = pi.events.find((e) => e.event === "session_switch");
    expect(sessionSwitch).toBeDefined();
    const sessionFork = pi.events.find((e) => e.event === "session_fork");
    expect(sessionFork).toBeDefined();
    const sessionTree = pi.events.find((e) => e.event === "session_tree");
    expect(sessionTree).toBeDefined();
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

  test("subscribes to before_agent_start event for per-turn BRAIN.md injection", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    const beforeAgentStart = pi.events.find(
      (e) => e.event === "before_agent_start",
    );
    expect(beforeAgentStart).toBeDefined();
  });

  test("registers 2 event handlers (session_start + before_agent_start)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-memory");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(2);
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

  test("does not subscribe to agent_end (verification is explicit via luca_verify)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-harness");
    const pi = createMockPi();
    mod.default(pi);

    const agentEnd = pi.events.find((e) => e.event === "agent_end");
    expect(agentEnd).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Frontmatter parser tests (new subagent metadata fields)
// ---------------------------------------------------------------------------

describe("frontmatter parser: subagent metadata", () => {
  test("parseFrontmatter parses background_spawnable, purpose, allowed_contexts", async () => {
    const { parseFrontmatter } =
      await import("~/hooks/pi-extensions/__helpers/frontmatter");

    const content = `---
name: lu-test-agent
description: A test agent
model: claude-sonnet-4-20250514
background_spawnable: true
purpose: researcher
tools:
  - Read
  - Write
allowed_contexts:
  - research
  - discovery
  - analysis
---
Body content here.`;

    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.name).toBe("lu-test-agent");
    expect(fm!.background_spawnable).toBe(true);
    expect(fm!.purpose).toBe("researcher");
    expect(fm!.allowed_contexts).toEqual(["research", "discovery", "analysis"]);
    expect(fm!.tools).toEqual(["Read", "Write"]);
  });

  test("parseFrontmatter handles background_spawnable=false", async () => {
    const { parseFrontmatter } =
      await import("~/hooks/pi-extensions/__helpers/frontmatter");

    const content = `---
name: lu-executor
description: Executes plans
background_spawnable: false
purpose: executor
---
Body.`;

    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.background_spawnable).toBe(false);
    expect(fm!.purpose).toBe("executor");
  });

  test("parseFrontmatter returns undefined for missing metadata fields", async () => {
    const { parseFrontmatter } =
      await import("~/hooks/pi-extensions/__helpers/frontmatter");

    const content = `---
name: simple-agent
description: No metadata
---
Body.`;

    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.background_spawnable).toBeUndefined();
    expect(fm!.purpose).toBeUndefined();
    expect(fm!.allowed_contexts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Subagent registry tests
// ---------------------------------------------------------------------------

describe("subagent-registry", () => {
  test("nextSubagentId generates unique IDs", async () => {
    const { nextSubagentId, resetSubagentRegistry } =
      await import("~/hooks/pi-extensions/__helpers/subagent-registry");

    resetSubagentRegistry();
    const id1 = nextSubagentId("sub", "lu-executor");
    const id2 = nextSubagentId("bg", "lu-researcher");
    expect(id1).not.toBe(id2);
    expect(id1).toContain("sub");
    expect(id1).toContain("lu-executor");
    expect(id2).toContain("bg");
    expect(id2).toContain("lu-researcher");
  });

  test("subagentRegistry is accessible and functional", async () => {
    const { subagentRegistry, resetSubagentRegistry } =
      await import("~/hooks/pi-extensions/__helpers/subagent-registry");

    resetSubagentRegistry();
    expect(subagentRegistry.size()).toBe(0);

    subagentRegistry.set("test-1", {
      id: "test-1",
      agent: "lu-test",
      task: "Test task",
      status: "running",
      output: "",
      stderr: "",
      exitCode: -1,
      usage: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      model: undefined,
      createdAt: Date.now(),
      completedAt: undefined,
      process: undefined,
      sessionDir: undefined,
    });

    expect(subagentRegistry.size()).toBe(1);
    expect(subagentRegistry.get("test-1")?.agent).toBe("lu-test");

    resetSubagentRegistry();
    expect(subagentRegistry.size()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Purpose gating reads frontmatter metadata
// ---------------------------------------------------------------------------

describe("purpose-gating frontmatter integration", () => {
  test("luca-purpose-gating loads and registers tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(6);
    const toolNames = pi.tools.map((t) => t.name);
    expect(toolNames).toContain("luca_register_purpose");
    expect(toolNames).toContain("luca_check_purpose");
    expect(toolNames).toContain("luca_eligible_agents");
    expect(toolNames).toContain("luca_defer_task");
    expect(toolNames).toContain("luca_trigger_deferred");
    expect(toolNames).toContain("luca_deferred_status");
  });

  test("luca_trigger_deferred has auto_spawn parameter", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_trigger_deferred");
    expect(tool).toBeDefined();
    expect(tool!.parameters.properties.auto_spawn).toBeDefined();
    expect(tool!.parameters.properties.auto_spawn.type).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// luca-widgets extension
// ---------------------------------------------------------------------------

describe("luca-widgets extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 0 tools (event-only extension)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(0);
  });

  test("subscribes to 6 events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(6);
  });

  test("subscribes to tool_result, tool_call, tool_execution_end, turn_start, turn_end, and agent_start", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    const expectedEvents = [
      "tool_result",
      "tool_call",
      "tool_execution_end",
      "turn_start",
      "turn_end",
      "agent_start",
    ];

    for (const eventName of expectedEvents) {
      const found = pi.events.find((e) => e.event === eventName);
      expect(found).toBeDefined();
    }
  });

  test("tool_result handler parses chain define event", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    const handler = pi.events.find((e) => e.event === "tool_result")!.handler;

    const widgets: Record<string, any> = {};
    const mockCtx = {
      ui: {
        setWidget: (id: string, component: any) => {
          widgets[id] = component;
        },
        setStatus: () => {},
      },
    };

    // Simulate luca_define_chain tool_result
    await handler(
      {
        toolName: "luca_define_chain",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                chain: "test-chain",
                steps: [
                  { agent: "lu-planner", task: "Plan it" },
                  { agent: "lu-executor", task: "Build it" },
                ],
                total_steps: 2,
              }),
            },
          ],
        },
      },
      mockCtx,
    );

    // Workflow widget should be set as a factory function
    expect(widgets["luca-workflow"]).toBeDefined();
    expect(typeof widgets["luca-workflow"]).toBe("function");

    // Factory returns a component with render()
    const component = widgets["luca-workflow"]();
    expect(typeof component.render).toBe("function");

    // Render should produce lines
    const lines = component.render(60);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("Chain:");
    expect(lines.join("\n")).toContain("test-chain");
  });

  test("tool_result handler parses tilldone event", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    const handler = pi.events.find((e) => e.event === "tool_result")!.handler;

    const widgets: Record<string, any> = {};
    const mockCtx = {
      ui: {
        setWidget: (id: string, factory: any) => {
          widgets[id] = factory;
        },
        setStatus: () => {},
      },
    };

    await handler(
      {
        toolName: "luca_tilldone",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: "test-loop",
                iteration: 2,
                max_iterations: 5,
                status: "failed",
              }),
            },
          ],
        },
      },
      mockCtx,
    );

    expect(widgets["luca-workflow"]).toBeDefined();
    const component = widgets["luca-workflow"]();
    const lines = component.render(60);
    expect(lines.join("\n")).toContain("TillDone:");
    expect(lines.join("\n")).toContain("test-loop");
  });

  test("tool_result handler parses verify event", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    const handler = pi.events.find((e) => e.event === "tool_result")!.handler;

    const widgets: Record<string, any> = {};
    const mockCtx = {
      ui: {
        setWidget: (id: string, factory: any) => {
          widgets[id] = factory;
        },
        setStatus: () => {},
      },
    };

    await handler(
      {
        toolName: "luca_verify",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "failed",
                checks: [
                  { name: "test", status: "passed", duration: 2100 },
                  { name: "typecheck", status: "failed", duration: 1400 },
                ],
              }),
            },
          ],
        },
      },
      mockCtx,
    );

    expect(widgets["luca-verify"]).toBeDefined();
    const component = widgets["luca-verify"]();
    const lines = component.render(60);
    expect(lines.join("\n")).toContain("Verify");
    expect(lines.join("\n")).toContain("test");
    expect(lines.join("\n")).toContain("typecheck");
  });

  test("agent_start clears stale widgets", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-widgets");
    const pi = createMockPi();
    mod.default(pi);

    const toolResultHandler = pi.events.find(
      (e) => e.event === "tool_result",
    )!.handler;
    const agentStartHandler = pi.events.find(
      (e) => e.event === "agent_start",
    )!.handler;

    const widgets: Record<string, any> = {};
    const mockCtx = {
      ui: {
        setWidget: (id: string, factory: any) => {
          widgets[id] = factory;
        },
        setStatus: () => {},
      },
    };

    // First, set a chain widget
    await toolResultHandler(
      {
        toolName: "luca_define_chain",
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                chain: "old-chain",
                steps: [{ agent: "lu-planner", task: "Plan" }],
                total_steps: 1,
              }),
            },
          ],
        },
      },
      mockCtx,
    );
    expect(typeof widgets["luca-workflow"]).toBe("function");

    // Then trigger agent_start — should clear (undefined)
    await agentStartHandler({}, mockCtx);
    expect(widgets["luca-workflow"]).toBeUndefined();
    expect(widgets["luca-verify"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Widget renderers (pure functions)
// ---------------------------------------------------------------------------

describe("widget-renderers", () => {
  test("getQualityZone returns correct zones", async () => {
    const { getQualityZone } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    expect(getQualityZone(0)).toBe("PEAK");
    expect(getQualityZone(15)).toBe("PEAK");
    expect(getQualityZone(30)).toBe("PEAK");
    expect(getQualityZone(31)).toBe("GOOD");
    expect(getQualityZone(50)).toBe("GOOD");
    expect(getQualityZone(51)).toBe("DEGRADING");
    expect(getQualityZone(70)).toBe("DEGRADING");
    expect(getQualityZone(71)).toBe("POOR");
    expect(getQualityZone(100)).toBe("POOR");
  });

  test("renderWorkflow returns null when no workflow active", async () => {
    const { renderWorkflow } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const result = renderWorkflow(null, null, null);
    expect(result).toBeNull();
  });

  test("renderWorkflow renders chain progress", async () => {
    const { renderWorkflow } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const component = renderWorkflow(
      {
        name: "deploy-pipeline",
        steps: [
          { agent: "lu-planner", task: "Design schema", status: "completed" },
          {
            agent: "code-developer",
            task: "Implement endpoints",
            status: "running",
          },
          {
            agent: "lu-verifier",
            task: "Run verification",
            status: "pending",
          },
        ],
        currentStep: 2,
      },
      null,
      null,
    );

    expect(component).not.toBeNull();
    const lines = component!.render(60);
    expect(lines.length).toBeGreaterThan(2); // borders + header + steps
    const text = lines.join("\n");
    expect(text).toContain("Chain:");
    expect(text).toContain("deploy-pipeline");
    expect(text).toContain("1/3 steps");
  });

  test("renderWorkflow renders research progress", async () => {
    const { renderWorkflow } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const component = renderWorkflow(
      null,
      {
        session: "api-redesign",
        experts: [
          { domain: "stack", status: "completed" },
          { domain: "architecture", status: "completed" },
          { domain: "security", status: "pending" },
        ],
      },
      null,
    );

    expect(component).not.toBeNull();
    const lines = component!.render(60);
    const text = lines.join("\n");
    expect(text).toContain("Research:");
    expect(text).toContain("api-redesign");
  });

  test("renderVerify returns null when no verify state", async () => {
    const { renderVerify } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    expect(renderVerify(null)).toBeNull();
    expect(renderVerify({ checks: [], timestamp: 0 })).toBeNull();
  });

  test("renderVerify renders check results", async () => {
    const { renderVerify } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const component = renderVerify({
      checks: [
        { name: "test", status: "passed", duration: 2100 },
        { name: "typecheck", status: "failed", duration: 1400 },
      ],
      timestamp: Date.now(),
    });

    expect(component).not.toBeNull();
    const lines = component!.render(60);
    const text = lines.join("\n");
    expect(text).toContain("Verify");
    expect(text).toContain("test");
    expect(text).toContain("typecheck");
  });

  test("renderContext returns null when pct < 0", async () => {
    const { renderContext } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    expect(renderContext(-1, "PEAK")).toBeNull();
  });

  test("renderContext renders progress bar with quality zone", async () => {
    const { renderContext } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const component = renderContext(42, "GOOD");
    expect(component).not.toBeNull();
    const lines = component!.render(60);
    const text = lines.join("\n");
    expect(text).toContain("Context");
    expect(text).toContain("42%");
    expect(text).toContain("GOOD");
  });

  test("renderContext shows warning for POOR zone", async () => {
    const { renderContext } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const component = renderContext(72, "POOR");
    expect(component).not.toBeNull();
    const lines = component!.render(60);
    const text = lines.join("\n");
    expect(text).toContain("72%");
    expect(text).toContain("POOR");
    expect(text).toContain("stop soon");
  });

  test("renderSubagents returns null when no subagents", async () => {
    const { renderSubagents } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    expect(renderSubagents(null)).toBeNull();
    expect(renderSubagents({ agents: [] })).toBeNull();
  });

  test("renderSubagents renders agent dashboard with status counts", async () => {
    const { renderSubagents } =
      await import("~/hooks/pi-extensions/__helpers/widget-renderers");

    const component = renderSubagents({
      agents: [
        {
          id: "sub-1-lu-executor",
          agent: "lu-executor",
          status: "running",
          task_preview: "Implement feature X",
          duration_ms: 12000,
        },
        {
          id: "sub-2-security-auditor",
          agent: "security-auditor",
          status: "completed",
          task_preview: "Review security of auth module",
          duration_ms: 45000,
        },
        {
          id: "sub-3-lu-verifier",
          agent: "lu-verifier",
          status: "failed",
          task_preview: "Verify phase 67",
          duration_ms: 8000,
        },
      ],
    });

    expect(component).not.toBeNull();
    const lines = component!.render(70);
    const text = lines.join("\n");
    expect(text).toContain("Subagents");
    expect(text).toContain("1 running");
    expect(text).toContain("1 done");
    expect(text).toContain("1 failed");
    expect(text).toContain("lu-executor");
    expect(text).toContain("security-auditor");
  });
});

// ---------------------------------------------------------------------------
// Spawn args: --no-extensions flag
// ---------------------------------------------------------------------------

describe("spawn.ts --no-extensions flag", () => {
  test("spawnPiSubprocess includes --no-extensions in args", async () => {
    // We cannot easily intercept the args passed to spawn() without mocking,
    // so we validate the source code contains the flag.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const spawnSource = readFileSync(
      join(
        process.cwd(),
        "src",
        "hooks",
        "pi-extensions",
        "__helpers",
        "spawn.ts",
      ),
      "utf-8",
    );

    // The args array must include "--no-extensions"
    expect(spawnSource).toContain('"--no-extensions"');

    // Verify it's in the args array construction, not in a comment
    const argsLine = spawnSource
      .split("\n")
      .find(
        (line) => line.includes("--no-extensions") && line.includes("args"),
      );
    expect(argsLine).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// sendMessage auto-delivery: luca-subagents
// ---------------------------------------------------------------------------

describe("sendMessage auto-delivery in luca-subagents", () => {
  test("luca_subagent_create passes onComplete to spawnPiSubprocess", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-subagents.ts"),
      "utf-8",
    );

    // Verify onComplete callback is wired in luca_subagent_create
    expect(source).toContain("onComplete:");
    // sendFollowUp helper handles pi.sendMessage + deliverAs: "followUp"
    expect(source).toContain("sendFollowUp(");
    expect(source).toContain('"subagent-result"');
  });

  test("sendFollowUp helper guarantees deliverAs followUp", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    // The sendFollowUp helper centralizes the pi.sendMessage + deliverAs pattern
    const helperSource = readFileSync(
      join(
        process.cwd(),
        "src",
        "hooks",
        "pi-extensions",
        "__helpers",
        "follow-up.ts",
      ),
      "utf-8",
    );

    expect(helperSource).toContain("pi.sendMessage(");
    expect(helperSource).toContain('deliverAs: "followUp"');
  });

  test("luca_subagent_continue also passes onComplete", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-subagents.ts"),
      "utf-8",
    );

    // Both create and continue should have onComplete
    const onCompleteMatches = source.match(/onComplete:/g) ?? [];
    expect(onCompleteMatches.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// sendMessage auto-delivery: luca-teams
// ---------------------------------------------------------------------------

describe("sendMessage auto-delivery in luca-teams", () => {
  test("dispatch_team background mode passes onComplete", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-teams.ts"),
      "utf-8",
    );

    expect(source).toContain("onComplete:");
    // sendFollowUp helper handles pi.sendMessage + deliverAs: "followUp"
    expect(source).toContain("sendFollowUp(");
    expect(source).toContain('"team-result"');
  });
});

// ---------------------------------------------------------------------------
// sendMessage auto-delivery: luca-purpose-gating
// ---------------------------------------------------------------------------

describe("sendMessage auto-delivery in luca-purpose-gating", () => {
  test("trigger_deferred auto_spawn passes onComplete", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(
        process.cwd(),
        "src",
        "hooks",
        "pi-extensions",
        "luca-purpose-gating.ts",
      ),
      "utf-8",
    );

    expect(source).toContain("onComplete:");
    // sendFollowUp helper handles pi.sendMessage + deliverAs: "followUp"
    expect(source).toContain("sendFollowUp(");
    expect(source).toContain('"background-result"');
  });

  test("all files use sendFollowUp helper for followUp delivery", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const files = [
      "luca-subagents.ts",
      "luca-teams.ts",
      "luca-purpose-gating.ts",
    ];

    for (const file of files) {
      const source = readFileSync(
        join(process.cwd(), "src", "hooks", "pi-extensions", file),
        "utf-8",
      );

      // Files should use sendFollowUp instead of direct pi.sendMessage
      expect(source).toContain("sendFollowUp(");
      // No direct pi.sendMessage calls should remain (DRY via helper)
      const directCalls = source.match(/pi\.sendMessage\(/g) ?? [];
      expect(directCalls.length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 70-C: renderCall/renderResult source validation
// ---------------------------------------------------------------------------

describe("renderCall/renderResult source presence", () => {
  test("luca-harness.ts has renderCall and renderResult on luca_verify", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-harness.ts"),
      "utf-8",
    );

    expect(source).toContain("renderCall(");
    expect(source).toContain("renderResult(");
    // Verify they are sync functions (no async keyword before them)
    expect(source).not.toMatch(/async\s+renderCall/);
    expect(source).not.toMatch(/async\s+renderResult/);
  });

  test("luca-subagents.ts has renderCall on create and renderResult on result", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-subagents.ts"),
      "utf-8",
    );

    expect(source).toContain("renderCall(");
    expect(source).toContain("renderResult(");
  });
});

// ---------------------------------------------------------------------------
// Plan 70-C: setActiveTools role management
// ---------------------------------------------------------------------------

describe("setActiveTools role management", () => {
  test("luca-roles.ts source uses setActiveTools", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-roles.ts"),
      "utf-8",
    );

    expect(source).toContain("pi.setActiveTools");
    expect(source).toContain("pi.getActiveTools");
    expect(source).toContain("originalTools");
  });

  test("luca-roles.ts registers session_switch handler", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    const sessionSwitch = pi.events.find((e) => e.event === "session_switch");
    expect(sessionSwitch).toBeDefined();
  });

  test("luca-roles.ts registers 3 events (tool_call + session_switch + session_start)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-roles");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(3);
    expect(pi.events[0]!.event).toBe("tool_call");
    expect(pi.events[1]!.event).toBe("session_switch");
    expect(pi.events[2]!.event).toBe("session_start");
  });
});

// ---------------------------------------------------------------------------
// Plan 70-C: setFooter in luca-state
// ---------------------------------------------------------------------------

describe("setFooter in luca-state", () => {
  test("luca-state.ts source uses setFooter", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-state.ts"),
      "utf-8",
    );

    expect(source).toContain("setFooter");
    expect(source).toContain("updateFooter");
    expect(source).toContain("subagentRegistry");
  });

  test("luca-state.ts registers 8 events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-state");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(8);
    const eventNames = pi.events.map((e) => e.event);
    expect(eventNames).toContain("session_start");
    expect(eventNames).toContain("tool_call");
    expect(eventNames).toContain("tool_execution_end");
    expect(eventNames).toContain("turn_start");
    expect(eventNames).toContain("agent_start");
    expect(eventNames).toContain("session_switch");
    expect(eventNames).toContain("session_fork");
    expect(eventNames).toContain("session_tree");
  });
});

// ---------------------------------------------------------------------------
// Plan 70-C: appendEntry in luca-safety-rules
// ---------------------------------------------------------------------------

describe("appendEntry in luca-safety-rules", () => {
  test("luca-safety-rules.ts source uses pi.appendEntry", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(
        process.cwd(),
        "src",
        "hooks",
        "pi-extensions",
        "luca-safety-rules.ts",
      ),
      "utf-8",
    );

    // appendEntry should be called for violations
    expect(source).toContain("pi.appendEntry");
    expect(source).toContain('"luca-safety-audit"');

    // Should be called in both tool_call handler and safety_check tool
    const appendCalls = source.match(/pi\.appendEntry\(/g) ?? [];
    expect(appendCalls.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Plan 70-C: luca-widgets no longer calls setStatus
// ---------------------------------------------------------------------------

describe("luca-widgets footer cleanup", () => {
  test("luca-widgets.ts does not call setStatus", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-widgets.ts"),
      "utf-8",
    );

    // Should NOT call setStatus in code (moved to luca-state.ts footer)
    // Filter out comments when checking for setStatus calls
    const codeLines = source
      .split("\n")
      .filter((line: string) => !line.trim().startsWith("//"));
    const codeOnly = codeLines.join("\n");
    expect(codeOnly).not.toContain("ctx.ui.setStatus");
    expect(codeOnly).not.toContain('.setStatus("luca-turns"');
  });

  test("luca-widgets.ts does not import status helpers", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-widgets.ts"),
      "utf-8",
    );

    // Should not import createStatusFormatter or SEP (no longer needed)
    expect(source).not.toContain("createStatusFormatter");
    expect(source).not.toContain('from "./__helpers/status"');
  });
});
