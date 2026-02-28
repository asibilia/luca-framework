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
    "luca-commands.ts",
    "luca-widgets.ts",
    "luca-work-tracking.ts",
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
    { file: "luca-state.ts", tools: 3, events: 8 },
    { file: "luca-memory.ts", tools: 4, events: 2 },
    { file: "luca-harness.ts", tools: 1, events: 0 },
    { file: "luca-complexity.ts", tools: 3, events: 0 },
    { file: "luca-roles.ts", tools: 4, events: 3 },
    { file: "luca-teams.ts", tools: 3, events: 0 },
    { file: "luca-chain.ts", tools: 3, events: 0 },
    { file: "luca-tilldone.ts", tools: 3, events: 0 },
    { file: "luca-query-experts.ts", tools: 4, events: 0 },
    { file: "luca-safety-rules.ts", tools: 5, events: 1 },
    { file: "luca-purpose-gating.ts", tools: 6, events: 1 },
    { file: "luca-subagents.ts", tools: 5, events: 1 },
    { file: "luca-commands.ts", tools: 0, events: 0, commands: 6 },
    { file: "luca-widgets.ts", tools: 0, events: 6 },
    { file: "luca-work-tracking.ts", tools: 5, events: 2 },
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

  test("all extensions combined register expected tool count", async () => {
    const mock = await loadAllExtensions();
    const expectedToolCount = extensionFiles.reduce(
      (sum, ext) => sum + ext.tools,
      0,
    );
    expect(mock.tools.size).toBe(expectedToolCount);
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

// ─── Slash Commands (Plan 70-B) ─────────────────────────────

describe("Pi extension E2E: slash commands", () => {
  test("luca-commands.ts registers 6 commands", async () => {
    const mock = await loadExtension("luca-commands.ts");
    expect(mock.commands.size).toBe(6);
  });

  test("luca-commands.ts registers expected command names", async () => {
    const mock = await loadExtension("luca-commands.ts");
    const expectedCommands = [
      "status",
      "track",
      "verify",
      "todos",
      "subagents",
      "safety",
    ];
    for (const name of expectedCommands) {
      expect(mock.commands.has(name)).toBe(true);
    }
  });
});

// ─── before_agent_start (Plan 70-B) ────────────────────────

describe("Pi extension E2E: before_agent_start", () => {
  test("luca-memory registers before_agent_start event", async () => {
    const mock = await loadExtension("luca-memory.ts");
    const handlers = mock.events.get("before_agent_start") ?? [];
    expect(handlers.length).toBe(1);
  });

  test("before_agent_start handler calls addSystemContext with luca-brain", async () => {
    const mock = await loadExtension("luca-memory.ts");
    const handlers = mock.events.get("before_agent_start") ?? [];
    expect(handlers.length).toBe(1);

    let contextId = "";
    let contextContent = "";
    const mockCtx = {
      addSystemContext: (id: string, content: string) => {
        contextId = id;
        contextContent = content;
      },
    };

    await handlers[0]!({}, mockCtx);

    // BRAIN.md exists in this repo
    expect(contextId).toBe("luca-brain");
    expect(contextContent.length).toBeGreaterThan(0);
  });

  test("session_start and before_agent_start use same context ID", async () => {
    const mock = await loadExtension("luca-memory.ts");

    const sessionStartHandlers = mock.events.get("session_start") ?? [];
    const beforeAgentHandlers = mock.events.get("before_agent_start") ?? [];

    let sessionContextId = "";
    let beforeAgentContextId = "";

    const sessionCtx = {
      addSystemContext: (id: string, _content: string) => {
        sessionContextId = id;
      },
    };

    const beforeAgentCtx = {
      addSystemContext: (id: string, _content: string) => {
        beforeAgentContextId = id;
      },
    };

    await sessionStartHandlers[0]!({}, sessionCtx);
    await beforeAgentHandlers[0]!({}, beforeAgentCtx);

    // Both should use "luca-brain" to prevent duplication
    expect(sessionContextId).toBe("luca-brain");
    expect(beforeAgentContextId).toBe("luca-brain");
  });
});

// ─── Safety confirm/abort (Plan 70-B) ──────────────────────

describe("Pi extension E2E: safety confirm and abort", () => {
  test("luca_set_safety_mode confirms when downgrading from block", async () => {
    const mock = await loadExtension("luca-safety-rules.ts");

    // First set mode to block
    const setTool = mock.tools.get("luca_set_safety_mode");
    expect(setTool).toBeDefined();

    // Set to block mode (no confirmation needed for upgrade)
    await setTool.execute("test", { mode: "block" }, undefined, undefined, {});

    // Now downgrade to warn — should call confirm
    let confirmCalled = false;
    let confirmTitle = "";
    const mockCtx = {
      ui: {
        confirm: async (title: string, _body: string) => {
          confirmCalled = true;
          confirmTitle = title;
          return true; // User confirms
        },
      },
    };

    const result = await setTool.execute(
      "test",
      { mode: "warn" },
      undefined,
      undefined,
      mockCtx,
    );
    expect(confirmCalled).toBe(true);
    expect(confirmTitle).toContain("Downgrade");
    expect(result.content[0].text).toContain("block");
    expect(result.content[0].text).toContain("warn");
  });

  test("luca_set_safety_mode blocks downgrade when user declines", async () => {
    const mock = await loadExtension("luca-safety-rules.ts");

    const setTool = mock.tools.get("luca_set_safety_mode");

    // Set to block mode first
    await setTool.execute("test", { mode: "block" }, undefined, undefined, {});

    // Decline the downgrade
    const mockCtx = {
      ui: {
        confirm: async (_title: string, _body: string) => false,
      },
    };

    const result = await setTool.execute(
      "test",
      { mode: "log" },
      undefined,
      undefined,
      mockCtx,
    );
    expect(result.content[0].text).toContain("cancelled");
  });

  test("tool_call handler calls ctx.abort for critical block-mode violations", async () => {
    const mock = await loadExtension("luca-safety-rules.ts");

    // Set to block mode
    const setTool = mock.tools.get("luca_set_safety_mode");
    await setTool.execute("test", { mode: "block" }, undefined, undefined, {});

    // Get the tool_call handler
    const handlers = mock.events.get("tool_call") ?? [];
    expect(handlers.length).toBe(1);

    let abortCalled = false;
    let notifyMessage = "";
    const mockCtx = {
      abort: () => {
        abortCalled = true;
      },
      ui: {
        notify: (msg: string, _level: string) => {
          notifyMessage = msg;
        },
      },
    };

    // Trigger with destructive command
    await handlers[0]!(
      {
        toolName: "Bash",
        params: { command: "git push --force" },
      },
      mockCtx,
    );

    expect(abortCalled).toBe(true);
    expect(notifyMessage).toContain("BLOCKED");
  });

  test("tool_call handler shows confirm for critical warn-mode violations", async () => {
    const mock = await loadExtension("luca-safety-rules.ts");

    // Set to warn mode (default)
    const setTool = mock.tools.get("luca_set_safety_mode");
    await setTool!.execute("test", { mode: "warn" }, undefined, undefined, {});

    const handlers = mock.events.get("tool_call") ?? [];

    let confirmCalled = false;
    const mockCtx = {
      ui: {
        confirm: async (_title: string, _body: string) => {
          confirmCalled = true;
          return false; // User declines
        },
      },
    };

    const result = await handlers[0]!(
      {
        toolName: "Bash",
        params: { command: "rm -rf /" },
      },
      mockCtx,
    );

    expect(confirmCalled).toBe(true);
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("declined");
  });

  test("ctx.abort is NOT called for non-critical violations in block mode", async () => {
    const mock = await loadExtension("luca-safety-rules.ts");

    // The tool_call handler only checks critical rules,
    // so non-critical violations don't trigger abort.
    // Set to block mode
    const setTool = mock.tools.get("luca_set_safety_mode");
    await setTool.execute("test", { mode: "block" }, undefined, undefined, {});

    const handlers = mock.events.get("tool_call") ?? [];

    let abortCalled = false;
    const mockCtx = {
      abort: () => {
        abortCalled = true;
      },
      ui: {
        notify: () => {},
      },
    };

    // Trigger with non-critical content (credentials in code = "high" severity)
    // But tool_call handler only checks critical rules, so this won't match
    await handlers[0]!(
      {
        toolName: "Bash",
        params: { command: "echo hello world" },
      },
      mockCtx,
    );

    expect(abortCalled).toBe(false);
  });
});

// ─── renderCall / renderResult (Plan 70-C) ──────────────────

describe("Pi extension E2E: renderCall and renderResult", () => {
  test("luca_verify has renderCall and renderResult", async () => {
    const mock = await loadExtension("luca-harness.ts");
    const tool = mock.tools.get("luca_verify");
    expect(tool).toBeDefined();
    expect(typeof tool!.renderCall).toBe("function");
    expect(typeof tool!.renderResult).toBe("function");
  });

  test("luca_verify renderCall returns human-readable description", async () => {
    const mock = await loadExtension("luca-harness.ts");
    const tool = mock.tools.get("luca_verify");
    const text = tool!.renderCall({ checks: "test,typecheck" }, {});
    expect(text).toContain("verification");
    expect(text).toContain("test,typecheck");
  });

  test("luca_verify renderCall handles missing checks", async () => {
    const mock = await loadExtension("luca-harness.ts");
    const tool = mock.tools.get("luca_verify");
    const text = tool!.renderCall({}, {});
    expect(text).toContain("all enabled");
  });

  test("luca_verify renderResult formats pass/fail with check details", async () => {
    const mock = await loadExtension("luca-harness.ts");
    const tool = mock.tools.get("luca_verify");
    const result = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "failed",
            checks: [
              { name: "test", status: "passed", duration: 2100 },
              { name: "typecheck", status: "failed", duration: 1400 },
            ],
            total_duration: 3500,
          }),
        },
      ],
    };
    const text = tool!.renderResult(result, {}, {});
    expect(text).toContain("FAIL");
    expect(text).toContain("test");
    expect(text).toContain("typecheck");
    expect(text).toContain("3500ms");
  });

  test("luca_verify renderResult handles malformed result gracefully", async () => {
    const mock = await loadExtension("luca-harness.ts");
    const tool = mock.tools.get("luca_verify");
    const text = tool!.renderResult({ content: [] }, {}, {});
    expect(text).toBe("Verification complete");
  });

  test("luca_subagent_create has renderCall", async () => {
    const mock = await loadExtension("luca-subagents.ts");
    const tool = mock.tools.get("luca_subagent_create");
    expect(tool).toBeDefined();
    expect(typeof tool!.renderCall).toBe("function");
  });

  test("luca_subagent_create renderCall shows agent and task preview", async () => {
    const mock = await loadExtension("luca-subagents.ts");
    const tool = mock.tools.get("luca_subagent_create");
    const text = tool!.renderCall(
      { agent: "lu-executor", task: "Build the feature with tests" },
      {},
    );
    expect(text).toContain("lu-executor");
    expect(text).toContain("Build the feature");
  });

  test("luca_subagent_result has renderResult", async () => {
    const mock = await loadExtension("luca-subagents.ts");
    const tool = mock.tools.get("luca_subagent_result");
    expect(tool).toBeDefined();
    expect(typeof tool!.renderResult).toBe("function");
  });

  test("luca_subagent_result renderResult formats status and output", async () => {
    const mock = await loadExtension("luca-subagents.ts");
    const tool = mock.tools.get("luca_subagent_result");
    const result = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: "sub-1-lu-executor",
            agent: "lu-executor",
            status: "completed",
            output: "All tests pass",
          }),
        },
      ],
    };
    const text = tool!.renderResult(result, {}, {});
    expect(text).toContain("DONE");
    expect(text).toContain("lu-executor");
    expect(text).toContain("All tests pass");
  });

  test("luca_subagent_result renderResult handles malformed result", async () => {
    const mock = await loadExtension("luca-subagents.ts");
    const tool = mock.tools.get("luca_subagent_result");
    const text = tool!.renderResult({ content: [] }, {}, {});
    expect(text).toBe("Subagent result");
  });
});

