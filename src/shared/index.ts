/**
 * Shared utilities barrel exports.
 *
 * Provides the public API for cross-domain shared utilities including:
 * - Result<T> discriminated union type for operation outcomes
 * - CLI argument parsing (getArg, hasFlag, escapeRegex)
 * - Deep freeze for immutable object graphs
 * - Section formatting (Cursor/Claude format converters)
 * - YAML frontmatter formatting
 * - JSON sanitization and config validation
 * - Template sanitization for prompt injection prevention
 * - Tribunal schemas, detection, and rebuttal infrastructure
 */

// ─── Types and Schemas ─────────────────────────────────────────────────────────

export type { Result } from "./__schemas/shared.schemas";

// ─── CLI Utilities ──────────────────────────────────────────────────────────────

export { getArg, hasFlag, escapeRegex } from "./__helpers/cli-utils";

// ─── Deep Freeze ────────────────────────────────────────────────────────────────

export { deepFreeze } from "./__helpers/deep-freeze";

// ─── Formatting ─────────────────────────────────────────────────────────────────

export {
  SectionSchema,
  toCursorFormat,
  toClaudeFormat,
} from "./__helpers/format";
export type { Section } from "./__helpers/format";
export { formatFrontmatter } from "./__helpers/utils";

// ─── Template Sanitization ───────────────────────────────────────────────────

export { sanitizeForTemplate } from "./__helpers/sanitize-template";

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
  ConsensusConfigSchema,
} from "./__schemas/consensus.schemas";

export type {
  ConsensusMode,
  ConsensusConfig,
} from "./__schemas/consensus.schemas";

export { resolveConsensus } from "./__helpers/consensus-resolver";

export type { ConsensusResult } from "./__helpers/consensus-resolver";

// ─── Memory Context ─────────────────────────────────────────────────────────

export {
  MemoryContextConfigSchema,
  buildMemoryContextBlock,
  clearMemoryContextCache,
} from "./__helpers/memory-context-builder";

export type { MemoryContextConfig } from "./__helpers/memory-context-builder";

// ─── Session Digest ─────────────────────────────────────────────────────────

export {
  SessionDigestConfigSchema,
  createSessionDigest,
} from "./__helpers/session-digest";

export type {
  SessionDigestConfig,
  SessionDigestResult,
} from "./__helpers/session-digest";
