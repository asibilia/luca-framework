/**
 * Public API for the context module.
 *
 * Exports types, schemas, constants, defaults, and utility functions
 * for context tier management, document assembly, and result envelopes.
 */

// ---------------------------------------------------------------------------
// Types (re-exported as type-only)
// ---------------------------------------------------------------------------

export type {
  ContextTier,
  IsolationMode,
  ContextConfig,
  BudgetAllocation,
  ContextDocumentSet,
} from "./types";

export type {
  ResultStatus,
  IssueSeverity,
  ResultArtifact,
  ResultIssue,
  ResultMetadata,
  ResultEnvelope,
} from "./result-envelope";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export {
  contextTierSchema,
  isolationModeSchema,
  contextConfigSchema,
  budgetAllocationSchema,
  contextDocumentSetSchema,
} from "./types";

export {
  resultStatusSchema,
  issueSeveritySchema,
  artifactActionSchema,
  resultArtifactSchema,
  resultIssueSchema,
  resultMetadataSchema,
  resultEnvelopeSchema,
} from "./result-envelope";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export { CONTEXT_TIERS, CONTEXT_TIER_ORDER, ISOLATION_MODES } from "./types";

export {
  RESULT_STATUSES,
  ISSUE_SEVERITIES,
  ARTIFACT_ACTIONS,
} from "./result-envelope";

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export { meetsContextThreshold, maxContextTier } from "./types";

export { parseResultEnvelope } from "./result-envelope";

export {
  resolveEffectiveContextTier,
  resolveContextTierFromMatrix,
} from "./resolve-context-tier";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export {
  TIER_DOCUMENTS,
  ISOLATION_OVERRIDES,
  DEFAULT_AGENT_CONTEXT_PROFILES,
  FALLBACK_CONTEXT_PROFILE,
} from "./defaults";

export { DEFAULT_CONTEXT_PROMOTIONS } from "./resolve-context-tier";

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export type { AssembledContext } from "./context-assembler";
export {
  assembleContext,
  getRequiredDocumentKeys,
  assembledContextSchema,
} from "./context-assembler";

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type { AggregatedResult } from "./result-aggregator";
export { aggregateResults, aggregatedResultSchema } from "./result-aggregator";
