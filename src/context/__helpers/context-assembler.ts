/**
 * Context assembly for sub-agent invocations.
 *
 * Assembles the set of context documents that a sub-agent should receive
 * based on its role (agent name), the current task complexity, and any
 * override profile. The assembly process:
 *
 * 1. Resolves the agent's context profile (override > per-agent default > fallback)
 * 2. Resolves the effective context tier via complexity-driven promotions
 * 3. Determines document keys from the tier
 * 4. Applies isolation mode overrides (cold/warm restrict the document set)
 * 5. Filters available documents to only the allowed keys
 *
 * Uses snake_case for API compatibility.
 */
import { z } from "zod";

import type { ComplexityLevel } from "~/complexity/__schemas/complexity.schemas";

import type {
  ContextConfig,
  ContextDocumentSet,
  PhaseContextPayload,
} from "../__schemas/context.schemas";
import {
  contextTierSchema,
  isolationModeSchema,
  contextDocumentSetSchema,
  budgetAllocationSchema,
  phaseContextPayloadSchema,
} from "../__schemas/context.schemas";
import { resolveContextTierFromMatrix } from "./resolve-context-tier";
import {
  TIER_DOCUMENTS,
  ISOLATION_OVERRIDES,
  DEFAULT_AGENT_CONTEXT_PROFILES,
  FALLBACK_CONTEXT_PROFILE,
} from "./defaults";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Schema for an assembled context ready for sub-agent injection.
 *
 * Contains the filtered document set, the resolved tier and isolation mode,
 * an optional budget allocation, and the target agent name.
 *
 * Uses snake_case for API compatibility.
 */
export const assembledContextSchema = z.object({
  /** Filtered context documents for the agent */
  documents: contextDocumentSetSchema,
  /** The effective tier after complexity-driven promotion */
  effective_tier: contextTierSchema,
  /** The isolation mode applied */
  isolation_mode: isolationModeSchema,
  /** Optional token budget allocation */
  budget: budgetAllocationSchema.optional(),
  /** Name of the agent this context was assembled for */
  agent_name: z.string(),
});

/** Assembled context type derived from schema */
export type AssembledContext = z.infer<typeof assembledContextSchema>;

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the context document set for a sub-agent invocation.
 *
 * Resolves the agent's profile, promotes the context tier based on
 * complexity, applies isolation overrides, and filters the available
 * documents to only those the agent is allowed to see.
 *
 * @param agentName - Name of the agent (e.g., "lu-executor", "dx-advocate")
 * @param complexityLevel - Current task complexity level
 * @param availableDocuments - The full set of available context documents
 * @param overrideProfile - Optional override for the agent's context config
 * @returns An AssembledContext with filtered documents and resolved metadata
 *
 * @example
 * ```typescript
 * const context = assembleContext(
 *   "lu-executor",
 *   "COMPLEX",
 *   { plan_content: "...", brain_summary: "...", state_content: "..." },
 * );
 * // context.effective_tier === "T3" (T2 promoted at COMPLEX)
 * // context.documents contains plan_content, brain_full, state_content, etc.
 * ```
 *
 * @example
 * ```typescript
 * const context = assembleContext(
 *   "dx-advocate",
 *   "MODERATE",
 *   { git_diff: "...", brain_summary: "...", plan_content: "..." },
 * );
 * // context.effective_tier === "T0" (cold isolation, not promotable)
 * // context.documents contains only git_diff and brain_summary
 * ```
 */
