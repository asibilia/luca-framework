/**
 * Tests for luca-work-tracking Pi extension.
 *
 * Validates work tracking enforcement: todo linking, issue creation,
 * branch management, mutation gating, and mode configuration.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

/**
 * Create a mock Pi context for testing.
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

/** Call a registered tool by name. */
async function callTool(
  tools: Array<any>,
  name: string,
  params: Record<string, any> = {},
) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.execute("test-call", params);
}

/** Parse JSON from Pi response. */
function parseResponse(result: any): any {
  return JSON.parse(result.content[0].text);
}

// ─── Extension Loading ───────────────────────────────────────

describe("luca-work-tracking extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 5 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);
    expect(pi.tools.length).toBe(5);
  });

  test("registers expected tool names", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const names = pi.tools.map((t) => t.name);
    expect(names).toContain("luca_track_work");
    expect(names).toContain("luca_link_issue");
    expect(names).toContain("luca_work_status");
    expect(names).toContain("luca_list_todos");
    expect(names).toContain("luca_set_tracking_mode");
  });

  test("subscribes to tool_call and session_start events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(2);
    const eventNames = pi.events.map((e) => e.event);
    expect(eventNames).toContain("tool_call");
    expect(eventNames).toContain("session_start");
  });

  test("all tool names follow luca_ prefix convention", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    for (const tool of pi.tools) {
      expect(tool.name.startsWith("luca_")).toBe(true);
    }
  });
});

// ─── Tool: Work Status ───────────────────────────────────────

describe("luca_work_status", () => {
  test("returns untracked status initially", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_work_status");
    const data = parseResponse(result);

    expect(data.tracked).toBe(false);
    expect(data.todo).toBeNull();
    expect(data.mode).toBe("warn");
    expect(data.checklist.todo).toContain("✗");
  });

  test("returns valid checklist structure", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_work_status");
    const data = parseResponse(result);

    expect(data.checklist).toBeDefined();
    expect(data.checklist.todo).toBeDefined();
    expect(data.checklist.issue).toBeDefined();
    expect(data.checklist.branch).toBeDefined();
  });
});

// ─── Tool: Set Tracking Mode ─────────────────────────────────

describe("luca_set_tracking_mode", () => {
  test("accepts valid modes: warn, block, off", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    for (const mode of ["warn", "block", "off"]) {
      const result = await callTool(pi.tools, "luca_set_tracking_mode", {
        mode,
      });
      expect(result.content[0].text).toContain(mode);
    }
  });

  test("rejects invalid mode", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_set_tracking_mode", {
      mode: "invalid",
    });
    expect(result.content[0].text).toContain("Invalid mode");
  });

  test("mode change reflects in work status", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    await callTool(pi.tools, "luca_set_tracking_mode", { mode: "block" });
    const status = await callTool(pi.tools, "luca_work_status");
    const data = parseResponse(status);
    expect(data.mode).toBe("block");
  });
});

// ─── Tool: List Todos ────────────────────────────────────────

describe("luca_list_todos", () => {
  test("returns todos array", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_list_todos");
    const data = parseResponse(result);
    expect(Array.isArray(data.todos)).toBe(true);
    expect(typeof data.total).toBe("number");
  });
});

// ─── Tool: Link Issue ────────────────────────────────────────

describe("luca_link_issue", () => {
  test("links an issue number to the session", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_link_issue", { issue: 42 });
    const data = parseResponse(result);

    expect(data.issue).toBe(42);
    expect(data.message).toContain("#42");
  });

  test("notes when no todo is linked", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_link_issue", { issue: 99 });
    const data = parseResponse(result);

    expect(data.todo).toBeNull();
    expect(data.message).toContain("No todo linked");
  });
});

// ─── Tool: Track Work ────────────────────────────────────────

describe("luca_track_work", () => {
  test("rejects non-existent todo", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_track_work", {
      todo: "nonexistent-todo-slug",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("requires title when todo='new'", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const result = await callTool(pi.tools, "luca_track_work", {
      todo: "new",
    });
    expect(result.content[0].text).toContain("title is required");
  });
});

// ─── Event: Mutation Gating ──────────────────────────────────

describe("work tracking mutation gating", () => {
  test("tool_call handler does not block non-mutation tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    const handler = pi.events.find((e) => e.event === "tool_call")!.handler;
    const mockCtx = { ui: { setStatus: () => {} } };

    // read is not a mutation tool — should return undefined (no block)
    const result = await handler({ toolName: "read" }, mockCtx);
    expect(result).toBeUndefined();
  });

  test("tool_call handler does not block when mode is off", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    // Set mode to off
    await callTool(pi.tools, "luca_set_tracking_mode", { mode: "off" });

    const handler = pi.events.find((e) => e.event === "tool_call")!.handler;
    const mockCtx = { ui: { setStatus: () => {} } };

    const result = await handler({ toolName: "edit" }, mockCtx);
    expect(result).toBeUndefined();
  });

  test("tool_call handler blocks edit in block mode when untracked", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    // Set to block mode
    await callTool(pi.tools, "luca_set_tracking_mode", { mode: "block" });

    const handler = pi.events.find((e) => e.event === "tool_call")!.handler;
    const mockCtx = { ui: { setStatus: () => {} } };

    const result = await handler({ toolName: "edit" }, mockCtx);
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    expect(result.reason).toContain("Untracked");
  });

  test("tool_call handler blocks write in block mode when untracked", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    await callTool(pi.tools, "luca_set_tracking_mode", { mode: "block" });

    const handler = pi.events.find((e) => e.event === "tool_call")!.handler;
    const mockCtx = { ui: { setStatus: () => {} } };

    const result = await handler({ toolName: "write" }, mockCtx);
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
  });

  test("warn mode allows edit but sets status", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-work-tracking");
    const pi = createMockPi();
    mod.default(pi);

    // Ensure warn mode (default)
    await callTool(pi.tools, "luca_set_tracking_mode", { mode: "warn" });

    const handler = pi.events.find((e) => e.event === "tool_call")!.handler;
    let statusSet = false;
    const mockCtx = {
      ui: {
        setStatus: (_id: string, _text: string) => {
          statusSet = true;
        },
      },
    };

    const result = await handler({ toolName: "edit" }, mockCtx);
    // Warn mode returns undefined (doesn't block)
    expect(result).toBeUndefined();
    // But should set a status warning
    expect(statusSet).toBe(true);
  });
});
