/**
 * Config generators for Claude Code and Cursor hook configurations.
 *
 * Transforms the hook registry into platform-specific JSON configs
 * consumed by .claude/settings.json and .cursor/hooks.json.
 */

import type { HookDefinition } from "../__schemas/hook.schemas";
import { NO_MATCHER_SENTINEL } from "../__schemas/hook.schemas";

/**
 * Generate Claude Code hooks configuration from the hook registry.
 *
 * Produces a hooks configuration with command paths based on the
 * provided commandPrefix. Optionally wraps the result in a
 * `{ hooks: ... }` envelope for plugin hooks.json files.
 *
 * @param registry - The hook registry mapping hook names to definitions
 * @param options.commandPrefix - Path prefix for hook script commands
 *   e.g., '"$CLAUDE_PROJECT_DIR"/.claude/hooks' or '${CLAUDE_PLUGIN_ROOT}/scripts'
 * @param options.wrapInHooksKey - If true, returns { hooks: events }; otherwise returns events directly
 * @returns A JSON-serializable hooks configuration object
 */
export function generateClaudeHooksConfig(
  registry: Record<string, HookDefinition>,
  options: {
    commandPrefix: string;
    wrapInHooksKey?: boolean;
  },
): Record<string, unknown> {
  const events: Record<
    string,
    Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
  > = {};

  for (const [_name, def] of Object.entries(registry)) {
    if (!events[def.event]) {
      events[def.event] = [];
    }

    const matcherKey = def.matcher ?? NO_MATCHER_SENTINEL;
    const eventGroups = events[def.event]!;
    let group = eventGroups.find((g) => {
      if (matcherKey === NO_MATCHER_SENTINEL) return !g.matcher;
      return g.matcher === def.matcher;
    });

    if (!group) {
      group = def.matcher ? { matcher: def.matcher, hooks: [] } : { hooks: [] };
      eventGroups.push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: "command",
      command: `${options.commandPrefix}/${def.script}`,
      timeout: def.timeout,
    };

    if (def.async) hookEntry.async = true;
    if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

    group.hooks.push(hookEntry);
  }

  return options.wrapInHooksKey ? { hooks: events } : events;
}

/**
 * Generate .cursor/hooks.json from the hook registry.
 *
 * Cursor hooks use a different config format:
 * - Wrapped in { version: 1, hooks: { ... } }
 * - camelCase event names (afterFileEdit, beforeShellExecution, stop, sessionEnd)
 * - Flat array per event (no matcher-grouping)
 * - Relative command paths (.cursor/hooks/<script>)
 * - No async or statusMessage fields
 */
export function generateCursorHooksConfig(
  registry: Record<string, HookDefinition>,
): Record<string, unknown> {
  const hooks: Record<string, Array<Record<string, unknown>>> = {};

  for (const [_name, def] of Object.entries(registry)) {
    const eventName = def.cursorEvent;
    if (!hooks[eventName]) {
      hooks[eventName] = [];
    }

    const entry: Record<string, unknown> = {
      command: `.cursor/hooks/${def.script}`,
      timeout: def.timeout,
    };

    if (def.cursorMatcher) {
      entry.matcher = def.cursorMatcher;
    }

    hooks[eventName].push(entry);
  }

  return { version: 1, hooks };
}