export function assembleContext(
  agentName: string,
  complexityLevel: ComplexityLevel,
  availableDocuments: ContextDocumentSet,
  overrideProfile?: ContextConfig,
): AssembledContext {
  // 1. Look up agent profile
  const profile =
    overrideProfile ??
    DEFAULT_AGENT_CONTEXT_PROFILES[agentName] ??
    FALLBACK_CONTEXT_PROFILE;

  // 2. Resolve effective tier via complexity-driven promotion
  const effectiveTier = resolveContextTierFromMatrix(
    profile.default_tier,
    profile.promotable_to,
    complexityLevel,
  );

  // 3. Determine allowed document keys based on tier + isolation
  let allowedKeys: Set<string>;

  if (profile.isolation !== "none") {
    // Isolation modes define their own include list, ignoring tier documents
    const override = ISOLATION_OVERRIDES[profile.isolation];
    allowedKeys = new Set(override.include);
  } else {
    // No isolation: use tier-based document keys
    allowedKeys = new Set(TIER_DOCUMENTS[effectiveTier]);
  }

  // 4. Filter available documents to only allowed keys
  const documents: Record<string, string | undefined> = {};
  for (const key of allowedKeys) {
    const value = availableDocuments[key as keyof ContextDocumentSet];
    if (value !== undefined) {
      documents[key] = value;
    }
  }

  return {
    documents: documents as ContextDocumentSet,
    effective_tier: effectiveTier,
    isolation_mode: profile.isolation,
    agent_name: agentName,
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Default token ceiling for context payloads (~2K tokens) */
export const CONTEXT_TOKEN_CEILING = 2000;

/**
 * Assemble, serialize, and cap context for sub-agent dispatch.
 *
 * Calls assembleContext() then renders the filtered document set
 * into a single string. Estimates token count using the 4-chars-per-token
 * heuristic. Caps the string at `tokenCeiling * 4` characters if needed.
 *
 * @param agentName - Target agent name
 * @param complexityLevel - Current task complexity
 * @param availableDocuments - Full document set to filter from
 * @param tokenCeiling - Max tokens for payload (default 2000)
 * @param overrideProfile - Optional context config override
 * @returns PhaseContextPayload ready for prompt injection
 *
 * @example
 * ```typescript
 * const payload = assembleAndSerialize(
 *   "lu-executor",
 *   "COMPLEX",
 *   { plan_content: "...", brain_summary: "..." },
 *   2000,
 * );
 * // payload.estimated_tokens <= 2000
 * // payload.payload is a string ready for prompt injection
 * ```
 */
export function assembleAndSerialize(
  agentName: string,
  complexityLevel: ComplexityLevel,
  availableDocuments: ContextDocumentSet,
  tokenCeiling: number = CONTEXT_TOKEN_CEILING,
  overrideProfile?: ContextConfig,
): PhaseContextPayload {
  const assembled = assembleContext(
    agentName,
    complexityLevel,
    availableDocuments,
    overrideProfile,
  );

  // Render documents into a single string
  const parts: string[] = [];
  for (const [key, value] of Object.entries(assembled.documents)) {
    if (value !== undefined) {
      parts.push(`<!-- ${key} -->\n${value}`);
    }
  }
  const raw = parts.join("\n\n");

  // Cap at ceiling (4 chars ≈ 1 token)
  const charCeiling = tokenCeiling * 4;
  const wasCapped = raw.length > charCeiling;
  const payload = wasCapped ? raw.slice(0, charCeiling) : raw;

  return phaseContextPayloadSchema.parse({
    agent_name: agentName,
    tier: assembled.effective_tier,
    payload,
    estimated_tokens: Math.ceil(payload.length / 4),
    was_capped: wasCapped,
  });
}

// ---------------------------------------------------------------------------
// Key lookup
// ---------------------------------------------------------------------------

/**
 * Get the list of document keys that an agent requires at a given complexity.
 *
 * Useful for pre-loading only the documents that will actually be used,
 * avoiding unnecessary file reads or API calls for documents that would
 * be filtered out by isolation or tier restrictions.
 *
 * @param agentName - Name of the agent
 * @param complexityLevel - Current task complexity level
 * @param overrideProfile - Optional override for the agent's context config
 * @returns Array of document key strings the agent will need
 *
 * @example
 * ```typescript
 * const keys = getRequiredDocumentKeys("lu-verifier", "MODERATE");
 * // ["plan_content", "plan_summaries", "brain_summary"] (warm isolation)
 *
 * const keys = getRequiredDocumentKeys("lu-executor", "COMPLEX");
 * // ["plan_content", "brain_full", "state_content", "memory_full",
 * //  "working_content", "agent_summaries"] (T3, no isolation)
 * ```
 */
export function getRequiredDocumentKeys(
  agentName: string,
  complexityLevel: ComplexityLevel,
  overrideProfile?: ContextConfig,
): string[] {
  const profile =
    overrideProfile ??
    DEFAULT_AGENT_CONTEXT_PROFILES[agentName] ??
    FALLBACK_CONTEXT_PROFILE;

  const effectiveTier = resolveContextTierFromMatrix(
    profile.default_tier,
    profile.promotable_to,
    complexityLevel,
  );

  if (profile.isolation !== "none") {
    const override = ISOLATION_OVERRIDES[profile.isolation];
    return [...override.include];
  }

  return [...TIER_DOCUMENTS[effectiveTier]];
}
