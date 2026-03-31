/**
 * Interactive conflict resolution prompt for Luca settings merge.
 *
 * When the three-tier merge algorithm detects a conflict (existing hook
 * at the same event+matcher slot with a different non-Luca command),
 * this module displays an interactive `@clack/prompts` select for each
 * conflict, letting the user choose how to resolve it.
 *
 * In non-interactive mode (CI, piped stdin), all conflicts default to
 * `"keep-both"` to avoid data loss.
 *
 * @see packages/luca-framework/src/utils/settings-merger.ts for the merge algorithm
 * @see packages/luca-framework/src/utils/settings-merge.schemas.ts for type definitions
 * @see .planning/phases/175-settings-merge-artifact-deployment/175-CONTEXT.md Gray Area 2
 */

import * as p from "@clack/prompts";
import filter from "lodash/filter";

import type {
  MergeAction,
  ConflictResolution,
  HookSlotKey,
} from "./settings-merge.schemas";

// ─── Non-interactive detection ──────────────────────────────────────────────

/**
 * Check whether the current environment supports interactive prompts.
 *
 * Returns false when stdin is not a TTY (piped input, CI environments,
 * background processes). Interactive prompts would hang or error in
 * these contexts.
 *
 * @returns true if the terminal supports interactive prompts
 */
function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

// ─── Conflict prompt ────────────────────────────────────────────────────────

/**
 * Prompt the user to resolve hook conflicts interactively.
 *
 * For each conflict in the provided merge actions, displays a
 * `@clack/prompts` select with three options:
 * - **Keep existing**: Preserve the user's current hook, discard Luca's
 * - **Replace with Luca**: Replace the existing hook with Luca's version
 * - **Keep both**: Keep both hooks in the slot (safest option)
 *
 * In non-interactive mode (CI, piped stdin), skips all prompts and
 * defaults every conflict to `"keep-both"`, logging a warning.
 *
 * @param actions - Array of merge actions from `computeMergeActions()`. Only `type: "conflict"` entries are processed.
 * @returns Map of slot key to the user's chosen conflict resolution
 *
 * @example
 * ```typescript
 * import { computeMergeActions } from "./settings-merger";
 * import { promptConflictResolution } from "./conflict-prompt";
 *
 * const actions = computeMergeActions(existing, proposed, scripts);
 * const conflicts = actions.filter(a => a.type === "conflict");
 *
 * if (conflicts.length > 0) {
 *   const resolutions = await promptConflictResolution(actions);
 *   // resolutions: Map<HookSlotKey, ConflictResolution>
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Non-interactive mode (CI)
 * // process.stdin.isTTY === false
 * const resolutions = await promptConflictResolution(actions);
 * // All conflicts resolved as "keep-both" automatically
 * ```
 */
export async function promptConflictResolution(
  actions: MergeAction[],
): Promise<Map<string, ConflictResolution>> {
  const resolutions = new Map<string, ConflictResolution>();

  // Extract only conflict actions
  const conflicts = filter(
    actions,
    (a): a is Extract<MergeAction, { type: "conflict" }> =>
      a.type === "conflict",
  );

  if (conflicts.length === 0) {
    return resolutions;
  }

  // Non-interactive fallback: default all conflicts to "keep-both"
  if (!isInteractive()) {
    p.log.warn(
      `Non-interactive mode detected. Defaulting ${conflicts.length} conflict(s) to "keep-both" to avoid data loss.`,
    );

    for (const conflict of conflicts) {
      resolutions.set(conflict.slot_key, "keep-both");
    }

    return resolutions;
  }

  // Interactive mode: prompt for each conflict
  p.log.info(
    `Found ${conflicts.length} hook conflict(s) requiring resolution:`,
  );

  for (const conflict of conflicts) {
    const result = await p.select({
      message: `Hook conflict at ${conflict.slot_key}`,
      options: [
        {
          value: "keep-existing" as const,
          label: "Keep existing",
          hint: truncateCommand(conflict.existing_command),
        },
        {
          value: "replace-with-luca" as const,
          label: "Replace with Luca",
          hint: truncateCommand(conflict.proposed_command),
        },
        {
          value: "keep-both" as const,
          label: "Keep both",
          hint: "Safest option -- keeps both hooks in the slot",
        },
      ],
    });

    // Handle user cancellation (Ctrl+C)
    if (p.isCancel(result)) {
      p.log.warn(
        "Conflict resolution cancelled. Defaulting remaining conflicts to keep-both.",
      );

      // Default all unresolved conflicts to "keep-both"
      for (const remaining of conflicts) {
        if (!resolutions.has(remaining.slot_key)) {
          resolutions.set(remaining.slot_key, "keep-both");
        }
      }

      return resolutions;
    }

    resolutions.set(conflict.slot_key, result as ConflictResolution);
  }

  return resolutions;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Truncate a command string for display in prompt hints.
 *
 * Long command strings make prompts hard to read. This truncates
 * commands longer than 60 characters with an ellipsis.
 *
 * @param command - The full command string
 * @returns Truncated command string suitable for display
 */
function truncateCommand(command: string | undefined): string {
  if (!command) return "(no command)";
  const maxLength = 60;
  if (command.length <= maxLength) {
    return command;
  }
  return `${command.slice(0, maxLength - 3)}...`;
}
