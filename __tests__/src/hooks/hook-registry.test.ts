import { describe, test, expect } from "bun:test";
import { readdirSync } from "fs";
import path from "path";
import {
  hookRegistry,
  generateCursorHooksConfig,
} from "../../../src/hooks/index";
import { generateClaudeHooksConfig } from "../../../scripts/build-shared";

const HOOK_SCRIPTS_DIR = path.join(
  import.meta.dir,
  "../../../src/hooks/scripts",
);

describe("hookRegistry", () => {
  test("every hook entry has a corresponding script file", () => {
    const scriptFiles = readdirSync(HOOK_SCRIPTS_DIR);
    for (const [name, def] of Object.entries(hookRegistry)) {
      expect(scriptFiles).toContain(def.script);
    }
  });

  test("generateHooksConfig produces valid structure", () => {
    const config = generateClaudeHooksConfig(hookRegistry, {
      commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
    });
    // Should have at least one event
    expect(Object.keys(config).length).toBeGreaterThan(0);

    // Each event should be an array of matcher groups
    for (const [event, groups] of Object.entries(config)) {
      expect(Array.isArray(groups)).toBe(true);
      for (const group of groups as Array<Record<string, unknown>>) {
        expect(group).toHaveProperty("hooks");
        expect(Array.isArray(group.hooks)).toBe(true);
      }
    }
  });

  test("all hook commands reference .claude/hooks/ path", () => {
    const config = generateClaudeHooksConfig(hookRegistry, {
      commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
    });
    for (const groups of Object.values(config)) {
      for (const group of groups as Array<{
        hooks: Array<{ command: string }>;
      }>) {
        for (const hook of group.hooks) {
          expect(hook.command).toContain(".claude/hooks/");
        }
      }
    }
  });

  test("has exactly 7 entries", () => {
    expect(Object.keys(hookRegistry).length).toBe(7);
  });

  test("post-edit-typecheck is async", () => {
    expect(hookRegistry["post-edit-typecheck"].async).toBe(true);
  });

  test("pre-commit-gate is synchronous", () => {
    expect(hookRegistry["pre-commit-gate"].async).toBe(false);
  });

  test("post-edit hooks share the same event and matcher", () => {
    const format = hookRegistry["post-edit-format"];
    const typecheck = hookRegistry["post-edit-typecheck"];
    expect(format.event).toBe(typecheck.event);
    expect(format.matcher).toBe(typecheck.matcher);
  });

  test("pre-commit-gate matches Bash tool", () => {
    expect(hookRegistry["pre-commit-gate"].event).toBe("PreToolUse");
    expect(hookRegistry["pre-commit-gate"].matcher).toBe("Bash");
  });

  test("generateHooksConfig groups same-event-same-matcher hooks", () => {
    const config = generateClaudeHooksConfig(hookRegistry, {
      commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
    });
    // PostToolUse should have 1 group with 2 hooks (format + typecheck)
    const postToolUse = config.PostToolUse as Array<{ hooks: unknown[] }>;
    expect(postToolUse.length).toBe(1);
    expect(postToolUse[0].hooks.length).toBe(2);
  });

  test("context-monitor fires on Stop event", () => {
    expect(hookRegistry["context-monitor"].event).toBe("Stop");
    expect(hookRegistry["context-monitor"].matcher).toBeUndefined();
  });

  test("session-persist fires on SessionEnd event", () => {
    expect(hookRegistry["session-persist"].event).toBe("SessionEnd");
    expect(hookRegistry["session-persist"].matcher).toBeUndefined();
  });

  test("generateHooksConfig produces 5 event types", () => {
    const config = generateClaudeHooksConfig(hookRegistry, {
      commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
    });
    const events = Object.keys(config).sort();
    expect(events).toEqual([
      "PostToolUse",
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
    ]);
  });

  test("every hook has a cursorEvent field", () => {
    for (const [name, def] of Object.entries(hookRegistry)) {
      expect(def.cursorEvent).toBeDefined();
      expect(typeof def.cursorEvent).toBe("string");
      expect(def.cursorEvent.length).toBeGreaterThan(0);
    }
  });
});

describe("generateCursorHooksConfig", () => {
  test("produces valid Cursor hooks.json format with version 1", () => {
    const config = generateCursorHooksConfig(hookRegistry) as {
      version: number;
      hooks: Record<string, unknown>;
    };
    expect(config.version).toBe(1);
    expect(config.hooks).toBeDefined();
    expect(typeof config.hooks).toBe("object");
  });

  test("uses camelCase Cursor event names", () => {
    const config = generateCursorHooksConfig(hookRegistry) as {
      hooks: Record<string, unknown>;
    };
    expect(config.hooks).toHaveProperty("afterFileEdit");
    expect(config.hooks).toHaveProperty("beforeShellExecution");
    expect(config.hooks).toHaveProperty("stop");
    expect(config.hooks).toHaveProperty("sessionEnd");
    // Should NOT have Claude Code event names
    expect(config.hooks).not.toHaveProperty("PostToolUse");
    expect(config.hooks).not.toHaveProperty("PreToolUse");
  });

  test("command paths use relative .cursor/hooks/ prefix", () => {
    const config = generateCursorHooksConfig(hookRegistry) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    for (const [_event, entries] of Object.entries(config.hooks)) {
      for (const entry of entries) {
        expect(entry.command).toMatch(/^\.cursor\/hooks\//);
        expect(entry.command).not.toContain("$CLAUDE_PROJECT_DIR");
      }
    }
  });

  test("does not include async or statusMessage fields", () => {
    const config = generateCursorHooksConfig(hookRegistry) as {
      hooks: Record<string, Array<Record<string, unknown>>>;
    };
    for (const [_event, entries] of Object.entries(config.hooks)) {
      for (const entry of entries) {
        expect(entry).not.toHaveProperty("async");
        expect(entry).not.toHaveProperty("statusMessage");
      }
    }
  });

  test("beforeShellExecution has matcher for commit commands", () => {
    const config = generateCursorHooksConfig(hookRegistry) as {
      hooks: Record<string, Array<Record<string, unknown>>>;
    };
    const shellHooks = config.hooks.beforeShellExecution;
    expect(shellHooks).toBeDefined();
    expect(
      shellHooks.some(
        (h) =>
          typeof h.matcher === "string" && h.matcher.includes("git commit"),
      ),
    ).toBe(true);
  });

  test("produces 5 Cursor event types", () => {
    const config = generateCursorHooksConfig(hookRegistry) as {
      hooks: Record<string, unknown>;
    };
    const events = Object.keys(config.hooks).sort();
    expect(events).toEqual([
      "afterFileEdit",
      "beforeShellExecution",
      "sessionEnd",
      "sessionStart",
      "stop",
    ]);
  });
});
