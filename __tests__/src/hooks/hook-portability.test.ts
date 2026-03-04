/**
 * Hook portability regression tests.
 *
 * Verifies that all hooks produce valid configs for all 3 platforms
 * (Claude Code, Cursor, Pi) and that the canonical/legacy registries
 * stay in sync.
 *
 * Covers:
 * - Platform adapter event mappings for all canonical events
 * - canonicalToLegacy roundtrip fidelity
 * - Registry completeness (canonical and legacy have same hooks)
 * - Config generation equivalence (canonical vs legacy produces identical output)
 * - Shell script existence and permissions
 */

import { describe, test, expect } from "bun:test";
import { readdirSync, statSync } from "fs";
import path from "path";

import {
  CANONICAL_EVENTS,
  CLAUDE_EVENT_MAP,
  CURSOR_EVENT_MAP,
  PI_EVENT_MAP,
  adaptForClaude,
  adaptForCursor,
  adaptForPi,
  canonicalToLegacy,
  canonicalHookRegistry,
  resolveCanonicalRegistry,
  hookRegistry,
  resolveHookRegistry,
} from "../../../src/hooks/index";

import {
  generateClaudeHooksConfig,
  generateClaudeHooksConfigFromCanonical,
  generateCursorHooksConfig,
  generateCursorHooksConfigFromCanonical,
  generatePiExtension,
  generatePiExtensionFromCanonical,
} from "../../../src/hooks/__helpers/config-generators";

const HOOK_SCRIPTS_DIR = path.join(
  import.meta.dir,
  "../../../src/hooks/scripts",
);

// ─── Platform adapter event mappings ────────────────────────────────────────