// ─── onUpdate streaming (Plan 70-C) ─────────────────────────

describe("Pi extension E2E: onUpdate streaming", () => {
  test("luca_verify source accepts onUpdate parameter", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-harness.ts"),
      "utf-8",
    );
    expect(source).toContain("onUpdate");
    expect(source).toContain("onUpdate?.(");
    // Verify correct param order: signal before onUpdate
    expect(source).toContain("signal: AbortSignal");
  });

  test("luca_tilldone source accepts onUpdate parameter", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(process.cwd(), "src", "hooks", "pi-extensions", "luca-tilldone.ts"),
      "utf-8",
    );
    expect(source).toContain("onUpdate");
    expect(source).toContain("onUpdate?.(");
  });
});

// ─── setActiveTools (Plan 70-C) ──────────────────────────────

describe("Pi extension E2E: setActiveTools role enforcement", () => {
  test("luca_activate_role calls setActiveTools with correct tools", async () => {
    const mock = createMockPi();
    let activeToolsList: string[] = [];
    (mock.api as any).setActiveTools = (tools: string[]) => {
      activeToolsList = tools;
    };
    (mock.api as any).getActiveTools = () => ["Read", "Write", "Bash"];

    const mod = await import(join(extensionDir, "luca-roles.ts"));
    mod.default(mock.api);

    const activateTool = mock.tools.get("luca_activate_role");
    expect(activateTool).toBeDefined();
    await activateTool!.execute("test", { role: "lu-executor" });

    // Should include role management tools
    expect(activeToolsList).toContain("luca_list_roles");
    expect(activeToolsList).toContain("luca_activate_role");
    expect(activeToolsList).toContain("luca_deactivate_role");
    expect(activeToolsList).toContain("luca_active_role");
  });

  test("luca_deactivate_role restores original tools", async () => {
    const mock = createMockPi();
    const originalTools = ["Read", "Write", "Bash"];
    let restoredTools: string[] = [];
    (mock.api as any).setActiveTools = (tools: string[]) => {
      restoredTools = tools;
    };
    (mock.api as any).getActiveTools = () => [...originalTools];

    const mod = await import(join(extensionDir, "luca-roles.ts"));
    mod.default(mock.api);

    const activateTool = mock.tools.get("luca_activate_role");
    await activateTool!.execute("test", { role: "lu-executor" });

    const deactivateTool = mock.tools.get("luca_deactivate_role");
    await deactivateTool!.execute("test", {});

    // Should restore original tools
    expect(restoredTools).toEqual(originalTools);
  });

  test("session_switch re-applies active role tools", async () => {
    const mock = createMockPi();
    const setToolsCalls: string[][] = [];
    (mock.api as any).setActiveTools = (tools: string[]) => {
      setToolsCalls.push(tools);
    };
    (mock.api as any).getActiveTools = () => ["Read", "Write"];

    const mod = await import(join(extensionDir, "luca-roles.ts"));
    mod.default(mock.api);

    const activateTool = mock.tools.get("luca_activate_role");
    await activateTool!.execute("test", { role: "lu-executor" });

    const sessionSwitchHandlers = mock.events.get("session_switch") ?? [];
    expect(sessionSwitchHandlers.length).toBe(1);
    await sessionSwitchHandlers[0]!({}, {});

    // setActiveTools should have been called twice (activate + session_switch)
    expect(setToolsCalls.length).toBe(2);
    expect(setToolsCalls[1]).toContain("luca_list_roles");
  });

  test("fallback event blocking works when setActiveTools unavailable", async () => {
    const mock = createMockPi();
    // No setActiveTools on the pi object (simulating older Pi version)

    const mod = await import(join(extensionDir, "luca-roles.ts"));
    mod.default(mock.api);

    const activateTool = mock.tools.get("luca_activate_role");
    await activateTool!.execute("test", { role: "lu-executor" });

    const toolCallHandlers = mock.events.get("tool_call") ?? [];
    expect(toolCallHandlers.length).toBe(1);

    const result = await toolCallHandlers[0]!(
      { toolName: "SomeUnallowedTool" },
      {},
    );
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("does not allow");
  });
});

