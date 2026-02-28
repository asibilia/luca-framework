/**
 * E2E validation for Pi extensions.
 *
 * Tests that all 12 extensions load from their deployed location
 * (.pi/extensions/), register expected tools/events, return valid
 * Pi-compatible responses, and work together cross-extension.
 *
 * These tests validate the DEPLOYED output (post-build), not source files.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "path";
import { existsSync } from "fs";

const extensionDir = join(process.cwd(), ".pi", "extensions");

/**
 * Minimal mock of Pi's ExtensionAPI for loading extensions.
 */
function createMockPi() {
  const tools = new Map<string, any>();
  const events = new Map<string, Function[]>();
  const commands = new Map<string, any>();

  return {
    api: {
      registerTool: (def: any) => tools.set(def.name, def),
      on: (event: string, handler: Function) => {
        if (!events.has(event)) events.set(event, []);
        events.get(event)!.push(handler);
      },
      registerCommand: (name: string, opts: any) => commands.set(name, opts),
    },
    tools,
    events,
    commands,
  };
}

/** Load a single extension and return its registered tools/events. */
async function loadExtension(fileName: string) {
  const mock = createMockPi();
  const path = join(extensionDir, fileName);
  const mod = await import(path);
  mod.default(mock.api);
  return mock;
}

/** Load ALL extensions into a shared mock Pi. */
async function loadAllExtensions() {
  const mock = createMockPi();
  const files = [
    "luca-state.ts",
    "luca-memory.ts",
    "luca-harness.ts",
    "luca-complexity.ts",
    "luca-roles.ts",
    "luca-teams.ts",
    "luca-chain.ts",
    "luca-tilldone.ts",
    "luca-query-experts.ts",
    "luca-safety-rules.ts",
    "luca-purpose-gating.ts",
    "luca-subagents.ts",
    "luca-work-tracking.ts",
    "luca-widgets.ts",
    "luca-hooks.ts",
  ];
  for (const f of files) {
    const mod = await import(join(extensionDir, f));
    mod.default(mock.api);
  }
  return mock;
}

/** Execute a tool and return the response. */
async function callTool(
  tools: Map<string, any>,
  name: string,
  params: Record<string, any> = {},
) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.execute("test-call", params);
}

/** Validate Pi response shape. */
function expectPiResponse(result: any) {
  expect(result).toBeDefined();
  expect(result.content).toBeArray();
  expect(result.content.length).toBeGreaterThan(0);
  expect(result.content[0].type).toBe("text");
  expect(typeof result.content[0].text).toBe("string");
}

// ─── Extension Loading ───────────────────────────────────────

describe("Pi extension E2E: loading", () => {
  const extensionFiles = [
    { file: "luca-state.ts", tools: 3, events: 4 },
    { file: "luca-memory.ts", tools: 4, events: 1 },
    { file: "luca-harness.ts", tools: 1, events: 0 },
    { file: "luca-complexity.ts", tools: 3, events: 0 },
    { file: "luca-roles.ts", tools: 4, events: 1 },
    { file: "luca-teams.ts", tools: 3, events: 0 },
    { file: "luca-chain.ts", tools: 3, events: 0 },
    { file: "luca-tilldone.ts", tools: 3, events: 0 },
    { file: "luca-query-experts.ts", tools: 4, events: 0 },
    { file: "luca-safety-rules.ts", tools: 5, events: 1 },
    { file: "luca-purpose-gating.ts", tools: 6, events: 1 },
    { file: "luca-subagents.ts", tools: 5, events: 1 },
    { file: "luca-work-tracking.ts", tools: 5, events: 2 },
    { file: "luca-widgets.ts", tools: 0, events: 6 },
    { file: "luca-hooks.ts", tools: 0, events: 9 },
  ];

  for (const ext of extensionFiles) {
    test(`${ext.file} loads and registers ${ext.tools} tools, ${ext.events} events`, async () => {
      expect(existsSync(join(extensionDir, ext.file))).toBe(true);
      const mock = await loadExtension(ext.file);
      expect(mock.tools.size).toBe(ext.tools);
      expect(
        Array.from(mock.events.values()).reduce(
          (sum, handlers) => sum + handlers.length,
          0,
        ),
      ).toBe(ext.events);
    });
  }

  test("__helpers/index.ts is NOT deployed (would be auto-discovered as extension)", () => {
    expect(existsSync(join(extensionDir, "__helpers", "index.ts"))).toBe(false);
  });

  test("__helpers individual files ARE deployed", () => {
    for (const file of [
      "response.ts",
      "frontmatter.ts",
      "exec.ts",
      "registry.ts",
      "sanitize.ts",
      "status.ts",
      "widget-renderers.ts",
      "spawn.ts",
      "subagent-registry.ts",
    ]) {
      expect(existsSync(join(extensionDir, "__helpers", file))).toBe(true);
    }
  });

  test("all extensions combined register exactly 49 tools", async () => {
    const mock = await loadAllExtensions();
    expect(mock.tools.size).toBe(49);
  });
});

