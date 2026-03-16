/**
 * Settings merge Zod schemas and inferred types.
 *
 * Defines the schemas for the three-tier settings.json merge algorithm:
 * 1. Auto-merge: New slot (event+matcher not in existing settings) -> add silently
 * 2. Auto-skip: Identical hook already exists (same event+matcher+command) -> skip
 * 3. Conflict: Same slot, different command -> prompt user for resolution
 *
 * Hook identity is determined by a composite key: `{Event}:{matcher}` (or
 * `{Event}:` when no matcher is present). Within a slot, individual hooks
 * are identified by their `command` field.
 *
 * Uses snake_case for all property names per API conventions.
 *
 * @see .planning/phases/175-settings-merge-artifact-deployment/175-CONTEXT.md
 *   Gray Area 1 (composite key strategy) and Gray Area 2 (conflict resolution UX)
 */

import { z } from "zod";

// ─── Hook slot key ───────────────────────────────────────────────────────────

/**
 * Composite key format for identifying a hook slot.
 *
 * Format: `"{Event}:{matcher}"` or `"{Event}:"` (no matcher).
 * Examples: `"PostToolUse:Edit|Write"`, `"SessionStart:"`, `"SessionStart:compact"`.
 *
 * Two hooks at the same event+matcher are considered the "same slot."
 * Within a slot, individual hooks are compared by their `command` field.
 */
export const HookSlotKeySchema = z.string().brand<"HookSlotKey">();

/** Branded string type for hook slot composite keys. */
export type HookSlotKey = z.infer<typeof HookSlotKeySchema>;

// ─── Hook entry schema ───────────────────────────────────────────────────────

/**
 * Schema for a single hook entry within a settings.json slot.
 *
 * Matches the Claude Code hook entry structure directly as it appears
 * in `~/.claude/settings.json` under `hooks.{Event}[].hooks[]`.
 *
 * @example
 * ```typescript
 * const entry: HookEntry = {
 *   type: "command",
 *   command: '"/path/to/hooks/session-start.sh"',
 *   timeout: 15,
 *   async: false,
 *   status_message: "Initializing Luca...",
 * };
 * ```
 */
export const HookEntrySchema = z.object({
  /** Hook type. Currently only "command" is supported by Claude Code. */
  type: z.string(),
  /** Shell command to execute. May include quoted paths. */
  command: z.string(),
  /** Timeout in seconds before the hook is killed. */
  timeout: z.number().positive(),
  /** Whether to run the hook asynchronously (non-blocking). */
  async: z.boolean().optional(),
  /** Status message shown in the Claude Code UI while the hook runs. */
  status_message: z.string().optional(),
});

/** A single hook entry in settings.json. */
export type HookEntry = z.infer<typeof HookEntrySchema>;

// ─── Hook slot schema ────────────────────────────────────────────────────────

/**
 * Schema for a hook slot group within a settings.json event array.
 *
 * Each event in settings.json (e.g., `PostToolUse`) contains an array of
 * slot groups. Each group optionally has a `matcher` field and an array
 * of hooks. The composite key `{Event}:{matcher}` identifies the slot.
 *
 * @example
 * ```typescript
 * const slot: HookSlot = {
 *   matcher: "Edit|Write",
 *   hooks: [
 *     { type: "command", command: "...", timeout: 10 },
 *   ],
 * };
 * ```
 */
export const HookSlotSchema = z.object({
  /** Optional matcher regex for filtering which tool invocations trigger this slot. */
  matcher: z.string().optional(),
  /** Array of hook entries that fire when this slot matches. */
  hooks: z.array(HookEntrySchema),
});

/** A hook slot group containing a matcher and its hooks. */
export type HookSlot = z.infer<typeof HookSlotSchema>;

// ─── Merge action schemas ────────────────────────────────────────────────────

/**
 * Schema for an auto-merge action: new slot, add silently.
 *
 * Triggered when a Luca hook targets a slot (event+matcher) that does
 * not exist in the user's current settings.json.
 */
export const AutoMergeActionSchema = z.object({
  /** Discriminator for auto-merge actions. */
  type: z.literal("auto-merge"),
  /** The composite slot key being added. */
  slot_key: z.string(),
});

/**
 * Schema for an auto-skip action: identical hook exists, skip.
 *
 * Triggered when a Luca hook's command already exists in the target slot
 * with identical configuration.
 */
export const AutoSkipActionSchema = z.object({
  /** Discriminator for auto-skip actions. */
  type: z.literal("auto-skip"),
  /** The composite slot key being skipped. */
  slot_key: z.string(),
  /** The command string that was found to already exist. */
  command: z.string(),
});

/**
 * Schema for a conflict action: same slot, different command.
 *
 * Triggered when a Luca hook targets a slot that already has hooks with
 * different commands. Requires user resolution (interactive prompt or
 * default to "keep-both" in non-interactive mode).
 */
export const ConflictActionSchema = z.object({
  /** Discriminator for conflict actions. */
  type: z.literal("conflict"),
  /** The composite slot key where the conflict was found. */
  slot_key: z.string(),
  /** The command string already present in the user's settings. */
  existing_command: z.string(),
  /** The command string Luca wants to add. */
  proposed_command: z.string(),
});

/**
 * Discriminated union of all merge actions.
 *
 * Each action represents one outcome of comparing a proposed Luca hook
 * against the existing settings.json configuration.
 */
export const MergeActionSchema = z.discriminatedUnion("type", [
  AutoMergeActionSchema,
  AutoSkipActionSchema,
  ConflictActionSchema,
]);

/** A single merge action produced by the diff algorithm. */
export type MergeAction = z.infer<typeof MergeActionSchema>;

// ─── Merge result schema ─────────────────────────────────────────────────────

/**
 * Schema for the complete merge result returned by the merge algorithm.
 *
 * Contains the list of actions taken (for logging/reporting) and the
 * final merged settings object ready to be written to disk.
 *
 * @example
 * ```typescript
 * const result: MergeResult = {
 *   actions: [
 *     { type: "auto-merge", slot_key: "SubagentStop:" },
 *     { type: "auto-skip", slot_key: "SessionStart:", command: "..." },
 *     { type: "conflict", slot_key: "PostToolUse:Edit|Write", existing_command: "...", proposed_command: "..." },
 *   ],
 *   merged_settings: { hooks: { ... }, env: { ... } },
 * };
 * ```
 */
export const MergeResultSchema = z.object({
  /** Ordered list of merge actions taken during the merge. */
  actions: z.array(MergeActionSchema),
  /** The final merged settings object, ready to write as JSON. */
  merged_settings: z.record(z.string(), z.unknown()),
});

/** Complete result of a settings.json merge operation. */
export type MergeResult = z.infer<typeof MergeResultSchema>;

// ─── Conflict resolution schema ──────────────────────────────────────────────

/**
 * User's chosen resolution for a hook conflict.
 *
 * - `"keep-existing"`: Preserve the user's current hook, discard Luca's
 * - `"replace-with-luca"`: Replace the existing hook with Luca's version
 * - `"keep-both"`: Keep both hooks in the slot (default for non-interactive mode)
 */
export const CONFLICT_RESOLUTIONS = [
  "keep-existing",
  "replace-with-luca",
  "keep-both",
] as const;

export const ConflictResolutionSchema = z.enum(CONFLICT_RESOLUTIONS);

/** User's chosen resolution strategy for a hook conflict. */
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
