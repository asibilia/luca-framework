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
  HydrationConfig,
  FileTreeEntry,
  GitCommitSummary,
  ImportEdge,
  PreFlightSnapshot,
  PhaseContextPayload,
} from "./__schemas/context.schemas";

export type {
  ResultStatus,
  IssueSeverity,
  ResultArtifact,
  ResultIssue,
  ResultMetadata,
  ResultEnvelope,
} from "./__schemas/result-envelope.schemas";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export {
  contextTierSchema,
  isolationModeSchema,
  contextConfigSchema,
  budgetAllocationSchema,
  contextDocumentSetSchema,
  hydrationConfigSchema,
  fileTreeEntrySchema,
  gitCommitSummarySchema,
  importEdgeSchema,
  preFlightSnapshotSchema,
  phaseContextPayloadSchema,
} from "./__schemas/context.schemas";

export {
  resultStatusSchema,
  issueSeveritySchema,
  artifactActionSchema,
  resultArtifactSchema,
  resultIssueSchema,
  resultMetadataSchema,
  resultEnvelopeSchema,
} from "./__schemas/result-envelope.schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export {
  CONTEXT_TIERS,
  CONTEXT_TIER_ORDER,
  ISOLATION_MODES,
} from "./__schemas/context.schemas";

export {
  RESULT_STATUSES,
  ISSUE_SEVERITIES,
  ARTIFACT_ACTIONS,
} from "./__schemas/result-envelope.schemas";

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export {
  meetsContextThreshold,
  maxContextTier,
} from "./__schemas/context.schemas";

export { parseResultEnvelope } from "./__helpers/result-envelope";

export {
  resolveEffectiveContextTier,
  resolveContextTierFromMatrix,
} from "./__helpers/resolve-context-tier";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export {
  TIER_DOCUMENTS,
  ISOLATION_OVERRIDES,
  DEFAULT_AGENT_CONTEXT_PROFILES,
  FALLBACK_CONTEXT_PROFILE,
} from "./__helpers/defaults";

export { DEFAULT_CONTEXT_PROMOTIONS } from "./__helpers/resolve-context-tier";

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export type { AssembledContext } from "./__helpers/context-assembler";
export {
  assembleContext,
  getRequiredDocumentKeys,
  assembledContextSchema,
  assembleAndSerialize,
  CONTEXT_TOKEN_CEILING,
} from "./__helpers/context-assembler";

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type { AggregatedResult } from "./__helpers/result-aggregator";
export {
  aggregateResults,
  aggregatedResultSchema,
} from "./__helpers/result-aggregator";

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export {
  fileTreeSnapshot,
  discoverTestFiles,
  recentGitHistory,
  extractImportGraph,
  complexityToHydrationConfig,
  generatePreFlightSnapshot,
} from "./__helpers/hydration-snapshot";
