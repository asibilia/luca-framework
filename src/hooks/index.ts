/**
 * Hook registry for the Luca Framework build pipeline.
 *
 * Unlike agent/skill/rule registries (which map to class constructors),
 * the hook registry maps hook names to metadata objects. The build script
 * uses this metadata to:
 * 1. Copy shell scripts from src/hooks/scripts/ to .claude/hooks/
 * 2. Generate the "hooks" section of .claude/settings.json
 *
 * Each entry defines:
 * - event: The Claude Code hook event name
 * - matcher: Regex pattern for tool matching (optional)
 * - script: Filename of the shell script in src/hooks/scripts/
 * - timeout: Max execution time in seconds
 * - async: Whether the hook runs in background
 */

export interface HookDefinition {
  /** Claude Code hook event name */
  event: string;
  /** Regex matcher for tool name filtering (undefined = always fire) */
  matcher?: string;
  /** Shell script filename in src/hooks/scripts/ */
  script: string;
  /** Timeout in seconds */
  timeout: number;
  /** Run asynchronously in background */
  async: boolean;
  /** Status message shown while hook runs */
  statusMessage?: string;
}

export const hookRegistry: Record<string, HookDefinition> = {
  'post-edit-format': {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    script: 'post-edit-format.sh',
    timeout: 10,
    async: false,
    statusMessage: 'Formatting...',
  },
};

/**
 * Generate the "hooks" section for .claude/settings.json
 * from the hook registry.
 */
export function generateHooksConfig(registry: Record<string, HookDefinition>): Record<string, unknown> {
  const config: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>> = {};

  for (const [_name, def] of Object.entries(registry)) {
    if (!config[def.event]) {
      config[def.event] = [];
    }

    // Find existing matcher group or create new one
    const matcherKey = def.matcher ?? '__no_matcher__';
    let group = config[def.event].find((g) => {
      if (matcherKey === '__no_matcher__') return !g.matcher;
      return g.matcher === def.matcher;
    });

    if (!group) {
      group = def.matcher ? { matcher: def.matcher, hooks: [] } : { hooks: [] };
      config[def.event].push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: 'command',
      command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/${def.script}`,
      timeout: def.timeout,
    };

    if (def.async) hookEntry.async = true;
    if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

    group.hooks.push(hookEntry);
  }

  return config;
}
