/**
 * Config generators for Claude Code, Cursor, and Pi hook configurations.
 *
 * Transforms canonical hook registries into platform-specific JSON configs
 * consumed by .claude/settings.json, .cursor/hooks.json, and Pi extensions.
 *
 * Accepts Record<string, CanonicalHook> and uses platform adapters to derive
 * platform-specific event names and matchers.
 */

import type { CanonicalHook } from "../__schemas/hook.schemas";
import { NO_MATCHER_SENTINEL } from "../__schemas/hook.schemas";
import {
  adaptForClaude,
  adaptForCursor,
  adaptForPi,
} from "./platform-adapters";

import {
  sanitizeForTemplate,
  validateScriptPath,
} from "../pi-extensions/__helpers";

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
      command: `${options.commandPrefix}/${adapted.script}`,
      timeout: adapted.timeout,
    };

    if (adapted.async) hookEntry.async = true;
    if (adapted.statusMessage) hookEntry.statusMessage = adapted.statusMessage;

    group.hooks.push(hookEntry);
  }

  return options.wrapInHooksKey ? { hooks: events } : events;
}

/**
 * Generate .cursor/hooks.json from canonical hooks.
 *
 * Uses adaptForCursor() to derive platform-specific event names and matchers.
 *
 * @param registry - Canonical hook registry mapping names to definitions
 * @returns A JSON-serializable Cursor hooks configuration object
 */
export function generateCursorHooksConfigFromCanonical(
  registry: Record<string, CanonicalHook>,
): Record<string, unknown> {
  const hooks: Record<string, Array<Record<string, unknown>>> = {};

  for (const [_name, canonical] of Object.entries(registry)) {
    const adapted = adaptForCursor(canonical);
    const eventName = adapted.event;

    if (!hooks[eventName]) {
      hooks[eventName] = [];
    }

    const entry: Record<string, unknown> = {
      command: `.cursor/hooks/${adapted.script}`,
      timeout: adapted.timeout,
    };

    if (adapted.matcher) {
      entry.matcher = adapted.matcher;
    }

    hooks[eventName].push(entry);
  }

  return { version: 1, hooks };
}

/**
 * Generate Pi extension from canonical hooks.
 *
 * Uses adaptForPi() to derive platform-specific event names and matchers.
 *
 * @deprecated The monorepo now uses a hand-written Pi-native extension.
 *   This generator is kept for npm consumers who run `luca init --harness=pi`.
 *
 * @param registry - Canonical hook registry mapping names to definitions
 * @param options.hooksDir - Relative path to hook scripts (default: ".pi/hook-scripts")
 * @returns TypeScript source code string for the extension
 */
export function generatePiExtensionFromCanonical(
  registry: Record<string, CanonicalHook>,
  options: { hooksDir?: string } = {},
): string {
  const hooksDir = options.hooksDir ?? ".pi/hook-scripts";

  const handlerBlocks: string[] = [];

  for (const [hookName, canonical] of Object.entries(registry)) {
    const adapted = adaptForPi(canonical);

    // Validate script path to prevent traversal and injection
    if (!validateScriptPath(adapted.script)) {
      console.warn(
        `[luca-hooks] Skipping hook "${hookName}": invalid script path "${adapted.script}"`,
      );
      continue;
    }

    const isDecisionHook = adapted.event === "tool_call";
    const timeoutMs = adapted.timeout * 1000;
    const piMatcher = adapted.matcher as string[] | undefined;
    const matcherCheck = buildPiMatcherCheckFromCanonical(
      canonical,
      adapted.event,
      piMatcher,
    );
    const stdinBuilder = buildPiStdinJsonFromEvent(adapted.event);

    // Sanitize interpolated values to prevent template injection
    const safeHookName = sanitizeForTemplate(hookName);
    const safeStatusMessage = adapted.statusMessage
      ? sanitizeForTemplate(adapted.statusMessage)
      : safeHookName;
    const safeScript = sanitizeForTemplate(adapted.script);

    const blockReturn = isDecisionHook
      ? `\n        return { block: true, reason: "${safeHookName}: checks failed" };`
      : "";

    handlerBlocks.push(`  // ${safeHookName}: ${safeStatusMessage}
  pi.on("${adapted.event}", async (event, ctx) => {${matcherCheck}
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
 * Build the tool-name filter check for a Pi event handler (canonical version).
 * Returns an early-return statement or empty string.
 */
function buildPiMatcherCheckFromCanonical(
  canonical: CanonicalHook,
  piEvent: string,
  piMatcher: string[] | undefined,
): string {
  if (!piMatcher || piMatcher.length === 0) return "";

  if (piEvent === "tool_call" || piEvent === "tool_execution_end") {
    const toolNames = piMatcher.map((t) => `"${t}"`).join(", ");
    // For pre-commit hooks, also check for commit commands
    if (
      canonical.event === "pre_tool_use" &&
      canonical.tool_filter === "Bash"
    ) {
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
 * Build the stdin JSON expression for a Pi hook script invocation (by event).
 */
function buildPiStdinJsonFromEvent(piEvent: string): string {
  if (piEvent === "tool_call") {
    return `JSON.stringify({ tool_input: { command: event.input?.command || "" } })`;
  }
  if (piEvent === "tool_execution_end") {
    return `JSON.stringify({ tool_input: { file_path: event.input?.file_path || "" } })`;
  }
  // Session events: minimal JSON
  return `JSON.stringify({})`;
}