// ─── Tool Response Validation ───────────────────────────────

describe("Pi extension E2E: tool responses", () => {
  let tools: Map<string, any>;

  beforeAll(async () => {
    const mock = await loadAllExtensions();
    tools = mock.tools;
  });

  test("luca_read_state returns valid JSON response", async () => {
    const result = await callTool(tools, "luca_read_state");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(typeof data).toBe("object");
  });

  test("luca_read_brain returns BRAIN.md content", async () => {
    const result = await callTool(tools, "luca_read_brain");
    expectPiResponse(result);
    expect(result.content[0].text).toContain("Project Brain");
  });

  test("luca_read_memory returns MEMORY.md content", async () => {
    const result = await callTool(tools, "luca_read_memory");
    expectPiResponse(result);
    expect(result.content[0].text).toContain("Long-term Memory");
  });

  test("luca_read_complexity returns level and tier", async () => {
    const result = await callTool(tools, "luca_read_complexity");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.level).toBeDefined();
    expect(data.tier).toBeDefined();
  });

  test("luca_gate_check returns decision for valid step", async () => {
    const result = await callTool(tools, "luca_gate_check", {
      step: "research",
    });
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.decision).toBeDefined();
    expect(data.step).toBe("research");
  });

  test("luca_list_roles returns array of roles", async () => {
    const result = await callTool(tools, "luca_list_roles");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });

  test("luca_list_teams returns array of teams", async () => {
    const result = await callTool(tools, "luca_list_teams");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });

  test("luca_list_safety_rules returns rules with gate_mode", async () => {
    const result = await callTool(tools, "luca_list_safety_rules");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.gate_mode).toBeDefined();
    expect(Array.isArray(data.rules)).toBe(true);
  });

  test("luca_safety_check detects dangerous content", async () => {
    const result = await callTool(tools, "luca_safety_check", {
      content: "rm -rf /",
    });
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.safe).toBe(false);
    expect(data.violations.length).toBeGreaterThan(0);
  });

  test("luca_active_role returns inactive when no role set", async () => {
    const result = await callTool(tools, "luca_active_role");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.active).toBe(false);
  });

  test("luca_chain_status returns empty array initially", async () => {
    const result = await callTool(tools, "luca_chain_status");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });

  test("luca_loop_status returns empty array initially", async () => {
    const result = await callTool(tools, "luca_loop_status");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });

  test("luca_deferred_status returns empty state", async () => {
    const result = await callTool(tools, "luca_deferred_status");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.total).toBe(0);
  });

  test("luca_subagent_list returns empty array initially", async () => {
    const result = await callTool(tools, "luca_subagent_list");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  test("luca_subagent_result returns not-found for invalid ID", async () => {
    const result = await callTool(tools, "luca_subagent_result", {
      id: "nonexistent",
    });
    expectPiResponse(result);
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_subagent_remove returns not-found for invalid ID", async () => {
    const result = await callTool(tools, "luca_subagent_remove", {
      id: "nonexistent",
    });
    expectPiResponse(result);
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_subagent_continue returns not-found for invalid ID", async () => {
    const result = await callTool(tools, "luca_subagent_continue", {
      id: "nonexistent",
      message: "continue",
    });
    expectPiResponse(result);
    expect(result.content[0].text).toContain("not found");
  });

  test("luca_work_status returns tracking state", async () => {
    const result = await callTool(tools, "luca_work_status");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(typeof data.tracked).toBe("boolean");
    expect(data.mode).toBeDefined();
    expect(data.checklist).toBeDefined();
  });

  test("luca_list_todos returns array", async () => {
    const result = await callTool(tools, "luca_list_todos");
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.todos)).toBe(true);
  });

  test("luca_set_tracking_mode rejects invalid mode", async () => {
    const result = await callTool(tools, "luca_set_tracking_mode", {
      mode: "invalid",
    });
    expectPiResponse(result);
    expect(result.content[0].text).toContain("Invalid mode");
  });
});

// ─── Cross-Extension Integration ────────────────────────────

