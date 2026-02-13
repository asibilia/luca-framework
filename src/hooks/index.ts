/**
 * Hook registry for the Luca Framework build pipeline.
 *
 * Unlike agent/skill/rule registries (which map to class constructors),
 * the hook registry maps hook names to metadata objects. The build scripts
 * use this metadata to:
 * 1. Copy shell scripts from src/hooks/scripts/ to .claude/hooks/ and .cursor/hooks/
 * 2. Generate the "hooks" section of .claude/settings.json
 * 3. Generate .cursor/hooks.json
 *
 * Each entry defines:
 * - event / cursorEvent: Platform-specific hook event names
 * - matcher / cursorMatcher: Platform-specific regex matchers
 * - script: Filename of the shell script in src/hooks/scripts/
 * - timeout: Max execution time in seconds
 * - async: Whether the hook runs in background (Claude Code only)
 */

export interface HookDefinition {
  /** Claude Code hook event name (PascalCase) */
  event: string;
  /** Cursor hook event name (camelCase) */
  cursorEvent: string;
  /** Regex matcher for Claude Code tool name filtering (undefined = always fire) */
  matcher?: string;
  /** Regex matcher for Cursor filtering (undefined = always fire) */
  cursorMatcher?: string;
  /** Shell script filename in src/hooks/scripts/ */
  script: string;
  /** Timeout in seconds */
  timeout: number;
  /** Run asynchronously in background (Claude Code only, ignored by Cursor) */
  async: boolean;
  /** Status message shown while hook runs (Claude Code only) */
  statusMessage?: string;
}

/** Sentinel value for hooks with no matcher constraint. */
export const NO_MATCHER_SENTINEL = "__no_matcher__" as const;

export const hookRegistry: Record<string, HookDefinition> = {
  "post-edit-format": {
    event: "PostToolUse",
    cursorEvent: "afterFileEdit",
    matcher: "Edit|Write",
    cursorMatcher: undefined,
    script: "post-edit-format.sh",
    timeout: 10,
    async: false,
    statusMessage: "Formatting...",
  },
  "post-edit-typecheck": {
    event: "PostToolUse",
    cursorEvent: "afterFileEdit",
    matcher: "Edit|Write",
    cursorMatcher: undefined,
    script: "post-edit-typecheck.sh",
    timeout: 30,
    async: true,
    statusMessage: "Type-checking...",
  },
  "pre-commit-gate": {
    event: "PreToolUse",
    cursorEvent: "beforeShellExecution",
    matcher: "Bash",
    cursorMatcher:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-gate.sh",
    timeout: 120,
    async: false,
    statusMessage: "Running pre-commit checks...",
  },
  "pre-commit-drift-check": {
    event: "PreToolUse",
    cursorEvent: "beforeShellExecution",
    matcher: "Bash",
    cursorMatcher:
      "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
    script: "pre-commit-drift-check.sh",
    timeout: 60,
    async: false,
    statusMessage: "Checking output drift...",
  },
  "context-monitor": {
    event: "Stop",
    cursorEvent: "stop",
    matcher: undefined,
    cursorMatcher: undefined,
    script: "context-monitor.sh",
    timeout: 5,
    async: false,
    statusMessage: "Checking context usage...",
  },
  "session-persist": {
    event: "SessionEnd",
    cursorEvent: "sessionEnd",
    matcher: undefined,
    cursorMatcher: undefined,
    script: "session-persist.sh",
    timeout: 10,
    async: false,
    statusMessage: "Saving session state...",
  },
  "session-start": {
    event: "SessionStart",
    cursorEvent: "sessionStart",
    matcher: undefined,
    cursorMatcher: undefined,
    script: "session-start.sh",
    timeout: 15,
    async: false,
    statusMessage: "Initializing Luca...",
  },
};

/**
 * Generate the "hooks" section for .claude/settings.json
 * from the hook registry.
 */
export function generateHooksConfig(
  registry: Record<string, HookDefinition>,
): Record<string, unknown> {
  const config: Record<
    string,
    Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
  > = {};

  for (const [_name, def] of Object.entries(registry)) {
    if (!config[def.event]) {
      config[def.event] = [];
    }

    // Find existing matcher group or create new one
    const matcherKey = def.matcher ?? NO_MATCHER_SENTINEL;
    let group = config[def.event].find((g) => {
      if (matcherKey === NO_MATCHER_SENTINEL) return !g.matcher;
      return g.matcher === def.matcher;
    });

    if (!group) {
      group = def.matcher ? { matcher: def.matcher, hooks: [] } : { hooks: [] };
      config[def.event].push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: "command",
      command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/${def.script}`,
      timeout: def.timeout,
    };

    if (def.async) hookEntry.async = true;
    if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

    group.hooks.push(hookEntry);
  }

  return config;
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