// ─── setFooter (Plan 70-C) ──────────────────────────────────

describe("Pi extension E2E: setFooter", () => {
  test("luca-state session_start calls setFooter when available", async () => {
    const mock = createMockPi();
    let footerRenderer: any = null;

    const mod = await import(join(extensionDir, "luca-state.ts"));
    mod.default(mock.api);

    const sessionStartHandlers = mock.events.get("session_start") ?? [];
    expect(sessionStartHandlers.length).toBe(1);

    const mockCtx = {
      ui: {
        setFooter: (renderer: any) => {
          footerRenderer = renderer;
        },
      },
    };

    await sessionStartHandlers[0]!({}, mockCtx);
    expect(footerRenderer).not.toBeNull();
    expect(typeof footerRenderer).toBe("function");

    // Call the renderer to verify multi-line output
    const output = footerRenderer({});
    expect(typeof output).toBe("string");
    expect(output).toContain("Phase");
    expect(output).toContain("\n");
  });

  test("luca-state falls back to setStatus when setFooter unavailable", async () => {
    const mock = createMockPi();

    const mod = await import(join(extensionDir, "luca-state.ts"));
    mod.default(mock.api);

    const sessionStartHandlers = mock.events.get("session_start") ?? [];
    let statusSet = false;
    let statusText = "";
    const mockCtx = {
      ui: {
        setStatus: (_id: string, text: string) => {
          statusSet = true;
          statusText = text;
        },
      },
    };

    await sessionStartHandlers[0]!({}, mockCtx);
    expect(statusSet).toBe(true);
    expect(statusText.length).toBeGreaterThan(0);
  });
});

