/**
 * Inlined constants for Pi extensions.
 *
 * Pi loads extensions via jiti (a Node.js TypeScript loader) which cannot
 * resolve `@alecsibilia/luca-framework/state` through the workspace
 * symlink. This file inlines the subset of constants and types that Pi
 * extensions need, avoiding the problematic cross-package import.
 *
 * IMPORTANT: These values MUST stay in sync with the canonical definitions
 * in `packages/luca-framework/src/state/`. If you update complexity levels,
 * model tiers, settable fields, or the state file path there, update here too.
 *
 * Canonical sources:
 * - COMPLEXITY_LEVELS, ModelId, ModelTier, MODEL_TIER_TO_MODEL:
 *     packages/luca-framework/src/state/utils/complexity-utils.ts
 * - SETTABLE_FIELDS:
 *     luca-bridge CLI (source: packages/luca-framework/src/state/bridge.ts)
 * - STATE_FILE_PATH:
 *     packages/luca-framework/src/state/persistence.ts
 *
 * Source: src/hooks/pi-extensions/__helpers/luca-constants.ts
 * Deployed to: .pi/extensions/__helpers/luca-constants.ts
 */

// ─── Complexity ─────────────────────────────────────────────────────────────

export const COMPLEXITY_LEVELS = [
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
] as const;

export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

// ─── Model Routing ──────────────────────────────────────────────────────────

export type ModelId = "gemini-3.1-pro-preview" | "gemini-3-flash-preview";
export type ModelTier = "fast" | "balanced" | "capable";

export const MODEL_TIER_TO_MODEL: Record<ModelTier, ModelId> = {
  fast: "gemini-3-flash-preview",
  balanced: "gemini-3.1-pro-preview",
  capable: "gemini-3.1-pro-preview",
};

// ─── Settable Fields ────────────────────────────────────────────────────────

export const SETTABLE_FIELDS = [
  "current_milestone",
  "current_phase",
  "github_issue",
  "branch",
  "base_branch",
  "ticket_id",
  "oversight",
  "complexity",
  "memory_tags",
  "intuition_flags",
] as const;

// ─── State File Path ────────────────────────────────────────────────────────

export const STATE_FILE_PATH = ".planning/state.json";
