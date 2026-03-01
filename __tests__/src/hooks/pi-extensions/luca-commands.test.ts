/**
 * Tests for luca-commands Pi extension (Plan 70-B, Task 8).
 *
 * Validates that the slash command extension registers 6 commands,
 * each handler reads appropriate state and calls ctx.ui.notify().
 */
import { describe, test, expect, beforeEach } from "bun:test";

import { createMockPi } from "../__helpers/mock-pi";

describe("luca-commands extension", () => {
  test("exports default function", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    expect(typeof mod.default).toBe("function");
  });

  test("registers 9 commands", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    expect(mock.commands.size).toBe(9);
  });

  test("registers 0 tools (command-only extension)", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    expect(mock.tools.size).toBe(0);
  });

  test("registers 0 events", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    expect(mock.events.size).toBe(0);
  });

  test("registers /status command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("status");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("status");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /track command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("track");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("subagent");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /verify command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("verify");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("verification");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /todos command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("todos");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("todos");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /subagents command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("subagents");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("subagent");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /safety command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("safety");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("safety");
    expect(typeof cmd.handler).toBe("function");
  });

  test("/status handler calls ctx.ui.notify", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("status");
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
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("track");
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
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("subagents");
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
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("safety");
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
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("switch-model");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("model");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /set-complexity command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("set-complexity");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("complexity");
    expect(typeof cmd.handler).toBe("function");
  });

  test("registers /config command", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("config");
    expect(cmd).toBeDefined();
    expect(cmd.description).toContain("config");
    expect(typeof cmd.handler).toBe("function");
  });

  test("/switch-model handler cancels gracefully when no selection", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("switch-model");
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
    const mock = createMockPi();
    mod.default(mock.api);

    const cmd = mock.commands.get("config");
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
    const mock = createMockPi();
    mod.default(mock.api);

    expect(mock.keybindings.length).toBe(4);
    const keys = mock.keybindings.map((kb) => kb.key);
    expect(keys).toContain("ctrl+shift+s");
    expect(keys).toContain("ctrl+shift+v");
    expect(keys).toContain("ctrl+shift+t");
    expect(keys).toContain("ctrl+shift+m");
  });

  test("commands handle missing ctx.ui gracefully", async () => {
    const mod = await import("~/hooks/pi-extensions/luca-commands");
    const mock = createMockPi();
    mod.default(mock.api);

    // All commands should not throw when ctx has no ui
    for (const [_name, cmd] of mock.commands) {
      await cmd.handler({}, {});
      await cmd.handler({}, null);
      await cmd.handler({}, undefined);
    }
  });
});
