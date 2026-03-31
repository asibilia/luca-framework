/**
 * Settings merger for Luca deploy operations.
 *
 * Implements the three-tier merge algorithm for safely updating
 * `~/.claude/settings.json` with Luca hook registrations:
 *
 * 1. **Auto-merge (silent):** New slot (event+matcher not in existing settings) -- add
 * 2. **Auto-skip (silent):** Identical hook already exists -- skip
 * 3. **Conflict:** Same slot, different non-Luca command -- prompt user for resolution
 *
 * Hook identity is determined by a composite key: `{Event}:{matcher}` (or
 * `{Event}:` when no matcher is present). Within a slot, individual hooks
 * are identified by their `command` field.
 *
 * @see .planning/phases/175-settings-merge-artifact-deployment/175-CONTEXT.md
 *   Gray Area 1 (composite key) and Gray Area 2 (conflict resolution UX)
 * @see packages/luca-framework/src/utils/settings-merge.schemas.ts for Zod schemas
 */

import cloneDeep from "lodash/cloneDeep";
import filter from "lodash/filter";

import type {
  HookSlot,
  HookEntry,
  MergeAction,
  ConflictResolution,
  HookSlotKey,
} from "./settings-merge.schemas.ts";

// ─── Slot key construction ──────────────────────────────────────────────────

/**
 * Build a composite key for a hook slot.
 *
 * The composite key uniquely identifies a hook slot by combining the
 * event name and optional matcher. Two hooks at the same event+matcher
 * are considered the "same slot."
 *
 * @param event - Claude Code event name (PascalCase, e.g., "PostToolUse")
 * @param matcher - Optional matcher regex string (e.g., "Edit|Write")
 * @returns Composite key string (e.g., `"PostToolUse:Edit|Write"` or `"SessionStart:"`)
 *
 * @example
 * ```typescript
 * buildSlotKey("PostToolUse", "Edit|Write"); // "PostToolUse:Edit|Write"
 * buildSlotKey("SessionStart");              // "SessionStart:"
 * buildSlotKey("SessionStart", undefined);   // "SessionStart:"
 * ```
 */
export function buildSlotKey(event: string, matcher?: string): HookSlotKey {
  return `${event}:${matcher ?? ""}` as HookSlotKey;
}

// ─── Existing hook parsing ──────────────────────────────────────────────────

/**
 * Parse the hooks section of an existing settings.json into a structured map.
 *
 * Transforms the flat `hooks` object from settings.json into a Map keyed
 * by event name, with each value being an array of HookSlot groups
 * (each group has an optional matcher and an array of hook entries).
 *
 * @param settings - The full settings.json object (or any object with a `hooks` property)
 * @returns Map of event name to array of HookSlot groups
 *
 * @example
 * ```typescript
 * const settings = JSON.parse(await Bun.file("~/.claude/settings.json").text());
 * const parsed = parseExistingHooks(settings);
 * // Map {
 * //   "PostToolUse" => [{ matcher: "Edit|Write", hooks: [...] }, { hooks: [...] }],
 * //   "SessionStart" => [{ hooks: [...] }],
 * // }
 * ```
 */
export function parseExistingHooks(
  settings: Record<string, unknown>,
): Map<string, HookSlot[]> {
  const result = new Map<string, HookSlot[]>();
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;

  if (!hooks || typeof hooks !== "object") {
    return result;
  }

  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;

    const slots: HookSlot[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;

      const raw = entry as Record<string, unknown>;
      const slot: HookSlot = {
        matcher: typeof raw.matcher === "string" ? raw.matcher : undefined,
        hooks: Array.isArray(raw.hooks) ? (raw.hooks as HookEntry[]) : [],
      };
      slots.push(slot);
    }
    result.set(event, slots);
  }

  return result;
}

// ─── Luca script identification ─────────────────────────────────────────────

/**
 * Extract the base script filename from a hook command string.
 *
 * Handles multiple command formats that appear in settings.json:
 * - Quoted absolute paths: `"\"~/.claude/hooks/session-start.sh\""`
 * - `$CLAUDE_PROJECT_DIR` paths: `"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"`
 * - Plain paths: `"~/.claude/hooks/session-start.sh"`
 * - Paths with arguments: `"/path/to/hook.sh --flag"`
 *
 * @param command - The full command string from a hook entry
 * @returns The base script filename (e.g., `"session-start.sh"`), or null if no `.sh` extension found
 *
 * @example
 * ```typescript
 * extractLucaScriptName('"~/.claude/hooks/session-start.sh"');
 * // "session-start.sh"
 *
 * extractLucaScriptName("$CLAUDE_PROJECT_DIR/.claude/hooks/post-edit-format.sh");
 * // "post-edit-format.sh"
 *
 * extractLucaScriptName("echo hello");
 * // null
 * ```
 */
