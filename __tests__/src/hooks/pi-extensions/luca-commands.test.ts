/**
 * Tests for luca-commands Pi extension (Plan 70-B, Task 8).
 *
 * Validates that the slash command extension registers 6 commands,
 * each handler reads appropriate state and calls ctx.ui.notify().
 */
import { describe, test, expect, beforeEach } from "bun:test";

/**
 * Create a mock Pi context that records command registrations and event handlers.
 */
function createMockPi() {
  const tools: any[] = [];
  const events: Array<{ event: string; handler: Function }> = [];
  const commands = new Map<string, any>();

  return {
    tools,
    events,
    commands,
    registerTool(tool: any) {
      tools.push(tool);
    },
    on(event: string, handler: Function) {
      events.push({ event, handler });
    },
    registerCommand(name: string, opts: any) {
      commands.set(name, opts);
    },
  };
}

describe("luca-commands extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 9 commands", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.commands.size).toBe(9);
  });

  test("registers 0 tools (command-only extension)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.tools.length).toBe(0);
  });

  test("registers 0 events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    expect(pi.events.length).toBe(0);
  });

  test("registers /status command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("status");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("status");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /track command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("track");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("subagent");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /verify command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("verify");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("verification");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /todos command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("todos");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("todos");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /subagents command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("subagents");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("subagent");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /safety command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("safety");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("safety");
    expect(typeof cmd.handler).toBe("function");
  });

  test("/status handler calls ctx.ui.notify", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("status");
    let notifyMessage = "";
    let notifyLevel = "";

    const mockCtx = {
      ui: {
        notify: (msg: string, level: string) => {
          notifyMessage = msg;
          notifyLevel = level;
        },
      },
    };

    await cmd.handler({}, mockCtx);

    // Should call notify with either "info" (STATE.md found) or "warn" (not found)
    expect(["info", "warn"]).toContain(notifyLevel);
    expect(notifyMessage.length).toBeGreaterThan(0);
  });

  test("/track handler calls ctx.ui.notify with subagent summary", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("track");
    let notifyMessage = "";
    let notifyLevel = "";

    const mockCtx = {
      ui: {
        notify: (msg: string, level: string) => {
          notifyMessage = msg;
          notifyLevel = level;
        },
      },
    };

    await cmd.handler({}, mockCtx);

    // No subagents tracked initially
    expect(notifyLevel).toBe("info");
    expect(notifyMessage).toContain("No subagents");
  });

  test("/subagents handler calls ctx.ui.notify when no subagents", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("subagents");
    let notifyMessage = "";

    const mockCtx = {
      ui: {
        notify: (msg: string, _level: string) => {
          notifyMessage = msg;
        },
      },
    };

    await cmd.handler({}, mockCtx);
    expect(notifyMessage).toContain("No subagents");
  });

  test("/safety handler calls ctx.ui.notify", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("safety");
    let notifyMessage = "";

    const mockCtx = {
      ui: {
        notify: (msg: string, _level: string) => {
          notifyMessage = msg;
        },
      },
    };

    await cmd.handler({}, mockCtx);
    expect(notifyMessage).toContain("Safety");
  });

  test("registers /switch-model command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("switch-model");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("model");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /set-complexity command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("set-complexity");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("complexity");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /config command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("config");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("config");
    expect(typeof cmd.handler).toBe("function");
  });

  test("/switch-model handler cancels gracefully when no selection", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("switch-model");
    let notifyMessage = "";

    const mockCtx = {
      ui: {
        select: async () => undefined,
        notify: (msg: string, _level: string) => {
          notifyMessage = msg;
        },
      },
    };

    await cmd.handler({}, mockCtx);
    expect(notifyMessage).toContain("cancelled");
  });

  test("/config handler shows config info", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    const cmd = pi.commands.get("config");
    let notifyMessage = "";

    const mockCtx = {
      ui: {
        notify: (msg: string, _level: string) => {
          notifyMessage = msg;
        },
      },
    };

    await cmd.handler({}, mockCtx);
    expect(notifyMessage).toContain("Config");
  });

  test("registers 4 keybindings when pi.registerKeybinding available", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const keybindings = new Map<string, any>();
    const pi = {
      ...createMockPi(),
      registerKeybinding(key: string, opts: any) {
        keybindings.set(key, opts);
      },
    };
    mod.default(pi);

    expect(keybindings.size).toBe(4);
    expect(keybindings.has("ctrl+shift+s")).toBe(true);
    expect(keybindings.has("ctrl+shift+v")).toBe(true);
    expect(keybindings.has("ctrl+shift+t")).toBe(true);
    expect(keybindings.has("ctrl+shift+m")).toBe(true);
  });

  test("skips keybindings when pi.registerKeybinding unavailable", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    // No registerKeybinding method
    mod.default(pi);

    // Should not throw, just skip keybindings
    expect(pi.commands.size).toBe(9);
  });

  test("commands handle missing ctx.ui gracefully", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const pi = createMockPi();
    mod.default(pi);

    // All commands should not throw when ctx has no ui
    for (const [_name, cmd] of pi.commands) {
      await cmd.handler({}, {});
      await cmd.handler({}, null);
      await cmd.handler({}, undefined);
    }
  });
});
