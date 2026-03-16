/**
 * Config generator for Claude Code hook configurations.
 *
 * Transforms canonical hook registries into Claude Code JSON config
 * consumed by .claude/settings.json.
 *
 * Accepts Record<string, CanonicalHook> and uses the Claude Code adapter to derive
 * platform-specific event names and matchers.
 */

import type { CanonicalHook } from "../__schemas/hook.schemas";
import { NO_MATCHER_SENTINEL } from "../__schemas/hook.schemas";
import { adaptForClaude } from "./platform-adapters";

// ─── Canonical config generators (preferred API) ────────────────────────────

/**
 * Generate Claude Code hooks configuration from canonical hooks.
 *
 * Uses adaptForClaude() to derive platform-specific event names and matchers
 * from the canonical hook definitions.
 *
 * @param registry - Canonical hook registry mapping names to definitions
 * @param options.commandPrefix - Path prefix for hook script commands
 * @param options.wrapInHooksKey - If true, returns { hooks: events }
 * @returns A JSON-serializable hooks configuration object
 */
export function generateClaudeHooksConfigFromCanonical(
  registry: Record<string, CanonicalHook>,
  options: {
    commandPrefix: string;
    wrapInHooksKey?: boolean;
    /** Override the script file extension (e.g. ".sh" to reference shell wrappers instead of .ts source) */
    scriptExtension?: string;
  },
): Record<string, unknown> {
  const events: Record<
    string,
    Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
  > = {};

  for (const [_name, canonical] of Object.entries(registry)) {
    const adapted = adaptForClaude(canonical);

    if (!events[adapted.event]) {
      events[adapted.event] = [];
    }

    const matcherKey =
      (adapted.matcher as string | undefined) ?? NO_MATCHER_SENTINEL;
    const eventGroups = events[adapted.event]!;
    let group = eventGroups.find((g) => {
      if (matcherKey === NO_MATCHER_SENTINEL) return !g.matcher;
      return g.matcher === adapted.matcher;
    });

    if (!group) {
      group = adapted.matcher
        ? { matcher: adapted.matcher as string, hooks: [] }
        : { hooks: [] };
      eventGroups.push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: "command",
      command: `${options.commandPrefix}/${options.scriptExtension ? adapted.script.replace(/\.\w+$/, options.scriptExtension) : adapted.script}`,
      timeout: adapted.timeout,
    };

    if (adapted.async) hookEntry.async = true;
    if (adapted.statusMessage) hookEntry.statusMessage = adapted.statusMessage;

    group.hooks.push(hookEntry);
  }

  return options.wrapInHooksKey ? { hooks: events } : events;
}
