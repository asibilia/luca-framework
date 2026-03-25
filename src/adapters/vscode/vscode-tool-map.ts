/**
 * VS Code / GitHub Copilot tool name translation map.
 *
 * Claude Code and VS Code use different tool names. This module provides
 * an exhaustive mapping of known Claude tools to their VS Code equivalents,
 * plus a validation function that warns on unmapped tools.
 *
 * PREMORTEM constraint #3: Unmapped tools MUST produce a warning, not a
 * silent drop. The original tool name is kept as-is in the output (best-effort),
 * and the warning is collected into `EmitResult.warnings`.
 *
 * @module
 */

/**
 * Result of translating a Claude Code tool name to VS Code equivalent.
 *
 * @property translated - The VS Code tool name (or the original name if unmapped)
 * @property warning - Warning message for unmapped tools, or null if mapped successfully
 */
export type ToolTranslationResult = {
  translated: string;
  warning: string | null;
};

/**
 * Exhaustive mapping of known Claude Code tool names to VS Code equivalents.
 *
 * Used by hook compilation to translate tool names in matchers.
 * When a Claude tool name appears in a hook's `toolName` matcher,
 * it is replaced with the corresponding VS Code name.
 *
 * | Claude Code tool | VS Code tool           |
 * | ---------------- | ---------------------- |
 * | Write            | create_file            |
 * | Edit             | replace_string_in_file |
 * | Bash             | run_in_terminal        |
 * | Read             | get_file_contents      |
 */
export const VSCODE_TOOL_MAP: Readonly<Record<string, string>> = {
  Write: "create_file",
  Edit: "replace_string_in_file",
  Bash: "run_in_terminal",
  Read: "get_file_contents",
} as const;

/**
 * Translate a Claude Code tool name to its VS Code equivalent.
 *
 * Returns the translated VS Code tool name and a warning if the tool
 * is not in the known mapping. Unmapped tools are returned as-is
 * (best-effort passthrough) with a warning string.
 *
 * @param claudeTool - The Claude Code tool name to translate (e.g., "Edit", "Bash")
 * @returns Translation result with the VS Code name and optional warning
 *
 * @example
 * ```typescript
 * translateVscodeToolName("Edit");
 * // { translated: "replace_string_in_file", warning: null }
 *
 * translateVscodeToolName("UnknownTool");
 * // { translated: "UnknownTool", warning: "Unmapped Claude tool \"UnknownTool\" ..." }
 * ```
 */
export function translateVscodeToolName(
  claudeTool: string,
): ToolTranslationResult {
  const mapped = VSCODE_TOOL_MAP[claudeTool];

  if (mapped !== undefined) {
    return { translated: mapped, warning: null };
  }

  return {
    translated: claudeTool,
    warning:
      `Unmapped Claude tool "${claudeTool}" has no known VS Code equivalent. ` +
      `Using original name as-is. Hook matchers referencing this tool may not work in VS Code.`,
  };
}
