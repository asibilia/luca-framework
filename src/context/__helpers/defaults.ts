/**
 * Default context profiles for Luca agents.
 *
 * Defines which documents each context tier includes, how isolation
 * modes filter the document set, and per-agent context tier assignments.
 *
 * Design principles:
 * - Tiers are additive: each higher tier includes everything from lower tiers
 * - T3 replaces summaries with full documents (brain_summary -> brain_full)
 * - Isolation modes override tier-based document selection for sensitive agents
 * - Every agent has a fallback profile (T0/T0/none)
 */
import type { ContextConfig, ContextTier, IsolationMode } from "../__schemas/context.schemas";

// ---------------------------------------------------------------------------
// Tier-to-document mapping
// ---------------------------------------------------------------------------

/**
 * Maps each context tier to the document keys that should be populated.
 *
 * Tiers are additive:
 * - T0: plan_content only (minimal context)
 * - T1: + brain_summary (project identity)
 * - T2: + state_content, memory_entries, working_content (full session)
 * - T3: brain_full replaces brain_summary, memory_full replaces
 *        memory_entries, + agent_summaries (fully loaded)
 */
export const TIER_DOCUMENTS: Record<ContextTier, string[]> = {
  T0: ["plan_content"],
  T1: ["plan_content", "brain_summary"],
  T2: [
    "plan_content",
    "brain_summary",
    "state_content",
    "memory_entries",
    "working_content",
  ],
  T3: [
    "plan_content",
    "brain_full",
    "state_content",
    "memory_full",
    "working_content",
    "agent_summaries",
  ],
};

// ---------------------------------------------------------------------------
// Isolation mode overrides
// ---------------------------------------------------------------------------

/**
 * Isolation mode overrides that restrict or filter the document set.
 *
 * Applied after tier-based document selection:
 * - none: no restrictions (default)
 * - cold: minimal context -- only git_diff + brain_summary, everything else excluded
 * - warm: partial context -- plan_content + plan_summaries + brain_summary,
 *         excludes working_content, memory_full, brain_full
 */
export const ISOLATION_OVERRIDES: Record<
  IsolationMode,
  { include: string[]; exclude: string[] }
> = {
  none: {
    include: [],
    exclude: [],
  },
  cold: {
    include: ["git_diff", "brain_summary"],
    exclude: [
      "plan_content",
      "state_content",
      "memory_entries",
      "working_content",
      "brain_full",
      "memory_full",
      "agent_summaries",
      "plan_summaries",
    ],
  },
  warm: {
    include: ["plan_content", "plan_summaries", "brain_summary"],
    exclude: ["working_content", "memory_full", "brain_full"],
  },
};

// ---------------------------------------------------------------------------
// Per-agent context profiles
// ---------------------------------------------------------------------------

/**
 * Default context configuration for each known agent.
 *
 * Format: { default_tier, promotable_to, isolation }
 *
 * Agents with "cold" isolation get minimal context to prevent leaking
 * session state into review outputs. Agents with "none" isolation get
 * full access to their tier's document set.
 */
export const DEFAULT_AGENT_CONTEXT_PROFILES: Record<string, ContextConfig> = {
  "lu-executor": { default_tier: "T2", promotable_to: "T3", isolation: "none" },
  "lu-planner": { default_tier: "T1", promotable_to: "T2", isolation: "none" },
  "lu-verifier": {
    default_tier: "T1",
    promotable_to: "T2",
    isolation: "warm",
  },
  "lu-cognition": {
    default_tier: "T3",
    promotable_to: "T3",
    isolation: "none",
  },
  "lu-debugger": {
    default_tier: "T2",
    promotable_to: "T3",
    isolation: "none",
  },
  "lu-router": { default_tier: "T0", promotable_to: "T1", isolation: "none" },
  "lu-learner": { default_tier: "T1", promotable_to: "T2", isolation: "none" },
  "dx-advocate": {
    default_tier: "T0",
    promotable_to: "T0",
    isolation: "cold",
  },
  "code-simplifier": {
    default_tier: "T0",
    promotable_to: "T0",
    isolation: "cold",
  },
  "code-architect": {
    default_tier: "T0",
    promotable_to: "T1",
    isolation: "cold",
  },
  "security-auditor": {
    default_tier: "T0",
    promotable_to: "T1",
    isolation: "cold",
  },
  "lu-plan-checker": {
    default_tier: "T1",
    promotable_to: "T2",
    isolation: "none",
  },
  "lu-pm-planner": {
    default_tier: "T1",
    promotable_to: "T2",
    isolation: "warm",
  },
};

/**
 * Fallback context profile used when an agent has no entry in
 * DEFAULT_AGENT_CONTEXT_PROFILES. Provides the most minimal context.
 */
export const FALLBACK_CONTEXT_PROFILE: ContextConfig = {
  default_tier: "T0",
  promotable_to: "T0",
  isolation: "none",
};