export function extractLucaScriptName(command: string | undefined | null): string | null {
  if (!command) return null;
  // Match the last path segment ending in .sh, stripping quotes and arguments
  const match = command.match(/([a-z0-9_-]+\.sh)/i);
  return match ? match[1]! : null;
}

/**
 * Check whether a hook command references a known Luca hook script.
 *
 * Uses `extractLucaScriptName()` to extract the script filename from
 * the command, then checks if it appears in the provided set of known
 * Luca script names.
 *
 * @param command - The full command string from a hook entry
 * @param knownScripts - Set of known Luca hook script filenames (from `getKnownLucaScripts()`)
 * @returns true if the command references a known Luca script
 *
 * @example
 * ```typescript
 * const known = getKnownLucaScripts(canonicalHookRegistry);
 * isLucaHook('"~/.claude/hooks/session-start.sh"', known); // true
 * isLucaHook("my-custom-hook.sh", known);                  // false
 * ```
 */
export function isLucaHook(
  command: string | undefined | null,
  knownScripts: Set<string>,
): boolean {
  const scriptName = extractLucaScriptName(command);
  return scriptName !== null && knownScripts.has(scriptName);
}

// ─── Known Luca scripts derivation ─────────────────────────────────────────

/**
 * Derive the set of known Luca hook script filenames from a canonical hook registry.
 *
 * Iterates over all hooks in the registry, extracts the script filename
 * from each, and replaces the `.ts` extension with `.sh` (since deployed
 * hooks use shell wrapper scripts).
 *
 * This is the **single source of truth** for Luca hook identification --
 * no hardcoded script name lists. The caller must provide the canonical
 * registry since it lives in `src/hooks/` (monorepo build tier) while
 * this module lives in `packages/luca-framework/src/utils/`.
 *
 * @param registry - The canonical hook registry record (name -> hook definition thunk or resolved object)
 * @returns Set of `.sh` script filenames (e.g., `Set { "session-start.sh", "pre-commit-gate.sh", ... }`)
 *
 * @example
 * ```typescript
 * import { canonicalHookRegistry, resolveCanonicalRegistry } from "~/hooks";
 *
 * // From resolved registry (Record<string, CanonicalHook>)
 * const scripts = getKnownLucaScripts(resolveCanonicalRegistry());
 * // Set { "session-start.sh", "session-persist.sh", "post-edit-format.sh", ... }
 * scripts.size; // 14 (matches canonical registry count)
 * ```
 */
export function getKnownLucaScripts(
  registry: Record<string, { script?: string } | (() => { script?: string })>,
): Set<string> {
  const scripts = new Set<string>();

  for (const entry of Object.values(registry)) {
    const hook = typeof entry === "function" ? entry() : entry;
    if (!hook.script) continue; // Skip prompt hooks (no script file)
    // Replace .ts extension with .sh (deployed hooks use shell wrappers)
    const shName = hook.script.replace(/\.ts$/, ".sh");
    scripts.add(shName);
  }

  return scripts;
}

// ─── Merge algorithm ────────────────────────────────────────────────────────

/**
 * Compute merge actions by comparing proposed Luca hooks against existing settings.
 *
 * For each proposed hook slot (event + matcher combination):
 * - **auto-merge:** Slot does not exist in existing settings -- add silently
 * - **auto-skip:** Slot exists and contains a hook with identical command -- skip
 * - **auto-replace (silent):** Slot exists with only Luca hooks -- replace silently
 * - **conflict:** Slot exists with a different non-Luca hook -- require user resolution
 *
 * @param existingSettings - The current settings.json object
 * @param proposedHooks - The hooks object Luca wants to install (same structure as settings.hooks)
 * @param knownLucaScripts - Set of known Luca script filenames (from `getKnownLucaScripts()`)
 * @returns Array of MergeAction objects describing what needs to happen
 *
 * @example
 * ```typescript
 * const existing = JSON.parse(await Bun.file(settingsPath).text());
 * const proposed = generateClaudeHooksConfigFromCanonical(registry, { commandPrefix: "..." });
 * const scripts = getKnownLucaScripts(registry);
 *
 * const actions = computeMergeActions(existing, proposed, scripts);
 * // [
 * //   { type: "auto-merge", slot_key: "SubagentStop:" },
 * //   { type: "auto-skip", slot_key: "SessionStart:", command: "..." },
 * //   { type: "conflict", slot_key: "PostToolUse:Edit|Write", existing_command: "...", proposed_command: "..." },
 * // ]
 * ```
 */
