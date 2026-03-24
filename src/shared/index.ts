/**
 * Shared utilities barrel exports.
 *
 * Provides the public API for cross-domain shared utilities including:
 * - Result<T> discriminated union type for operation outcomes
 * - CLI argument parsing (getArg, hasFlag, escapeRegex)
 * - Deep freeze for immutable object graphs
 * - Section formatting (Claude format converter)
 * - YAML frontmatter formatting
 * - JSON sanitization and config validation
 * - Template sanitization for prompt injection prevention
 * - Tribunal schemas, detection, and rebuttal infrastructure
 * - Memory context building and deferred recall cache
 */

// ─── Package Root Resolution ─────────────────────────────────────────────────

export {
  resolvePackageRoot,
  resolveSrcDir,
  resolveScriptsDir,
} from "./__helpers/resolve-package-root";

// ─── Types and Schemas ─────────────────────────────────────────────────────────

export type { Result } from "./__schemas/shared.schemas";

// ─── Lu Config ──────────────────────────────────────────────────────────────────

export { LuConfigSchema } from "./__schemas/lu-config.schemas";
export type { LuConfig } from "./__schemas/lu-config.schemas";

// ─── Workflow Version ───────────────────────────────────────────────────────────

export { WorkflowVersionSchema } from "./__schemas/lu-config.schemas";
export type { WorkflowVersion } from "./__schemas/lu-config.schemas";

// ─── Research Config ────────────────────────────────────────────────────────────

export {
  ResearchConfigSchema,
  ResearchConfigRefinedSchema,
} from "./__schemas/lu-config.schemas";
export type { ResearchConfig } from "./__schemas/lu-config.schemas";

// ─── CLI Utilities ──────────────────────────────────────────────────────────────

export { getArg, hasFlag, escapeRegex } from "./__helpers/cli-utils";

// ─── Deep Freeze ────────────────────────────────────────────────────────────────

export { deepFreeze } from "./__helpers/deep-freeze";

// ─── Formatting ─────────────────────────────────────────────────────────────────

export { SectionSchema, toClaudeFormat } from "./__helpers/format";
export type { Section } from "./__helpers/format";
export { formatFrontmatter } from "./__helpers/utils";

// ─── Template Sanitization ───────────────────────────────────────────────────

export {
  sanitizeForTemplate,
  escapeXmlAttr,
  escapeRegExp,
} from "./__helpers/sanitize-template";

// ─── Validation ─────────────────────────────────────────────────────────────────

export {
  sanitizeJsonParse,
  safeSanitizeJsonParse,
  safeValidate,
} from "./__helpers/validation-utils";

// ─── Tribunal Schemas ──────────────────────────────────────────────────────────

export {
  reviewFindingSchema,
  CONFLICT_TYPES,
  conflictTypeSchema,
  disagreementSchema,
  REBUTTAL_RESOLUTIONS,
  rebuttalResolutionSchema,
  rebuttalSchema,
  unifiedRecommendationSchema,
  tribunalResultSchema,
} from "./__schemas/tribunal.schemas";

export type {
  ReviewFinding,
  ConflictType,
  Disagreement,
  RebuttalResolution,
  Rebuttal,
  UnifiedRecommendation,
  TribunalResult,
} from "./__schemas/tribunal.schemas";

// ─── Tribunal Detection ────────────────────────────────────────────────────────

export {
  normalizeFindings,
  detectDisagreements,
  shouldRunTribunal,
} from "./__helpers/tribunal-detector";

// ─── Tribunal Rebuttals ────────────────────────────────────────────────────────

export {
  buildRebuttalPrompts,
  resolveRebuttals,
  buildTribunalResult,
} from "./__helpers/tribunal-rebuttals";

export type { RebuttalPromptPair } from "./__helpers/tribunal-rebuttals";

// ─── Resolution Counting ─────────────────────────────────────────────────────

export { countResolutions } from "./__helpers/resolution-counts";
export type { ResolutionCounts } from "./__helpers/resolution-counts";

// ─── Tribunal Consensus ───────────────────────────────────────────────────────

export { resolveMajorityVote } from "./__helpers/tribunal-consensus";

export type {
  VotablePerspective,
  MajorityVoteResult,
} from "./__helpers/tribunal-consensus";

// ─── Parsing Utilities ──────────────────────────────────────────────────────

export { safeParseOrThrow } from "./__helpers/safe-parse-or-throw";

// ─── Consensus Resolution ───────────────────────────────────────────────────

export {
  CONSENSUS_MODES,
  consensusModeSchema,
  ConsensusTypeSchema,
  FALLBACK_STRATEGIES,
  ConsensusFallbackStrategySchema,
  ConsensusConfigSchema,
  ConsensusResultSchema,
} from "./__schemas/consensus.schemas";

export type {
  ConsensusMode,
  ConsensusType,
  ConsensusFallbackStrategy,
  FallbackStrategy,
  ConsensusConfig,
  ConsensusResult as FlatConsensusResult,
} from "./__schemas/consensus.schemas";

export {
  resolveConsensus,
  toFlatConsensusResult,
} from "./__helpers/consensus-resolver";

export type { ConsensusResult } from "./__helpers/consensus-resolver";

// ─── Memory Context ─────────────────────────────────────────────────────────

export {
  MemoryContextConfigSchema,
  buildMemoryContextBlock,
  clearMemoryContextCache,
  requestMemoryContext,
  estimateTokens,
} from "./__helpers/memory-context-builder";

export type {
  MemoryContextConfig,
  RequestMemoryContextConfig,
} from "./__helpers/memory-context-builder";

// ─── Recall Cache Schemas ──────────────────────────────────────────────────

export {
  RecalledEngramSchema,
  RecallCacheEntrySchema,
} from "./__schemas/recall-cache.schemas";

export type {
  RecalledEngram,
  RecallCacheEntry,
} from "./__schemas/recall-cache.schemas";

// ─── Recall Cache Functions ───────────────────────────────────────────────

export {
  getCachedRecall,
  setCachedRecall,
  hasRecallCache,
  clearRecallCache,
} from "./__helpers/recall-cache";

// ─── Memory Metrics Schemas ────────────────────────────────────────────────

export {
  MemoryFeedbackEntrySchema,
  MemoryPhaseMetricsSchema,
  MemoryHealthSummarySchema,
  EngramFeedbackHistoryEntrySchema,
  ConfidenceActualEntrySchema,
  HistoricalPhaseDataSchema,
} from "./__schemas/memory-metrics.schemas";

export type {
  MemoryFeedbackEntry,
  MemoryPhaseMetrics,
  MemoryHealthSummary,
  EngramFeedbackHistoryEntry,
  ConfidenceActualEntry,
  HistoricalPhaseData,
} from "./__schemas/memory-metrics.schemas";

// ─── Memory Feedback ───────────────────────────────────────────────────────

export {
  determineFeedback,
  computeMemoryPhaseMetrics,
} from "./__helpers/memory-feedback";

// ─── Session Digest ─────────────────────────────────────────────────────────

export {
  SessionDigestConfigSchema,
  createSessionDigest,
} from "./__helpers/session-digest";

export type {
  SessionDigestConfig,
  SessionDigestResult,
} from "./__helpers/session-digest";

// ─── Shadow Scanner Schemas ────────────────────────────────────────────────────

export {
  ShadowFindingSchema,
  ShadowScanReportSchema,
  ShadowDebtConfigSchema,
} from "./__schemas/shadow-scanner.schemas";

export type {
  ShadowFinding,
  ShadowScanReport,
  ShadowDebtConfig,
} from "./__schemas/shadow-scanner.schemas";
