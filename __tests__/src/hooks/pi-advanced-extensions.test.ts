/**
 * Tests for Pi advanced extensions (Phase 65).
 *
 * Validates that all 3 Luca advanced extensions for Pi register
 * the correct tools, handle events, and follow the Pi extension API.
 *
 * Extensions tested:
 * - luca-query-experts: Parallel expert research orchestration
 * - luca-safety-rules: Safety/damage control rules with gate modes
 * - luca-purpose-gating: Purpose-based agent filtering and background tasks
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
// luca-query-experts extension
// ---------------------------------------------------------------------------

describe("luca-query-experts extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 4 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(4);
  });

  test("registers luca_define_experts tool with required params", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_experts");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("name");
    expect(tool!.parameters.required).toContain("context");
    expect(tool!.parameters.required).toContain("experts");
  });

  test("registers luca_query_expert tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_query_expert");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("session");
    expect(tool!.parameters.required).toContain("domain");
    expect(tool!.parameters.required).toContain("finding");
  });

  test("registers luca_synthesize_research tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_synthesize_research");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("session");
    expect(tool!.parameters.required).toContain("synthesis");
  });

  test("registers luca_research_status tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_research_status");
    expect(tool).toBeDefined();
  });

  test("luca_define_experts creates session with built-in experts", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_experts");
    const result = await tool!.execute("test-id", {
      name: "test-session",
      context: "Analyze the API layer",
      experts: "stack,security",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.expert_count).toBe(2);
    expect(parsed.experts[0].domain).toBe("stack");
    expect(parsed.experts[1].domain).toBe("security");
  });

  test("luca_define_experts rejects unknown domain", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_experts");
    const result = await tool!.execute("test-id", {
      name: "test-session",
      context: "Test",
      experts: "nonexistent-domain",
    });
    expect(result.content[0].text).toContain("Unknown expert domain");
  });

  test("luca_define_experts supports custom domains", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_define_experts");
    const result = await tool!.execute("test-id", {
      name: "custom-session",
      context: "Test",
      experts: "custom:testing:unit|integration|e2e",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.expert_count).toBe(1);
    expect(parsed.experts[0].domain).toBe("testing");
    expect(parsed.experts[0].focus_areas).toContain("unit");
  });

  test("luca_query_expert rejects non-existent session", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_query_expert");
    const result = await tool!.execute("test-id", {
      session: "nonexistent",
      domain: "stack",
      finding: "test",
    });
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_research_status returns empty array when no sessions", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_research_status");
    const result = await tool!.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);
  });

  test("does not subscribe to any events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-query-experts");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// luca-safety-rules extension
// ---------------------------------------------------------------------------

describe("luca-safety-rules extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 5 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(5);
  });

  test("registers luca_list_safety_rules tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_list_safety_rules");
    expect(tool).toBeDefined();
  });

  test("registers luca_register_safety_rule tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_register_safety_rule");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("id");
    expect(tool!.parameters.required).toContain("severity");
    expect(tool!.parameters.required).toContain("pattern");
  });

  test("registers luca_safety_check tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_safety_check");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("content");
  });

  test("registers luca_set_safety_mode tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_set_safety_mode");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("mode");
  });

  test("registers luca_safety_audit tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_safety_audit");
    expect(tool).toBeDefined();
  });

  test("luca_list_safety_rules returns built-in rules", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_list_safety_rules");
    const result = await tool!.execute();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.gate_mode).toBe("warn");

    const ruleIds = parsed.rules.map((r: any) => r.id);
    expect(ruleIds).toContain("destructive-git");
    expect(ruleIds).toContain("rm-recursive");
    expect(ruleIds).toContain("credentials-in-code");
  });

  test("luca_safety_check detects destructive git command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_safety_check");
    const result = await tool!.execute("test-id", {
      content: "git push --force origin main",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.safe).toBe(false);
    expect(parsed.violations.length).toBeGreaterThan(0);
    expect(parsed.violations[0].severity).toBe("critical");
  });

  test("luca_safety_check passes safe content", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_safety_check");
    const result = await tool!.execute("test-id", {
      content: "git add . && git commit -m 'safe commit'",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.safe).toBe(true);
    expect(parsed.violations.length).toBe(0);
  });

  test("luca_set_safety_mode rejects invalid modes", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_set_safety_mode");
    const result = await tool!.execute("test-id", { mode: "invalid" });
    expect(result.content[0].text).toContain("Invalid mode");
  });

  test("luca_set_safety_mode accepts valid modes", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_set_safety_mode");
    const result = await tool!.execute("test-id", { mode: "block" });
    expect(result.content[0].text).toContain("block");
  });

  test("luca_register_safety_rule rejects invalid severity", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_register_safety_rule");
    const result = await tool!.execute("test-id", {
      id: "test",
      name: "Test Rule",
      severity: "invalid",
      pattern: "test",
      mitigation: "fix it",
    });
    expect(result.content[0].text).toContain("Invalid severity");
  });

  test("luca_safety_audit returns empty log initially", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_safety_audit");
    const result = await tool!.execute("test-id", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_entries).toBe(0);
  });

  test("subscribes to tool_call event for enforcement", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const toolCall = pi.events.find((e) => e.event === "tool_call");
    expect(toolCall).toBeDefined();
  });

  test("tool_call handler ignores non-bash tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-safety-rules");
    const pi = createMockPi();
    mod.default(pi);

    const handler = pi.events.find((e) => e.event === "tool_call")!.handler;
    const result = await handler({ toolName: "Read", params: {} }, {});
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// luca-purpose-gating extension
// ---------------------------------------------------------------------------

describe("luca-purpose-gating extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 6 tools", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(6);
  });

  test("registers luca_register_purpose tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_register_purpose");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("agent");
    expect(tool!.parameters.required).toContain("purpose");
  });

  test("registers luca_check_purpose tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_check_purpose");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("agent");
    expect(tool!.parameters.required).toContain("context");
  });

  test("registers luca_eligible_agents tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_eligible_agents");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("context");
  });

  test("registers luca_defer_task tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_defer_task");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("agent");
    expect(tool!.parameters.required).toContain("trigger");
    expect(tool!.parameters.required).toContain("context");
  });

  test("registers luca_trigger_deferred tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_trigger_deferred");
    expect(tool).toBeDefined();
    expect(tool!.parameters.required).toContain("trigger");
  });

  test("registers luca_deferred_status tool", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_deferred_status");
    expect(tool).toBeDefined();
  });

  test("luca_register_purpose rejects invalid purpose", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_register_purpose");
    const result = await tool!.execute("test-id", {
      agent: "test-agent",
      purpose: "invalid",
    });
    expect(result.content[0].text).toContain("Invalid purpose");
  });

  test("luca_register_purpose accepts valid purposes", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_register_purpose");
    const result = await tool!.execute("test-id", {
      agent: "test-agent",
      purpose: "researcher",
      allowed_contexts: "research,analysis",
      background_spawnable: true,
    });
    expect(result.content[0].text).toContain("registered");
    expect(result.content[0].text).toContain("researcher");
  });

  test("luca_check_purpose reports unregistered agent", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_check_purpose");
    const result = await tool!.execute("test-id", {
      agent: "nonexistent-agent-xyz",
      context: "research",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.compatible).toBe(false);
  });

  test("luca_deferred_status returns empty initially", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_deferred_status");
    const result = await tool!.execute();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(0);
    expect(parsed.pending).toBe(0);
  });

  test("luca_trigger_deferred returns empty when no matching tasks", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const tool = pi.tools.find((t) => t.name === "luca_trigger_deferred");
    const result = await tool!.execute("test-id", {
      trigger: "phase_complete",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.triggered_count).toBe(0);
  });

  test("subscribes to session_start for auto-discovery", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-purpose-gating");
    const pi = createMockPi();
    mod.default(pi);

    const sessionStart = pi.events.find((e) => e.event === "session_start");
    expect(sessionStart).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-extension integration
// ---------------------------------------------------------------------------

describe("Pi advanced extensions integration", () => {
  const extensionFiles = [
    "luca-query-experts.ts",
    "luca-safety-rules.ts",
    "luca-purpose-gating.ts",
  ];

  test("all 3 extension source files exist", () => {
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
      import("~/hooks/pi-extensions/luca-query-experts"),
      import("~/hooks/pi-extensions/luca-safety-rules"),
      import("~/hooks/pi-extensions/luca-purpose-gating"),
    ]);

    for (const mod of modules) {
      expect(typeof mod.default).toBe("function");
    }
  });

  test("total tool count across advanced extensions is 15", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-query-experts"),
      import("~/hooks/pi-extensions/luca-safety-rules"),
      import("~/hooks/pi-extensions/luca-purpose-gating"),
    ]);

    let totalTools = 0;
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      totalTools += pi.tools.length;
    }

    // query-experts: 4 + safety-rules: 5 + purpose-gating: 6 = 15
    expect(totalTools).toBe(15);
  });

  test("no duplicate tool names across advanced extensions", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-query-experts"),
      import("~/hooks/pi-extensions/luca-safety-rules"),
      import("~/hooks/pi-extensions/luca-purpose-gating"),
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

  test("no duplicate tool names across ALL 11 Pi extensions", async () => {
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
      // Phase 65 (advanced)
      import("~/hooks/pi-extensions/luca-query-experts"),
      import("~/hooks/pi-extensions/luca-safety-rules"),
      import("~/hooks/pi-extensions/luca-purpose-gating"),
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
      import("~/hooks/pi-extensions/luca-query-experts"),
      import("~/hooks/pi-extensions/luca-safety-rules"),
      import("~/hooks/pi-extensions/luca-purpose-gating"),
    ]);

    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      for (const tool of pi.tools) {
        expect(tool.name.startsWith("luca_")).toBe(true);
      }
    }
  });

  test("total tools across ALL 11 extensions is 39", async () => {
    const modules = await Promise.all([
      import("~/hooks/pi-extensions/luca-state"),
      import("~/hooks/pi-extensions/luca-memory"),
      import("~/hooks/pi-extensions/luca-harness"),
      import("~/hooks/pi-extensions/luca-complexity"),
      import("~/hooks/pi-extensions/luca-roles"),
      import("~/hooks/pi-extensions/luca-teams"),
      import("~/hooks/pi-extensions/luca-chain"),
      import("~/hooks/pi-extensions/luca-tilldone"),
      import("~/hooks/pi-extensions/luca-query-experts"),
      import("~/hooks/pi-extensions/luca-safety-rules"),
      import("~/hooks/pi-extensions/luca-purpose-gating"),
    ]);

    let totalTools = 0;
    for (const mod of modules) {
      const pi = createMockPi();
      mod.default(pi);
      totalTools += pi.tools.length;
    }

    // state:3 + memory:4 + harness:1 + complexity:3 + roles:4 + teams:3 + chain:3 + tilldone:3 + experts:4 + safety:5 + purpose:6 = 39
    expect(totalTools).toBe(39);
  });
});