export function computeMergeActions(
  existingSettings: Record<string, unknown>,
  proposedHooks: Record<string, unknown>,
  knownLucaScripts: Set<string>,
): MergeAction[] {
  const actions: MergeAction[] = [];
  const existingMap = parseExistingHooks(existingSettings);
  const proposedEntries = proposedHooks as Record<string, unknown[]>;

  // Build set of known Luca prompt texts from proposed hooks.
  // All proposed hooks come from the canonical registry, so any existing prompt
  // hook whose text matches a proposed prompt is a Luca-deployed hook.
  const lucaPromptTexts = new Set<string>();
  for (const proposedSlots of Object.values(proposedEntries)) {
    if (!Array.isArray(proposedSlots)) continue;
    for (const rawSlot of proposedSlots) {
      if (!rawSlot || typeof rawSlot !== "object") continue;
      const slot = rawSlot as { hooks?: Array<Record<string, unknown>> };
      for (const hook of slot.hooks ?? []) {
        if (hook.type === "prompt" && typeof hook.prompt === "string") {
          lucaPromptTexts.add(hook.prompt);
        }
      }
    }
  }

  for (const [event, proposedSlots] of Object.entries(proposedEntries)) {
    if (!Array.isArray(proposedSlots)) continue;

    for (const rawSlot of proposedSlots) {
      if (!rawSlot || typeof rawSlot !== "object") continue;

      const proposedSlot = rawSlot as {
        matcher?: string;
        hooks?: Array<Record<string, unknown>>;
      };
      const matcher = proposedSlot.matcher;
      const slotKey = buildSlotKey(event, matcher);
      const proposedHookEntries = proposedSlot.hooks ?? [];

      // Find matching existing slot
      const existingSlots = existingMap.get(event) ?? [];
      const matchingExistingSlot = existingSlots.find((s) =>
        matcher ? s.matcher === matcher : !s.matcher,
      );

      if (!matchingExistingSlot) {
        // Slot does not exist: auto-merge
        actions.push({ type: "auto-merge", slot_key: slotKey });
        continue;
      }

      // Slot exists -- check each proposed hook
      for (const proposedHook of proposedHookEntries) {
        const proposedCmd = (proposedHook.command as string) ?? "";
        const proposedType = (proposedHook.type as string) ?? "command";

        // Check if identical hook already exists
        let hasIdentical = false;
        if (proposedType === "prompt") {
          // Prompt hooks: compare by prompt text (they have no command)
          const proposedPrompt = (proposedHook.prompt as string) ?? "";
          hasIdentical = matchingExistingSlot.hooks.some((h) => {
            const raw = h as Record<string, unknown>;
            return raw.type === "prompt" && raw.prompt === proposedPrompt;
          });
        } else {
          // Command hooks: compare by command string
          hasIdentical = matchingExistingSlot.hooks.some(
            (h) => h.command === proposedCmd,
          );
        }

        if (hasIdentical) {
          actions.push({
            type: "auto-skip",
            slot_key: slotKey,
            command: proposedCmd || describeHook(proposedHook, proposedType),
          });
          continue;
        }

        // Check if existing slot has only Luca hooks (safe to auto-replace)
        const allExistingAreLuca = matchingExistingSlot.hooks.every((h) => {
          if (isLucaHook(h.command, knownLucaScripts)) return true;
          // Also recognize Luca prompt hooks by matching prompt text
          const raw = h as Record<string, unknown>;
          if (raw.type === "prompt" && typeof raw.prompt === "string") {
            return lucaPromptTexts.has(raw.prompt);
          }
          return false;
        });

        if (allExistingAreLuca) {
          // Existing slot contains only Luca hooks -- auto-replace silently
          // Treat this as auto-merge (will be replaced in applyMerge)
          actions.push({ type: "auto-merge", slot_key: slotKey });
          continue;
        }

        // Slot has non-Luca hooks with different commands: conflict
        const nonLucaHooks = filter(
          matchingExistingSlot.hooks,
          (h) => {
            if (isLucaHook(h.command, knownLucaScripts)) return false;
            const raw = h as Record<string, unknown>;
            if (raw.type === "prompt" && typeof raw.prompt === "string") {
              return !lucaPromptTexts.has(raw.prompt);
            }
            return true;
          },
        );

        if (nonLucaHooks.length > 0) {
          const existingHook = nonLucaHooks[0]! as Record<string, unknown>;
          const existingType = (existingHook.type as string) ?? "command";
          actions.push({
            type: "conflict",
            slot_key: slotKey,
            existing_command: ((existingHook.command as string) ?? "") || describeHook(existingHook, existingType),
            proposed_command: proposedCmd || describeHook(proposedHook, proposedType),
          });
        } else {
          // All existing hooks are Luca hooks (fallback case)
          actions.push({ type: "auto-merge", slot_key: slotKey });
        }
      }
    }
  }

  return actions;
}

// ─── Hook description helper ────────────────────────────────────────────────

