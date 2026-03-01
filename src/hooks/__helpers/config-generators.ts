/**
 * Config generators for Claude Code and Cursor hook configurations.
 *
 * Transforms the hook registry into platform-specific JSON configs
 * consumed by .claude/settings.json and .cursor/hooks.json.
 */

import type { HookDefinition } from "../__schemas/hook.schemas";
import { NO_MATCHER_SENTINEL } from "../__schemas/hook.schemas";

import {
  sanitizeForTemplate,
  validateScriptPath,
} from "../pi-extensions/__helpers/sanitize";

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
 * Generate a Pi TypeScript extension that bridges Luca hooks to Pi events.
 *
 * Pi has no shell-script hook system — all hooks are TypeScript extensions
 * that subscribe to Pi lifecycle events via `pi.on()`. This function
 * generates a single `luca-hooks.ts` extension that:
 *
 * 1. Subscribes to the mapped Pi event for each hook
 * 2. Filters by tool name when a piMatcher is set
 * 3. Executes the original shell script via child_process
 * 4. Returns `{ block: true }` for decision hooks (tool_call) on failure
 *
 * @deprecated The monorepo now uses a hand-written Pi-native extension at
 *   src/hooks/pi-extensions/luca-hooks.ts that implements hook behaviors
 *   directly in TypeScript. This generator is kept for npm consumers who
 *   run `luca init --harness=pi` and need the bridge extension.
 *
 * @param registry - The hook registry mapping hook names to definitions
 * @param options.hooksDir - Relative path to hook scripts (default: ".pi/hook-scripts")
 * @returns TypeScript source code string for the extension
 */
export function generatePiExtension(
  registry: Record<string, HookDefinition>,
  options: { hooksDir?: string } = {},
): string {
  const hooksDir = options.hooksDir ?? ".pi/hook-scripts";

  const handlerBlocks: string[] = [];

  for (const [hookName, def] of Object.entries(registry)) {
    if (!def.piEvent) continue;

    // Validate script path to prevent traversal and injection
    if (!validateScriptPath(def.script)) {
      console.warn(
        `[luca-hooks] Skipping hook "${hookName}": invalid script path "${def.script}"`,
      );
      continue;
    }

    const isDecisionHook = def.piEvent === "tool_call";
    const timeoutMs = def.timeout * 1000;
    const matcherCheck = buildPiMatcherCheck(def);
    const stdinBuilder = buildPiStdinJson(def);

    // Sanitize interpolated values to prevent template injection
    const safeHookName = sanitizeForTemplate(hookName);
    const safeStatusMessage = def.statusMessage
      ? sanitizeForTemplate(def.statusMessage)
      : safeHookName;
    const safeScript = sanitizeForTemplate(def.script);

    const blockReturn = isDecisionHook
      ? `\n        return { block: true, reason: "${safeHookName}: checks failed" };`
      : "";

    handlerBlocks.push(`  // ${safeHookName}: ${safeStatusMessage}
  pi.on("${def.piEvent}", async (event, ctx) => {${matcherCheck}
    try {
      execSync(\`sh "\${cwd}/${hooksDir}/${safeScript}"\`, {
        input: ${stdinBuilder},
        timeout: ${timeoutMs},
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {${blockReturn}
    }
  });`);
  }

  return `/**
 * Luca Hooks Extension for Pi
 *
 * Auto-generated by Luca Framework build pipeline.
 * Bridges Luca shell hooks to Pi lifecycle events.
 *
 * Source: src/hooks/ → compiled via \`bun run build:all\`
 * DO NOT EDIT — regenerate with \`bun run build:all --force\`
 */
import { execSync } from "child_process";

export default function lucaHooks(pi) {
  const cwd = process.cwd();

${handlerBlocks.join("\n\n")}
}
`;
}

/**
 * Build the tool-name filter check for a Pi event handler.
 * Returns an early-return statement or empty string.
 */
function buildPiMatcherCheck(def: HookDefinition): string {
  if (!def.piMatcher || def.piMatcher.length === 0) return "";

  if (def.piEvent === "tool_call" || def.piEvent === "tool_execution_end") {
    const toolNames = def.piMatcher.map((t) => `"${t}"`).join(", ");
    // For pre-commit hooks, also check for commit commands
    if (def.event === "PreToolUse" && def.matcher === "Bash") {
      return `
    const toolName = event.toolName || "";
    const cmd = event.input?.command || "";
    if (![${toolNames}].includes(toolName)) return;
    if (!/\\bgit\\s+commit\\b|bun\\s+run\\s+commit/.test(cmd)) return;`;
    }
    return `
    if (![${toolNames}].includes(event.toolName || "")) return;`;
  }

  return "";
}

/**
 * Build the stdin JSON expression for a Pi hook script invocation.
 * Matches the format the shell scripts expect from their platform.
 */
function buildPiStdinJson(def: HookDefinition): string {
  if (def.piEvent === "tool_call") {
    return `JSON.stringify({ tool_input: { command: event.input?.command || "" } })`;
  }
  if (def.piEvent === "tool_execution_end") {
    return `JSON.stringify({ tool_input: { file_path: event.input?.file_path || "" } })`;
  }
  // Session events: minimal JSON
  return `JSON.stringify({})`;
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