describe("Pi extension E2E: cross-extension integration", () => {
  let tools: Map<string, any>;

  beforeAll(async () => {
    const mock = await loadAllExtensions();
    tools = mock.tools;
  });

  test("complexity → gate check flow", async () => {
    const complexity = await callTool(tools, "luca_read_complexity");
    const { level } = JSON.parse(complexity.content[0].text);

    const gate = await callTool(tools, "luca_gate_check", {
      step: "code_review",
    });
    const gateData = JSON.parse(gate.content[0].text);
    expect(gateData.level).toBe(level);
    expect(gateData.decision).toBeDefined();
  });

  test("safety rule register → check → audit", async () => {
    await callTool(tools, "luca_register_safety_rule", {
      id: "e2e-no-eval",
      name: "No eval",
      severity: "high",
      pattern: "eval(",
      mitigation: "Use safer alternatives",
    });

    const check = await callTool(tools, "luca_safety_check", {
      content: "const result = eval(input)",
    });
    const checkData = JSON.parse(check.content[0].text);
    expect(checkData.safe).toBe(false);

    const audit = await callTool(tools, "luca_safety_audit");
    const auditData = JSON.parse(audit.content[0].text);
    expect(auditData.total_entries).toBeGreaterThan(0);
  });

  test("role activate → query → deactivate", async () => {
    await callTool(tools, "luca_activate_role", { role: "lu-executor" });

    const active = await callTool(tools, "luca_active_role");
    const activeData = JSON.parse(active.content[0].text);
    expect(activeData.active).toBe(true);
    expect(activeData.role).toBe("lu-executor");

    await callTool(tools, "luca_deactivate_role");

    const inactive = await callTool(tools, "luca_active_role");
    const inactiveData = JSON.parse(inactive.content[0].text);
    expect(inactiveData.active).toBe(false);
  });

  test("research session define → query expert → status", async () => {
    await callTool(tools, "luca_define_experts", {
      name: "e2e-test-session",
      context: "E2E validation",
      experts: "stack,architecture",
    });

    await callTool(tools, "luca_query_expert", {
      session: "e2e-test-session",
      domain: "stack",
      finding: "TypeScript is the primary language",
      confidence: "high",
    });

    const status = await callTool(tools, "luca_research_status", {
      session: "e2e-test-session",
    });
    const statusData = JSON.parse(status.content[0].text);
    expect(statusData.name).toBe("e2e-test-session");
    expect(statusData.findings_count).toBe(1);
  });

  test("luca_trigger_deferred with auto_spawn=false returns instructions", async () => {
    // Register a background-spawnable agent
    await callTool(tools, "luca_register_purpose", {
      agent: "e2e-bg-agent",
      purpose: "researcher",
      allowed_contexts: "research",
      background_spawnable: true,
    });

    // Defer a task
    await callTool(tools, "luca_defer_task", {
      agent: "e2e-bg-agent",
      trigger: "e2e-test-trigger",
      context: "Test background context",
    });

    // Trigger without auto_spawn
    const result = await callTool(tools, "luca_trigger_deferred", {
      trigger: "e2e-test-trigger",
      auto_spawn: false,
    });
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.triggered_count).toBe(1);
    expect(data.auto_spawn).toBe(false);
    expect(data.spawned_count).toBe(0);
    expect(data.tasks[0].subagent_id).toBeNull();
  });

  test("luca_dispatch_team with background=false returns agent metadata", async () => {
    const result = await callTool(tools, "luca_dispatch_team", {
      team: "code-review",
      task: "Review the E2E test changes",
      background: false,
    });
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.team).toBe("code-review");
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents.length).toBeGreaterThan(0);
    // Standard mode returns persona, not subagent_id
    expect(data.agents[0].persona).toBeDefined();
  });

  test("luca_eligible_agents returns agents with explicit metadata", async () => {
    const result = await callTool(tools, "luca_eligible_agents", {
      context: "research",
      background_only: true,
    });
    expectPiResponse(result);
    const data = JSON.parse(result.content[0].text);
    expect(data.total_eligible).toBeGreaterThan(0);
    // Should contain researcher agents
    expect(data.by_purpose.researcher).toBeDefined();
  });

  test("purpose register → check → eligible agents", async () => {
    await callTool(tools, "luca_register_purpose", {
      agent: "e2e-test-agent",
      purpose: "researcher",
      allowed_contexts: "research,analysis",
      background_spawnable: true,
    });

    const check = await callTool(tools, "luca_check_purpose", {
      agent: "e2e-test-agent",
      context: "research",
    });
    const checkData = JSON.parse(check.content[0].text);
    expect(checkData.compatible).toBe(true);

    const eligible = await callTool(tools, "luca_eligible_agents", {
      context: "research",
      background_only: true,
    });
    const eligibleData = JSON.parse(eligible.content[0].text);
    expect(eligibleData.total_eligible).toBeGreaterThan(0);
  });
});