/**
 * Build a human-readable description for a hook entry.
 *
 * Used in conflict actions when the hook has no `command` field (e.g.,
 * prompt hooks). Provides meaningful text for the conflict prompt UI
 * instead of "(no command)".
 *
 * @param hook - Raw hook entry object
 * @param hookType - Hook type string ("command", "prompt", etc.)
 * @returns Human-readable description string
 */
function describeHook(hook: Record<string, unknown>, hookType: string): string {
  if (hookType === "prompt") {
    const prompt = (hook.prompt as string) ?? "";
    const firstLine = prompt.split("\n")[0] ?? "";
    const truncated = firstLine.length > 50
      ? `${firstLine.slice(0, 47)}...`
      : firstLine;
    return `[prompt hook] ${truncated}`;
  }
  return `[${hookType} hook]`;
}

// ─── Merge application ──────────────────────────────────────────────────────

/**
 * Apply the merge by combining existing settings with proposed Luca hooks.
 *
 * Creates a deep clone of existing settings, then for each event in
 * proposed hooks:
 * - Preserves all non-Luca hooks untouched
 * - Replaces/adds Luca hooks per the computed actions and user resolutions
 * - For "keep-both" resolution, adds both hooks to the slot
 *
 * Never mutates the input objects.
 *
 * @param existingSettings - The current settings.json object (not mutated)
 * @param proposedHooks - The hooks object Luca wants to install
 * @param resolutions - Map of slot key to user's chosen conflict resolution
 * @param knownLucaScripts - Set of known Luca script filenames
 * @returns New settings object with hooks merged (deep-cloned, safe to write)
 *
 * @example
 * ```typescript
 * const resolutions = new Map<string, ConflictResolution>();
 * resolutions.set("PostToolUse:Edit|Write", "keep-both");
 *
 * const merged = applyMerge(existing, proposed, resolutions, scripts);
 * await Bun.write(settingsPath, JSON.stringify(merged, null, 2));
 * ```
 */
export function applyMerge(
  existingSettings: Record<string, unknown>,
  proposedHooks: Record<string, unknown>,
  resolutions: Map<string, ConflictResolution>,
  knownLucaScripts: Set<string>,
): Record<string, unknown> {
  const merged = cloneDeep(existingSettings);

  if (!merged.hooks || typeof merged.hooks !== "object") {
    merged.hooks = {};
  }

  const mergedHooks = merged.hooks as Record<string, unknown[]>;
  const proposedEntries = proposedHooks as Record<string, unknown[]>;

  for (const [event, proposedSlots] of Object.entries(proposedEntries)) {
    if (!Array.isArray(proposedSlots)) continue;

    const existingEventSlots: unknown[] = mergedHooks[event] ?? [];

    for (const rawSlot of proposedSlots) {
      if (!rawSlot || typeof rawSlot !== "object") continue;

      const proposedSlot = rawSlot as { matcher?: string; hooks?: unknown[] };
      const matcher = proposedSlot.matcher;
      const slotKey = buildSlotKey(event, matcher);

      // Find matching existing slot index
      const existingSlotIndex = existingEventSlots.findIndex((s) => {
        const slot = s as { matcher?: string };
        return matcher ? slot.matcher === matcher : !slot.matcher;
      });

      if (existingSlotIndex === -1) {
        // New slot: add proposed as-is
        existingEventSlots.push(cloneDeep(rawSlot));
        continue;
      }

      const existingSlot = existingEventSlots[existingSlotIndex] as {
        matcher?: string;
        hooks: Array<{ command: string; [key: string]: unknown }>;
      };

      // Check resolution for conflicts
      const resolution = resolutions.get(slotKey);

      if (resolution === "keep-existing") {
        // Keep existing slot entirely, skip proposed
        continue;
      }

      if (resolution === "keep-both") {
        // Add proposed hooks to existing slot
        const proposedHookEntries = (proposedSlot.hooks ?? []) as Array<{
          command: string;
        }>;
        for (const ph of proposedHookEntries) {
          // Only add if not already present
          const alreadyExists = existingSlot.hooks.some(
            (h) => h.command === ph.command,
          );
          if (!alreadyExists) {
            existingSlot.hooks.push(
              cloneDeep(ph) as { command: string; [key: string]: unknown },
            );
          }
        }
        continue;
      }

      // Default behavior (replace-with-luca, or no explicit resolution for auto-merge):
      // Remove Luca hooks from existing slot, then add proposed hooks
      const nonLucaHooks = filter(
        existingSlot.hooks,
        (h) => !isLucaHook(h.command, knownLucaScripts),
      );

      const proposedHookEntries = cloneDeep(proposedSlot.hooks ?? []) as Array<{
        command: string;
        [key: string]: unknown;
      }>;

      existingSlot.hooks = [...nonLucaHooks, ...proposedHookEntries];
    }

    mergedHooks[event] = existingEventSlots;
  }

  return merged;
}
