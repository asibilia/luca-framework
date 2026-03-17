import type { PresetId, HarnessId, ApprovalConfig } from "../types";

/**
 * Default values applied by each progressive preset.
 *
 * Each preset provides sensible defaults for harnesses, approvals,
 * and work tracker. These can be overridden by explicit CLI args
 * or wizard selections.
 */
export interface PresetDefaults {
  /** Human-readable label for display in wizard */
  label: string;
  /** Short description shown in preset selection */
  description: string;
  /** Default harness platforms */
  harnesses: HarnessId[];
  /** Default approval gate configuration */
  approvals: ApprovalConfig;
  /** Default work tracker */
  workTracker: "jira" | "github" | "none";
}

/**
 * Progressive configuration presets.
 *
 * Controls the default complexity of a Luca project setup.
 * Users can override any individual setting after selecting a preset.
 *
 * - **starter**: Minimal — Claude Code, no approval gates, no tracker.
 *   Best for solo experiments and quick prototypes.
 *
 * - **standard**: Balanced — Claude Code, moderate approval gates,
 *   GitHub tracker. Best for active solo or small-team projects.
 *
 * - **full**: Everything enabled — Claude Code, all approval gates,
 *   Jira tracker. Best for production workflows with full traceability.
 */
export const PRESETS: Record<PresetId, PresetDefaults> = {
  starter: {
    label: "Starter",
    description: "Minimal setup: Claude Code, no approval gates",
    harnesses: ["claude"],
    approvals: {
      plans: false,
      destructive: false,
      external: false,
      custom_triggers: [],
    },
    workTracker: "none",
  },
  standard: {
    label: "Standard",
    description: "Balanced defaults: Claude Code, moderate gates",
    harnesses: ["claude"],
    approvals: {
      plans: true,
      destructive: true,
      external: false,
      custom_triggers: [],
    },
    workTracker: "github",
  },
  full: {
    label: "Full",
    description: "Claude Code, all gates, full traceability",
    harnesses: ["claude"],
    approvals: {
      plans: true,
      destructive: true,
      external: true,
      custom_triggers: [],
    },
    workTracker: "jira",
  },
};

/**
 * Valid preset identifiers for validation.
 *
 * @example
 * ```typescript
 * if (!VALID_PRESETS.includes(userInput)) {
 *   throw new Error(`Invalid preset: ${userInput}`);
 * }
 * ```
 */
export const VALID_PRESETS: readonly PresetId[] = [
  "starter",
  "standard",
  "full",
] as const;

/**
 * Default preset used when none is specified.
 */
export const DEFAULT_PRESET: PresetId = "standard";

/**
 * Get the default values for a given preset.
 *
 * Returns a copy of the preset defaults to prevent mutation.
 *
 * @param presetId - Preset identifier
 * @returns PresetDefaults for the given preset
 * @throws Error if presetId is not a valid preset
 *
 * @example
 * ```typescript
 * const defaults = getPresetDefaults('starter');
 * // { label: 'Starter', harnesses: ['claude'], approvals: {...}, workTracker: 'none' }
 *
 * const standard = getPresetDefaults('standard');
 * // { label: 'Standard', harnesses: ['claude'], approvals: {...}, workTracker: 'github' }
 * ```
 */
export function getPresetDefaults(presetId: PresetId): PresetDefaults {
  const preset = PRESETS[presetId];
  if (!preset) {
    throw new Error(
      `Invalid preset "${presetId}". Valid options: ${VALID_PRESETS.join(", ")}`,
    );
  }

  // Return a shallow copy to prevent mutation of the const record
  return {
    ...preset,
    harnesses: [...preset.harnesses],
    approvals: {
      ...preset.approvals,
      custom_triggers: [...preset.approvals.custom_triggers],
    },
  };
}
