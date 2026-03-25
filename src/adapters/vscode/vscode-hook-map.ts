/**
 * VS Code / GitHub Copilot hook event mapping.
 *
 * Maps Claude Code hook events to VS Code equivalents. All supported events
 * are marked as Preview (unstable) as of March 2026. Unsupported events
 * (SessionEnd, Notification) return null and should be dropped from output.
 *
 * Each emitted hook JSON file must include the `_warning` field about
 * Preview instability.
 *
 * @module
 */

/**
 * A supported VS Code hook event with its stability status.
 *
 * @property event - The VS Code event name
 * @property stable - Whether the event is part of a stable API (false = Preview)
 */
export type VscodeEventMapping = {
  event: string;
  stable: boolean;
};

/**
 * Exhaustive mapping of Claude Code hook events to VS Code equivalents.
 *
 * Supported events map to `{ event, stable }` objects. Unsupported events
 * (those with no VS Code equivalent) map to `null` and should be dropped.
 *
 * All supported events are marked `stable: false` (Preview API as of March 2026).
 *
 * | Claude Code event | VS Code event    | Supported  | Status  |
 * | ----------------- | ---------------- | ---------- | ------- |
 * | PreToolUse        | PreToolUse       | yes        | Preview |
 * | PostToolUse       | PostToolUse      | yes        | Preview |
 * | Stop              | Stop             | yes        | Preview |
 * | SessionStart      | SessionStart     | yes        | Preview |
 * | UserPromptSubmit  | UserPromptSubmit | yes        | Preview |
 * | SubagentStart     | SubagentStart    | yes        | Preview |
 * | SubagentStop      | SubagentStop     | yes        | Preview |
 * | SessionEnd        | (unsupported)    | no -- drop | --      |
 * | Notification      | (unsupported)    | no -- drop | --      |
 */
export const VSCODE_EVENT_MAP: Readonly<
  Record<string, VscodeEventMapping | null>
> = {
  PreToolUse: { event: "PreToolUse", stable: false },
  PostToolUse: { event: "PostToolUse", stable: false },
  Stop: { event: "Stop", stable: false },
  SessionStart: { event: "SessionStart", stable: false },
  UserPromptSubmit: { event: "UserPromptSubmit", stable: false },
  SubagentStart: { event: "SubagentStart", stable: false },
  SubagentStop: { event: "SubagentStop", stable: false },
  SessionEnd: null,
  Notification: null,
} as const;

/**
 * Warning message to include in all emitted VS Code hook JSON files.
 *
 * This string should be set as the `_warning` field in hook output
 * to alert consumers that the hooks API is in Preview and may change.
 */
export const VSCODE_HOOK_PREVIEW_WARNING =
  "VS Code hooks are in Preview (March 2026). This configuration may break in future VS Code releases.";

/**
 * Translate a Claude Code hook event to its VS Code equivalent.
 *
 * Returns `null` for unsupported events (SessionEnd, Notification),
 * indicating the event should be dropped from VS Code output.
 *
 * Returns `{ event, stable: false }` for all supported events,
 * reflecting the Preview API status.
 *
 * @param claudeEvent - The Claude Code event name to translate
 * @returns VS Code event mapping, or null if the event is unsupported
 *
 * @example
 * ```typescript
 * translateVscodeEvent("PreToolUse");
 * // { event: "PreToolUse", stable: false }
 *
 * translateVscodeEvent("SessionEnd");
 * // null
 *
 * translateVscodeEvent("UnknownEvent");
 * // null
 * ```
 */
export function translateVscodeEvent(
  claudeEvent: string,
): VscodeEventMapping | null {
  const mapping = VSCODE_EVENT_MAP[claudeEvent];

  // Explicit null entries (unsupported events) and unknown events both return null
  if (mapping === undefined || mapping === null) {
    return null;
  }

  return mapping;
}
