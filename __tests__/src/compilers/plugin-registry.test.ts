import { describe, test, expect, beforeEach } from "bun:test";
import {
  registerCompilerPlugin,
  getCompilerPlugin,
  listCompilerPlugins,
  listRegisteredFormats,
  compileAgentViaRegistry,
  compileSkillViaRegistry,
  compileRuleViaRegistry,
  resetCompilerPluginRegistry,
} from "../../../src/compilers/__helpers/plugin-registry";
import type { CompilerPlugin } from "../../../src/compilers/__schemas/compilers.schemas";
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../../../src/compilers/__helpers/compile";

// ─── Reset registry before each test ────────────────────────────────────────

beforeEach(() => {
  resetCompilerPluginRegistry();
});

// ─── R13.1: Built-in Plugins Registered ─────────────────────────────────────

describe("built-in plugins", () => {
  test("all 4 formats pre-registered", () => {
    const formats = listRegisteredFormats();

    expect(formats).toContain("CLAUDE");
    expect(formats).toContain("CURSOR");
    expect(formats).toContain("PLUGIN");
    expect(formats).toContain("PI");
    expect(formats).toHaveLength(4);
  });

  test("each plugin has name, format, compileAgent, compileSkill", () => {
    const plugins = listCompilerPlugins();

    for (const plugin of plugins) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.format).toBeTruthy();
      expect(typeof plugin.compileAgent).toBe("function");
      expect(typeof plugin.compileSkill).toBe("function");
    }
  });

  test("all built-in plugins have compileRule", () => {
    const plugins = listCompilerPlugins();

    for (const plugin of plugins) {
      expect(typeof plugin.compileRule).toBe("function");
    }
  });
});

// ─── R13.2: Plugin Interface ────────────────────────────────────────────────

describe("getCompilerPlugin", () => {
  test("returns plugin for registered format", () => {
    const plugin = getCompilerPlugin("CLAUDE");

    expect(plugin).toBeDefined();
    expect(plugin!.name).toBe("Claude Code");
    expect(plugin!.format).toBe("CLAUDE");
  });

  test("returns undefined for unregistered format", () => {
    const plugin = getCompilerPlugin("NONEXISTENT");

    expect(plugin).toBeUndefined();
  });
});

// ─── R13.4: Registration API ────────────────────────────────────────────────

describe("registerCompilerPlugin", () => {
  test("registers a new format", () => {
    const customPlugin: CompilerPlugin = {
      name: "Windsurf",
      format: "WINDSURF",
      compileAgent: () => "# Windsurf agent",
      compileSkill: () => "# Windsurf skill",
    };

    registerCompilerPlugin(customPlugin);

    const retrieved = getCompilerPlugin("WINDSURF");
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Windsurf");
    expect(listRegisteredFormats()).toContain("WINDSURF");
  });

  test("replaces existing format", () => {
    const customClaude: CompilerPlugin = {
      name: "Custom Claude",
      format: "CLAUDE",
      compileAgent: () => "# Custom agent",
      compileSkill: () => "# Custom skill",
    };

    registerCompilerPlugin(customClaude);

    const retrieved = getCompilerPlugin("CLAUDE");
    expect(retrieved!.name).toBe("Custom Claude");
  });

  test("custom plugin without compileRule works", () => {
    const noRulePlugin: CompilerPlugin = {
      name: "NoRule",
      format: "NORULE",
      compileAgent: () => "# Agent",
      compileSkill: () => "# Skill",
      // No compileRule
    };

    registerCompilerPlugin(noRulePlugin);

    const plugin = getCompilerPlugin("NORULE");
    expect(plugin!.compileRule).toBeUndefined();
  });
});

// ─── R13.1: Registry-Based Dispatch ─────────────────────────────────────────

describe("compileAgentViaRegistry", () => {
  test("throws for unregistered format", () => {
    expect(() => {
      compileAgentViaRegistry({} as any, "NONEXISTENT");
    }).toThrow("No compiler plugin registered for format: NONEXISTENT");
  });

  test("error message includes registered formats", () => {
    try {
      compileAgentViaRegistry({} as any, "FAKE");
    } catch (e: any) {
      expect(e.message).toContain("CLAUDE");
      expect(e.message).toContain("CURSOR");
    }
  });
});

describe("compileSkillViaRegistry", () => {
  test("throws for unregistered format", () => {
    expect(() => {
      compileSkillViaRegistry({} as any, "NONEXISTENT");
    }).toThrow("No compiler plugin registered for format: NONEXISTENT");
  });
});

describe("compileRuleViaRegistry", () => {
  test("throws for unregistered format", () => {
    expect(() => {
      compileRuleViaRegistry({} as any, "NONEXISTENT");
    }).toThrow("No compiler plugin registered for format: NONEXISTENT");
  });

  test("throws when plugin has no compileRule", () => {
    registerCompilerPlugin({
      name: "NoRule",
      format: "NORULE",
      compileAgent: () => "",
      compileSkill: () => "",
    });

    expect(() => {
      compileRuleViaRegistry({} as any, "NORULE");
    }).toThrow("does not support rule compilation");
  });
});

// ─── R13.3: Parity with Existing Switch ─────────────────────────────────────

describe("registry parity with hardcoded switch", () => {
  test("resetCompilerPluginRegistry restores built-ins", () => {
    registerCompilerPlugin({
      name: "Custom",
      format: "CUSTOM",
      compileAgent: () => "",
      compileSkill: () => "",
    });

    expect(listRegisteredFormats()).toContain("CUSTOM");

    resetCompilerPluginRegistry();

    expect(listRegisteredFormats()).not.toContain("CUSTOM");
    expect(listRegisteredFormats()).toHaveLength(4);
  });

  test("listCompilerPlugins returns array of all plugins", () => {
    const plugins = listCompilerPlugins();

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(4);

    const names = plugins.map((p) => p.name);
    expect(names).toContain("Claude Code");
    expect(names).toContain("Cursor IDE");
    expect(names).toContain("Claude Code Plugin");
    expect(names).toContain("Pi Terminal");
  });
});

// ─── Schema: CompilerPlugin type ────────────────────────────────────────────

describe("CompilerPlugin interface", () => {
  test("minimal plugin satisfies interface", () => {
    const plugin: CompilerPlugin = {
      name: "Test",
      format: "TEST",
      compileAgent: () => "agent output",
      compileSkill: () => "skill output",
    };

    expect(plugin.name).toBe("Test");
    expect(plugin.compileAgent({} as any)).toBe("agent output");
    expect(plugin.compileSkill({} as any)).toBe("skill output");
    expect(plugin.compileRule).toBeUndefined();
  });

  test("full plugin with compileRule satisfies interface", () => {
    const plugin: CompilerPlugin = {
      name: "Full",
      format: "FULL",
      compileAgent: () => "agent",
      compileSkill: () => "skill",
      compileRule: () => "rule",
    };

    expect(plugin.compileRule!({} as any)).toBe("rule");
  });
});