// ─── Session events (Plan 70-C) ─────────────────────────────

describe("Pi extension E2E: session events", () => {
  test("luca-state registers session_switch, session_fork, session_tree handlers", async () => {
    const mock = createMockPi();
    const mod = await import(join(extensionDir, "luca-state.ts"));
    mod.default(mock.api);

    for (const event of ["session_switch", "session_fork", "session_tree"]) {
      const handlers = mock.events.get(event) ?? [];
      expect(handlers.length).toBe(1);
    }
  });

  test("session_switch handler updates footer", async () => {
    const mock = createMockPi();
    const mod = await import(join(extensionDir, "luca-state.ts"));
    mod.default(mock.api);

    const sessionSwitchHandlers = mock.events.get("session_switch") ?? [];
    let footerSet = false;
    const mockCtx = {
      ui: {
        setFooter: (_renderer: any) => {
          footerSet = true;
        },
      },
    };

    await sessionSwitchHandlers[0]!({}, mockCtx);
    expect(footerSet).toBe(true);
  });

  test("session_fork handler calls appendEntry when available", async () => {
    const mock = createMockPi();
    let entryType = "";
    let entryData: any = null;
    (mock.api as any).appendEntry = (type: string, data: any) => {
      entryType = type;
      entryData = data;
    };

    const mod = await import(join(extensionDir, "luca-state.ts"));
    mod.default(mock.api);

    const sessionForkHandlers = mock.events.get("session_fork") ?? [];
    const mockCtx = {
      ui: {
        setFooter: () => {},
      },
    };

    await sessionForkHandlers[0]!({}, mockCtx);
    expect(entryType).toBe("luca-session-event");
    expect(entryData).not.toBeNull();
    expect(entryData.event).toBe("session_fork");
    expect(entryData.timestamp).toBeDefined();
  });
});

