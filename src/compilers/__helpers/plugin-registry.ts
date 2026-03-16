/**
 * Compiler plugin registry for extensible compilation targets.
 *
 * Replaces the hardcoded switch statements in compile.ts with a
 * pluggable registry. Built-in plugins (Claude, Plugin) are pre-registered.
 * Community targets can register via the public API.
 *
 * @module
 */
import type { CompilerPlugin } from "../__schemas/compilers.schemas";
import type { SupportedFormat } from "./compile";
import {
  compileAgentClaude,
  compileSkillClaude,
  compileRuleClaude,
  compileAgentPlugin,
  compileSkillPlugin,
  compileRulePlugin,
} from "./compile";

// ─── Built-in Plugins ───────────────────────────────────────────────────────

const claudePlugin: CompilerPlugin = {
  name: "Claude Code",
  format: "CLAUDE",
  compileAgent: compileAgentClaude,
  compileSkill: compileSkillClaude,
  compileRule: compileRuleClaude,
};

const pluginFormatPlugin: CompilerPlugin = {
  name: "Claude Code Plugin",
  format: "PLUGIN",
  compileAgent: compileAgentPlugin,
  compileSkill: compileSkillPlugin,
  compileRule: compileRulePlugin,
};

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Internal plugin registry mapping format names to compiler plugins.
 */
const registry = new Map<string, CompilerPlugin>([
  ["CLAUDE", claudePlugin],
  ["PLUGIN", pluginFormatPlugin],
]);

/**
 * Register a compiler plugin for a new or existing format.
 *
 * Community-contributed compilation targets can be added at runtime
 * via this API. Registering to an existing format replaces it.
 *
 * @param plugin - The compiler plugin to register
 *
 * @example
 * ```typescript
 * registerCompilerPlugin({
 *   name: "Windsurf",
 *   format: "WINDSURF",
 *   compileAgent: (agent) => agent.toClaudeFormat(),
 *   compileSkill: (skill) => skill.toClaudeFormat(),
 * });
 * ```
 */
export function registerCompilerPlugin(plugin: CompilerPlugin): void {
  registry.set(plugin.format, plugin);
}

/**
 * Get a registered compiler plugin by format name.
 *
 * @param format - The format to look up
 * @returns The plugin, or undefined if not registered
 */
export function getCompilerPlugin(format: string): CompilerPlugin | undefined {
  return registry.get(format);
}

/**
 * List all registered compiler plugins.
 *
 * @returns Array of all registered plugins
 */
export function listCompilerPlugins(): CompilerPlugin[] {
  return Array.from(registry.values());
}

/**
 * List all registered format names.
 *
 * @returns Array of format strings (e.g., ["CLAUDE", "PLUGIN"])
 */
export function listRegisteredFormats(): string[] {
  return Array.from(registry.keys());
}

/**
 * Compile an agent using the registry-based dispatch.
 *
 * Falls back to the format-specific function if registered.
 *
 * @param agent - The agent to compile
 * @param format - Target format
 * @returns Compiled markdown string
 * @throws Error if format is not registered
 */
export function compileAgentViaRegistry(
  agent: Parameters<CompilerPlugin["compileAgent"]>[0],
  format: SupportedFormat | string,
): string {
  const plugin = registry.get(format);
  if (!plugin) {
    throw new Error(
      `No compiler plugin registered for format: ${format}. ` +
        `Registered formats: ${listRegisteredFormats().join(", ")}`,
    );
  }
  return plugin.compileAgent(agent);
}

/**
 * Compile a skill using the registry-based dispatch.
 *
 * @param skill - The skill to compile
 * @param format - Target format
 * @returns Compiled markdown string
 * @throws Error if format is not registered
 */
export function compileSkillViaRegistry(
  skill: Parameters<CompilerPlugin["compileSkill"]>[0],
  format: SupportedFormat | string,
): string {
  const plugin = registry.get(format);
  if (!plugin) {
    throw new Error(
      `No compiler plugin registered for format: ${format}. ` +
        `Registered formats: ${listRegisteredFormats().join(", ")}`,
    );
  }
  return plugin.compileSkill(skill);
}

/**
 * Compile a rule using the registry-based dispatch.
 *
 * @param rule - The rule to compile
 * @param format - Target format
 * @returns Compiled markdown string
 * @throws Error if format is not registered or plugin has no compileRule
 */
export function compileRuleViaRegistry(
  rule: Parameters<NonNullable<CompilerPlugin["compileRule"]>>[0],
  format: SupportedFormat | string,
): string {
  const plugin = registry.get(format);
  if (!plugin) {
    throw new Error(
      `No compiler plugin registered for format: ${format}. ` +
        `Registered formats: ${listRegisteredFormats().join(", ")}`,
    );
  }
  if (!plugin.compileRule) {
    throw new Error(
      `Compiler plugin "${plugin.name}" does not support rule compilation`,
    );
  }
  return plugin.compileRule(rule);
}

/**
 * Reset the registry to only built-in plugins.
 *
 * Useful for testing to clear any custom registrations.
 */
export function resetCompilerPluginRegistry(): void {
  registry.clear();
  registry.set("CLAUDE", claudePlugin);
  registry.set("PLUGIN", pluginFormatPlugin);
}
