/**
 * Cursor IDE hook event name mapping.
 *
 * Maps Claude Code hook event names to their Cursor IDE equivalents.
 * Cursor uses camelCase event names and a different name for
 * UserPromptSubmit (beforeSubmitPrompt). The Notification event
 * is unsupported in Cursor and mapped to null (drop silently).
 *
 * @module
 */

/**
 * Maps Claude Code hook event names to Cursor IDE event names.
 *
 * - String values indicate a supported Cursor event (use the mapped name)
 * - `null` indicates the event is unsupported in Cursor (drop silently)
 *
 * All 9 Claude Code events are covered:
 * - 8 map to Cursor events
 * - 1 (Notification) maps to null (unsupported)
 */
export const CURSOR_EVENT_MAP: Readonly<Record<string, string | null>> = {
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  Stop: "stop",
  SessionStart: "sessionStart",
  SessionEnd: "sessionEnd",
  SubagentStop: "subagentStop",
  SubagentStart: "subagentStart",
  UserPromptSubmit: "beforeSubmitPrompt",
  Notification: null,
} as const;

/**
 * Translate a Claude Code event name to its Cursor IDE equivalent.
 *
 * Returns the Cursor event name (string) if the event is supported,
 * or `null` if the event should be silently dropped (unsupported).
 * Returns `undefined` if the Claude event name is not recognized.
 *
 * @param claudeEvent - The Claude Code event name (e.g., "PreToolUse", "Notification")
 * @returns The Cursor event name, null if unsupported, or undefined if unrecognized
 *
 * @example
 * ```typescript
 * translateCursorEvent("UserPromptSubmit"); // "beforeSubmitPrompt"
 * translateCursorEvent("Notification");     // null (unsupported, drop silently)
 * translateCursorEvent("UnknownEvent");     // undefined (unrecognized)
 * ```
 */
export function translateCursorEvent(
  claudeEvent: string,
): string | null | undefined {
  if (claudeEvent in CURSOR_EVENT_MAP) {
    return CURSOR_EVENT_MAP[claudeEvent];
  }
  return undefined;
}
