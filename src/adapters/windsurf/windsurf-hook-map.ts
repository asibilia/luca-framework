/**
 * Windsurf hook event mapping -- translates Claude Code hook events to Windsurf equivalents.
 *
 * Windsurf supports 12 hook events. This module maps the 9 Claude Code events
 * to their Windsurf counterparts. Three Claude events (SubagentStart, SubagentStop,
 * Notification) have no Windsurf equivalent and are mapped to null.
 *
 * Event mapping table:
 *
 * | Claude Code event  | Windsurf event   | Supported |
 * | ------------------ | ---------------- | --------- |
 * | PreToolUse         | pre_tool_use     | yes       |
 * | PostToolUse        | post_tool_use    | yes       |
 * | Stop               | agent_response   | yes       |
 * | SessionStart       | session_start    | yes       |
 * | SessionEnd         | session_end      | yes       |
 * | UserPromptSubmit   | user_prompt      | yes       |
 * | SubagentStart      | (unsupported)    | no        |
 * | SubagentStop       | (unsupported)    | no        |
 * | Notification       | (unsupported)    | no        |
 *
 * @module
 */

/**
 * Mapping of Claude Code hook event names to Windsurf hook event names.
 *
 * Supported events map to their Windsurf string equivalent.
 * Unsupported events (no Windsurf equivalent) map to null.
 *
 * Consumers should check for null to determine if an event should be
 * dropped from the Windsurf hook configuration. Dropped events should
 * be noted in the compatibility report.
 */
export const WINDSURF_EVENT_MAP: Record<string, string | null> = {
  PreToolUse: "pre_tool_use",
  PostToolUse: "post_tool_use",
  Stop: "agent_response",
  SessionStart: "session_start",
  SessionEnd: "session_end",
  UserPromptSubmit: "user_prompt",
  SubagentStart: null,
  SubagentStop: null,
  Notification: null,
};

/**
 * Translate a Claude Code hook event name to the Windsurf equivalent.
 *
 * Returns the Windsurf event name string for supported events, or null
 * for events that have no Windsurf equivalent (SubagentStart, SubagentStop,
 * Notification). Returns undefined for unknown/unrecognized event names.
 *
 * @param claudeEvent - The Claude Code hook event name (e.g., "PreToolUse", "Stop")
 * @returns The Windsurf event name, null if unsupported, or undefined if unknown
 *
 * @example
 * ```typescript
 * translateWindsurfEvent("Stop");           // "agent_response"
 * translateWindsurfEvent("PreToolUse");     // "pre_tool_use"
 * translateWindsurfEvent("SubagentStart");  // null (unsupported)
 * translateWindsurfEvent("Unknown");        // undefined (not in map)
 * ```
 */
export function translateWindsurfEvent(
  claudeEvent: string,
): string | null | undefined {
  if (Object.hasOwn(WINDSURF_EVENT_MAP, claudeEvent)) {
    return WINDSURF_EVENT_MAP[claudeEvent as keyof typeof WINDSURF_EVENT_MAP];
  }
  return undefined;
}