// ─── appendEntry audit (Plan 70-C) ──────────────────────────

describe("Pi extension E2E: appendEntry audit logging", () => {
  test("safety violation persists via appendEntry", async () => {
    const mock = createMockPi();
    let entryType = "";
    let entryData: any = null;
    (mock.api as any).appendEntry = (type: string, data: any) => {
      entryType = type;
      entryData = data;
    };

    const mod = await import(join(extensionDir, "luca-safety-rules.ts"));
    mod.default(mock.api);

    const toolCallHandlers = mock.events.get("tool_call") ?? [];
    expect(toolCallHandlers.length).toBe(1);

    await toolCallHandlers[0]!(
      {
        toolName: "Bash",
        params: { command: "git push --force" },
      },
      {},
    );

    expect(entryType).toBe("luca-safety-audit");
    expect(entryData).not.toBeNull();
    expect(entryData.rule_id).toBe("destructive-git");
    expect(entryData.severity).toBe("critical");
  });

  test("manual safety check persists violation summary via appendEntry", async () => {
    const mock = createMockPi();
    const entries: Array<{ type: string; data: any }> = [];
    (mock.api as any).appendEntry = (type: string, data: any) => {
      entries.push({ type, data });
    };

    const mod = await import(join(extensionDir, "luca-safety-rules.ts"));
    mod.default(mock.api);

    const checkTool = mock.tools.get("luca_safety_check");
    expect(checkTool).toBeDefined();

    await checkTool!.execute("test", { content: "rm -rf /" });

    const auditEntries = entries.filter((e) => e.type === "luca-safety-audit");
    expect(auditEntries.length).toBeGreaterThan(0);
    const manualEntry = auditEntries.find(
      (e) => e.data.check_type === "manual",
    );
    expect(manualEntry).toBeDefined();
    expect(manualEntry!.data.violation_count).toBeGreaterThan(0);
  });

  test("no appendEntry call when no violations found", async () => {
    const mock = createMockPi();
    let appendCalled = false;
    (mock.api as any).appendEntry = () => {
      appendCalled = true;
    };

    const mod = await import(join(extensionDir, "luca-safety-rules.ts"));
    mod.default(mock.api);

    const checkTool = mock.tools.get("luca_safety_check");
    await checkTool!.execute("test", { content: "echo hello" });

    expect(appendCalled).toBe(false);
  });
});