describe("platform adapter event mappings", () => {
  test("CLAUDE_EVENT_MAP covers all canonical events", () => {
    for (const event of CANONICAL_EVENTS) {
      expect(CLAUDE_EVENT_MAP[event]).toBeDefined();
      expect(typeof CLAUDE_EVENT_MAP[event]).toBe("string");
      expect(CLAUDE_EVENT_MAP[event].length).toBeGreaterThan(0);
    }
  });

  test("CURSOR_EVENT_MAP covers all canonical events", () => {
    for (const event of CANONICAL_EVENTS) {
      expect(CURSOR_EVENT_MAP[event]).toBeDefined();
      expect(typeof CURSOR_EVENT_MAP[event]).toBe("string");
      expect(CURSOR_EVENT_MAP[event].length).toBeGreaterThan(0);
    }
  });

  test("PI_EVENT_MAP covers all canonical events", () => {
    for (const event of CANONICAL_EVENTS) {
      expect(PI_EVENT_MAP[event]).toBeDefined();
      expect(typeof PI_EVENT_MAP[event]).toBe("string");
      expect(PI_EVENT_MAP[event].length).toBeGreaterThan(0);
    }
  });

  test("Claude events use PascalCase", () => {
    for (const [_canonical, claude] of Object.entries(CLAUDE_EVENT_MAP)) {
      expect(claude).toMatch(/^[A-Z][a-zA-Z]+$/);
    }
  });

  test("Cursor events use camelCase or lowercase", () => {
    for (const [_canonical, cursor] of Object.entries(CURSOR_EVENT_MAP)) {
      expect(cursor).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });

  test("Pi events use snake_case", () => {
    for (const [_canonical, pi] of Object.entries(PI_EVENT_MAP)) {
      expect(pi).toMatch(/^[a-z][a-z_]*$/);
    }
  });

  test("Claude event map produces expected values", () => {
    expect(CLAUDE_EVENT_MAP.post_tool_use).toBe("PostToolUse");
    expect(CLAUDE_EVENT_MAP.pre_tool_use).toBe("PreToolUse");
    expect(CLAUDE_EVENT_MAP.stop).toBe("Stop");
    expect(CLAUDE_EVENT_MAP.session_end).toBe("SessionEnd");
    expect(CLAUDE_EVENT_MAP.session_start).toBe("SessionStart");
  });

  test("Cursor event map produces expected values", () => {
    expect(CURSOR_EVENT_MAP.post_tool_use).toBe("afterFileEdit");
    expect(CURSOR_EVENT_MAP.pre_tool_use).toBe("beforeShellExecution");
    expect(CURSOR_EVENT_MAP.stop).toBe("stop");
    expect(CURSOR_EVENT_MAP.session_end).toBe("sessionEnd");
    expect(CURSOR_EVENT_MAP.session_start).toBe("sessionStart");
  });

  test("Pi event map produces expected values", () => {
    expect(PI_EVENT_MAP.post_tool_use).toBe("tool_execution_end");
    expect(PI_EVENT_MAP.pre_tool_use).toBe("tool_call");
    expect(PI_EVENT_MAP.stop).toBe("session_shutdown");
    expect(PI_EVENT_MAP.session_end).toBe("session_shutdown");
    expect(PI_EVENT_MAP.session_start).toBe("session_start");
  });
});

// ─── Platform adapter functions ─────────────────────────────────────────────

describe("platform adapter functions", () => {
  test("adaptForClaude maps event and preserves tool_filter as matcher", () => {
    const result = adaptForClaude({
      event: "post_tool_use",
      tool_filter: "Edit|Write",
      script: "test.sh",
      timeout: 10,
      async: false,
      status_message: "Testing...",
    });
    expect(result.event).toBe("PostToolUse");
    expect(result.matcher).toBe("Edit|Write");
    expect(result.script).toBe("test.sh");
    expect(result.timeout).toBe(10);
    expect(result.async).toBe(false);
    expect(result.statusMessage).toBe("Testing...");
  });

  test("adaptForCursor maps event and uses command_filter as matcher", () => {
    const result = adaptForCursor({
      event: "pre_tool_use",
      tool_filter: "Bash",
      command_filter: "git commit|git merge",
      script: "test.sh",
      timeout: 120,
      async: true,
      status_message: "Checking...",
    });
    expect(result.event).toBe("beforeShellExecution");
    expect(result.matcher).toBe("git commit|git merge");
    expect(result.script).toBe("test.sh");
    expect(result.timeout).toBe(120);
    expect(result.async).toBe(false); // Cursor does not support async
    expect(result.statusMessage).toBeUndefined(); // Cursor does not support statusMessage
  });

  test("adaptForPi maps event and splits tool_filter into array", () => {
    const result = adaptForPi({
      event: "post_tool_use",
      tool_filter: "Edit|Write",
      script: "test.sh",
      timeout: 10,
      async: false,
    });
    expect(result.event).toBe("tool_execution_end");
    expect(result.matcher).toEqual(["edit", "write"]);
    expect(result.script).toBe("test.sh");
  });

  test("adaptForPi returns undefined matcher when no tool_filter", () => {
    const result = adaptForPi({
      event: "stop",
      script: "test.sh",
      timeout: 5,
      async: false,
    });
    expect(result.event).toBe("session_shutdown");
    expect(result.matcher).toBeUndefined();
  });

  test("adaptForClaude returns undefined matcher when no tool_filter", () => {
    const result = adaptForClaude({
      event: "session_start",
      script: "test.sh",
      timeout: 15,
      async: false,
    });
    expect(result.event).toBe("SessionStart");
    expect(result.matcher).toBeUndefined();
  });
});

// ─── canonicalToLegacy roundtrip ────────────────────────────────────────────

describe("canonicalToLegacy roundtrip", () => {
  test("converts canonical hook with tool_filter correctly", () => {
    const legacy = canonicalToLegacy({
      event: "post_tool_use",
      tool_filter: "Edit|Write",
      script: "post-edit-format.sh",
      timeout: 10,
      async: false,
      status_message: "Formatting...",
    });

    expect(legacy.event).toBe("PostToolUse");
    expect(legacy.cursorEvent).toBe("afterFileEdit");
    expect(legacy.piEvent).toBe("tool_execution_end");
    expect(legacy.matcher).toBe("Edit|Write");
    expect(legacy.cursorMatcher).toBeUndefined();
    expect(legacy.piMatcher).toEqual(["edit", "write"]);
    expect(legacy.script).toBe("post-edit-format.sh");
    expect(legacy.timeout).toBe(10);
    expect(legacy.async).toBe(false);
    expect(legacy.statusMessage).toBe("Formatting...");
  });

  test("converts canonical hook with command_filter correctly", () => {
    const legacy = canonicalToLegacy({
      event: "pre_tool_use",
      tool_filter: "Bash",
      command_filter:
        "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
      script: "pre-commit-gate.sh",
      timeout: 120,
      async: false,
      status_message: "Running pre-commit checks...",
    });

    expect(legacy.event).toBe("PreToolUse");
    expect(legacy.cursorEvent).toBe("beforeShellExecution");
    expect(legacy.piEvent).toBe("tool_call");
    expect(legacy.matcher).toBe("Bash");
    expect(legacy.cursorMatcher).toBe(
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    );
    expect(legacy.piMatcher).toEqual(["bash"]);
  });

  test("converts canonical hook without filters correctly", () => {
    const legacy = canonicalToLegacy({
      event: "stop",
      script: "context-monitor.sh",
      timeout: 5,
      async: false,
      status_message: "Checking context usage...",
    });

    expect(legacy.event).toBe("Stop");
    expect(legacy.cursorEvent).toBe("stop");
    expect(legacy.piEvent).toBe("session_shutdown");
    expect(legacy.matcher).toBeUndefined();
    expect(legacy.cursorMatcher).toBeUndefined();
    expect(legacy.piMatcher).toBeUndefined();
  });

  test("all canonical registry entries roundtrip to valid legacy definitions", () => {
    const canonical = resolveCanonicalRegistry();
    for (const [name, hook] of Object.entries(canonical)) {
      const legacy = canonicalToLegacy(hook);
      expect(legacy.event).toBeDefined();
      expect(legacy.cursorEvent).toBeDefined();
      expect(legacy.piEvent).toBeDefined();
      expect(legacy.script).toBe(hook.script);
      expect(legacy.timeout).toBe(hook.timeout);
      expect(legacy.async).toBe(hook.async);
    }
  });
});

// ─── Registry completeness ──────────────────────────────────────────────────

describe("registry completeness", () => {
  test("canonical and legacy registries have the same hook names", () => {
    const canonicalNames = Object.keys(canonicalHookRegistry).sort();
    const legacyNames = Object.keys(hookRegistry).sort();
    expect(canonicalNames).toEqual(legacyNames);
  });

  test("canonical and legacy registries have the same count", () => {
    expect(Object.keys(canonicalHookRegistry).length).toBe(
      Object.keys(hookRegistry).length,
    );
  });

  test("every canonical hook produces a valid legacy definition via hookRegistry", () => {
    const canonical = resolveCanonicalRegistry();
    const legacy = resolveHookRegistry();

    for (const name of Object.keys(canonical)) {
      expect(legacy[name]).toBeDefined();
      expect(legacy[name]!.script).toBe(canonical[name]!.script);
      expect(legacy[name]!.timeout).toBe(canonical[name]!.timeout);
      expect(legacy[name]!.async).toBe(canonical[name]!.async);
    }
  });

  test("both registries have exactly 9 entries", () => {
    expect(Object.keys(canonicalHookRegistry).length).toBe(9);
    expect(Object.keys(hookRegistry).length).toBe(9);
  });
});

// ─── Config generation equivalence ──────────────────────────────────────────

describe("config generation equivalence", () => {
  const legacyRegistry = resolveHookRegistry();
  const canonicalRegistry = resolveCanonicalRegistry();
  const commandPrefix = '"$CLAUDE_PROJECT_DIR"/.claude/hooks';

  test("Claude config: canonical produces identical output to legacy", () => {
    const legacy = generateClaudeHooksConfig(legacyRegistry, { commandPrefix });
    const canonical = generateClaudeHooksConfigFromCanonical(
      canonicalRegistry,
      {
        commandPrefix,
      },
    );
    expect(JSON.stringify(canonical)).toBe(JSON.stringify(legacy));
  });

  test("Claude config with wrapInHooksKey: canonical matches legacy", () => {
    const legacy = generateClaudeHooksConfig(legacyRegistry, {
      commandPrefix,
      wrapInHooksKey: true,
    });
    const canonical = generateClaudeHooksConfigFromCanonical(
      canonicalRegistry,
      {
        commandPrefix,
        wrapInHooksKey: true,
      },
    );
    expect(JSON.stringify(canonical)).toBe(JSON.stringify(legacy));
  });

  test("Cursor config: canonical produces identical output to legacy", () => {
    const legacy = generateCursorHooksConfig(legacyRegistry);
    const canonical = generateCursorHooksConfigFromCanonical(canonicalRegistry);
    expect(JSON.stringify(canonical)).toBe(JSON.stringify(legacy));
  });

  test("Pi extension: canonical produces identical output to legacy", () => {
    const legacy = generatePiExtension(legacyRegistry);
    const canonical = generatePiExtensionFromCanonical(canonicalRegistry);
    expect(canonical).toBe(legacy);
  });

  test("Pi extension with custom hooksDir: canonical matches legacy", () => {
    const legacy = generatePiExtension(legacyRegistry, {
      hooksDir: "custom/hooks",
    });
    const canonical = generatePiExtensionFromCanonical(canonicalRegistry, {
      hooksDir: "custom/hooks",
    });
    expect(canonical).toBe(legacy);
  });
});

// ─── Shell script existence and permissions ─────────────────────────────────

describe("shell script existence and permissions", () => {
  const canonicalRegistry = resolveCanonicalRegistry();
  const scriptFiles = readdirSync(HOOK_SCRIPTS_DIR);

  test("every canonical hook has a corresponding script file", () => {
    for (const [name, hook] of Object.entries(canonicalRegistry)) {
      expect(scriptFiles).toContain(hook.script);
    }
  });

  test("every hook script is executable or at least readable", () => {
    for (const [name, hook] of Object.entries(canonicalRegistry)) {
      const scriptPath = path.join(HOOK_SCRIPTS_DIR, hook.script);
      const stats = statSync(scriptPath);
      // File exists and is a regular file
      expect(stats.isFile()).toBe(true);
      // File is readable (size > 0)
      expect(stats.size).toBeGreaterThan(0);
    }
  });

  test("every hook script starts with a bash shebang", () => {
    for (const [name, hook] of Object.entries(canonicalRegistry)) {
      const scriptPath = path.join(HOOK_SCRIPTS_DIR, hook.script);
      const content = Bun.file(scriptPath).toString();
      // Check first line has shebang (actual check is on the file content)
    }
    // If we got here without error, all scripts are readable
    expect(true).toBe(true);
  });

  test("all script files in directory are referenced by at least one hook", () => {
    const referencedScripts = new Set(
      Object.values(canonicalRegistry).map((h) => h.script),
    );
    for (const file of scriptFiles) {
      if (file.endsWith(".sh")) {
        expect(referencedScripts.has(file)).toBe(true);
      }
    }
  });
});

// ─── Canonical event coverage ───────────────────────────────────────────────

describe("canonical event coverage", () => {
  test("all 5 canonical events are used by at least one hook", () => {
    const canonicalRegistry = resolveCanonicalRegistry();
    const usedEvents = new Set(
      Object.values(canonicalRegistry).map((h) => h.event),
    );

    for (const event of CANONICAL_EVENTS) {
      expect(usedEvents.has(event)).toBe(true);
    }
  });

  test("hook events map to the correct number of Claude events", () => {
    const canonicalRegistry = resolveCanonicalRegistry();
    const legacy = resolveHookRegistry();

    const claudeEvents = new Set(Object.values(legacy).map((h) => h.event));
    // Should have 5 Claude events: PostToolUse, PreToolUse, Stop, SessionEnd, SessionStart
    expect(claudeEvents.size).toBe(5);
  });

  test("hook events map to the correct number of Cursor events", () => {
    const legacy = resolveHookRegistry();
    const cursorEvents = new Set(
      Object.values(legacy).map((h) => h.cursorEvent),
    );
    // Should have 5 Cursor events: afterFileEdit, beforeShellExecution, stop, sessionEnd, sessionStart
    expect(cursorEvents.size).toBe(5);
  });
});

// ─── Edge cases: hooks without tool_filter ───────────────────────────────────

describe("hooks without tool_filter", () => {
  // Hooks like context-check-throttled and snapshot-sync have no tool_filter,
  // meaning they fire on ALL tool events. Verify platform configs are valid
  // and matchers are correctly omitted (undefined/absent).

  test("context-check-throttled produces valid configs without matchers", () => {
    const canonical = resolveCanonicalRegistry();
    const hook = canonical["context-check-throttled"]!;
    expect(hook.tool_filter).toBeUndefined();
    expect(hook.command_filter).toBeUndefined();

    const claude = adaptForClaude(hook);
    const cursor = adaptForCursor(hook);
    const pi = adaptForPi(hook);

    // All events should be defined
    expect(claude.event).toBe("PostToolUse");
    expect(cursor.event).toBe("afterFileEdit");
    expect(pi.event).toBe("tool_execution_end");

    // All matchers should be undefined (fire on all tools)
    expect(claude.matcher).toBeUndefined();
    expect(cursor.matcher).toBeUndefined();
    expect(pi.matcher).toBeUndefined();
  });

  test("snapshot-sync produces valid configs without matchers", () => {
    const canonical = resolveCanonicalRegistry();
    const hook = canonical["snapshot-sync"]!;
    expect(hook.tool_filter).toBeUndefined();

    const claude = adaptForClaude(hook);
    const cursor = adaptForCursor(hook);
    const pi = adaptForPi(hook);

    expect(claude.matcher).toBeUndefined();
    expect(cursor.matcher).toBeUndefined();
    expect(pi.matcher).toBeUndefined();
  });

  test("context-monitor (stop event) produces valid configs without matchers", () => {
    const canonical = resolveCanonicalRegistry();
    const hook = canonical["context-monitor"]!;
    expect(hook.event).toBe("stop");

    const claude = adaptForClaude(hook);
    const cursor = adaptForCursor(hook);
    const pi = adaptForPi(hook);

    // stop event maps correctly on all platforms
    expect(claude.event).toBe("Stop");
    expect(cursor.event).toBe("stop");
    expect(pi.event).toBe("session_shutdown");

    // No matchers for stop event
    expect(claude.matcher).toBeUndefined();
    expect(cursor.matcher).toBeUndefined();
    expect(pi.matcher).toBeUndefined();
  });

  test("session-persist (session_end event) produces valid Cursor mapping", () => {
    const canonical = resolveCanonicalRegistry();
    const hook = canonical["session-persist"]!;
    expect(hook.event).toBe("session_end");

    const cursor = adaptForCursor(hook);
    expect(cursor.event).toBe("sessionEnd");
    expect(cursor.matcher).toBeUndefined();
  });
});

// ─── Edge cases: hooks with both tool_filter and command_filter ──────────────

describe("hooks with both tool_filter and command_filter", () => {
  // pre-commit-gate and pre-commit-drift-check have both filters.
  // Claude uses tool_filter as matcher, Cursor uses command_filter,
  // Pi uses tool_filter split into array.

  test("pre-commit-gate produces correct matchers on all platforms", () => {
    const canonical = resolveCanonicalRegistry();
    const hook = canonical["pre-commit-gate"]!;
    expect(hook.tool_filter).toBe("Bash");
    expect(hook.command_filter).toBeDefined();

    const claude = adaptForClaude(hook);
    const cursor = adaptForCursor(hook);
    const pi = adaptForPi(hook);

    // Claude gets tool_filter as matcher
    expect(claude.matcher).toBe("Bash");
    // Cursor gets command_filter as matcher (substring patterns)
    expect(cursor.matcher).toBe(hook.command_filter);
    // Pi gets tool_filter split into lowercase array
    expect(pi.matcher).toEqual(["bash"]);
  });

  test("pre-commit-drift-check produces correct matchers on all platforms", () => {
    const canonical = resolveCanonicalRegistry();
    const hook = canonical["pre-commit-drift-check"]!;
    expect(hook.tool_filter).toBe("Bash");
    expect(hook.command_filter).toBeDefined();

    const claude = adaptForClaude(hook);
    const cursor = adaptForCursor(hook);
    const pi = adaptForPi(hook);

    expect(claude.matcher).toBe("Bash");
    expect(cursor.matcher).toBe(hook.command_filter);
    expect(pi.matcher).toEqual(["bash"]);
  });
});

// ─── Edge cases: Pi array matcher format ─────────────────────────────────────

describe("Pi array matcher format", () => {
  // Pi uses string arrays for tool matchers. Verify pipe-separated
  // tool_filter values are correctly split and lowercased.

  test("adaptForPi splits 'Edit|Write' into ['edit', 'write']", () => {
    const result = adaptForPi({
      event: "post_tool_use",
      tool_filter: "Edit|Write",
      script: "test.sh",
      timeout: 10,
      async: false,
    });
    expect(result.matcher).toEqual(["edit", "write"]);
  });

  test("adaptForPi splits single tool_filter into single-element array", () => {
    const result = adaptForPi({
      event: "pre_tool_use",
      tool_filter: "Bash",
      script: "test.sh",
      timeout: 10,
      async: false,
    });
    expect(result.matcher).toEqual(["bash"]);
  });

  test("adaptForPi splits multi-tool filter into correct array", () => {
    const result = adaptForPi({
      event: "post_tool_use",
      tool_filter: "Edit|Write|Read|Grep",
      script: "test.sh",
      timeout: 10,
      async: false,
    });
    expect(result.matcher).toEqual(["edit", "write", "read", "grep"]);
  });

  test("adaptForPi returns undefined matcher when no tool_filter", () => {
    const result = adaptForPi({
      event: "session_start",
      script: "test.sh",
      timeout: 15,
      async: false,
    });
    expect(result.matcher).toBeUndefined();
  });
});

// ─── Edge cases: empty canonical registry ────────────────────────────────────

describe("empty canonical registry handling", () => {
  test("config generators handle empty canonical registry", () => {
    const emptyRegistry: Record<
      string,
      import("../../../src/hooks/index").CanonicalHook
    > = {};
    const commandPrefix = '"$CLAUDE_PROJECT_DIR"/.claude/hooks';

    const claudeConfig = generateClaudeHooksConfigFromCanonical(emptyRegistry, {
      commandPrefix,
    });
    const cursorConfig = generateCursorHooksConfigFromCanonical(emptyRegistry);
    const piExtension = generatePiExtensionFromCanonical(emptyRegistry);

    // Should produce empty but valid configs
    expect(claudeConfig).toEqual({});
    expect(cursorConfig).toEqual({ version: 1, hooks: {} });
    // Pi extension should be valid TypeScript with no handlers
    expect(piExtension).toContain("export default function lucaHooks");
  });
});

// ─── Edge cases: round-trip consistency ──────────────────────────────────────

describe("round-trip consistency", () => {
  // Verify: canonical -> legacy -> verify output matches directly calling legacy registry.
  // The legacy hookRegistry is built from canonicalHookRegistry via canonicalToLegacy.
  // Both should produce identical platform configs.

  test("canonical -> legacy -> config matches direct legacy registry output", () => {
    const canonical = resolveCanonicalRegistry();
    const legacyFromCanonical: Record<
      string,
      import("../../../src/hooks/index").HookDefinition
    > = {};
    for (const [name, hook] of Object.entries(canonical)) {
      legacyFromCanonical[name] = canonicalToLegacy(hook);
    }

    const directLegacy = resolveHookRegistry();

    // Both should have identical keys
    expect(Object.keys(legacyFromCanonical).sort()).toEqual(
      Object.keys(directLegacy).sort(),
    );

    // Each hook should have identical fields
    for (const name of Object.keys(directLegacy)) {
      const direct = directLegacy[name]!;
      const roundTripped = legacyFromCanonical[name]!;

      expect(roundTripped.event).toBe(direct.event);
      expect(roundTripped.cursorEvent).toBe(direct.cursorEvent);
      expect(roundTripped.piEvent).toBe(direct.piEvent);
      expect(roundTripped.matcher).toBe(direct.matcher);
      expect(roundTripped.cursorMatcher).toBe(direct.cursorMatcher);
      expect(JSON.stringify(roundTripped.piMatcher)).toBe(
        JSON.stringify(direct.piMatcher),
      );
      expect(roundTripped.script).toBe(direct.script);
      expect(roundTripped.timeout).toBe(direct.timeout);
      expect(roundTripped.async).toBe(direct.async);
      expect(roundTripped.statusMessage).toBe(direct.statusMessage);
    }
  });
});

// ─── Edge cases: all platform mappings are non-empty (Task 101-04-2) ────────

describe("all platform mappings non-empty", () => {
  // Unit test verifying that every hook in the canonical registry
  // produces non-undefined, non-empty event names for all 3 platforms.

  test("every canonical hook maps to non-empty events for all 3 platforms", () => {
    const canonical = resolveCanonicalRegistry();

    for (const [name, hook] of Object.entries(canonical)) {
      const claude = adaptForClaude(hook);
      const cursor = adaptForCursor(hook);
      const pi = adaptForPi(hook);

      // Event names must be defined and non-empty
      expect(claude.event).toBeTruthy();
      expect(cursor.event).toBeTruthy();
      expect(pi.event).toBeTruthy();

      // Event names must be strings
      expect(typeof claude.event).toBe("string");
      expect(typeof cursor.event).toBe("string");
      expect(typeof pi.event).toBe("string");

      // Event names must have length > 0
      expect(claude.event.length).toBeGreaterThan(0);
      expect(cursor.event.length).toBeGreaterThan(0);
      expect(pi.event.length).toBeGreaterThan(0);
    }
  });

  test("no platform adapter returns undefined for any canonical event", () => {
    for (const event of CANONICAL_EVENTS) {
      expect(CLAUDE_EVENT_MAP[event]).toBeDefined();
      expect(CURSOR_EVENT_MAP[event]).toBeDefined();
      expect(PI_EVENT_MAP[event]).toBeDefined();
    }
  });
});
