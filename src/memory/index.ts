/**
 * Memory subsystem barrel exports.
 *
 * Provides the public API for the Luca memory module including:
 * - Zod schemas and derived types for memory entries, compression, quality metrics
 * - Token estimation for budget-aware compression decisions
 * - Compression recommendation engine for MEMORY.md optimization
 * - Phase quality scoring with weighted composite scores
 * - Quality trend tracking with regression detection
 * - Working memory management (parse, serialize, merge, summarize)
 * - Context monitoring with zone mapping and compression triggers
 * - MEMORY.md parsing into structured entries
 * - Memory bridge CLI handlers for skill/agent integration
 */

// ─── Types and Schemas ─────────────────────────────────────────────────────────

export {
  brainSchema,
  memoryEntrySchema,
  compressionStrategySchema,
  compressionRecommendationSchema,
  tokenEstimateSchema,
  phaseQualityMetricsSchema,
  qualityTrendSchema,
  workingMemorySectionSchema,
  workingMemorySchema,
  workingMemorySectionNameSchema,
  contextUsageResultSchema,
  compressionTriggerSchema,
  COMPRESSION_STRATEGIES,
  WORKING_MEMORY_SECTIONS,
} from "./__schemas/memory.schemas";

export type {
  Brain,
  MemoryEntry,
  CompressionStrategy,
  CompressionRecommendation,
  TokenEstimate,
  PhaseQualityMetrics,
  QualityTrend,
  WorkingMemorySection,
  WorkingMemory,
  ContextUsageResult,
  CompressionTrigger,
} from "./__schemas/memory.schemas";

// ─── Token Estimation ──────────────────────────────────────────────────────────

export {
  estimateTokens,
  estimateTokensHeuristic,
  estimateFileTokens,
  estimateMemoryBudget,
  getEstimationMethod,
} from "./__helpers/token-estimator.ts";

// ─── Compression ───────────────────────────────────────────────────────────────

export { analyzeMemoryEntries } from "./__helpers/compression.ts";

// ─── Quality Scoring ───────────────────────────────────────────────────────────

export {
  calculatePhaseQuality,
  scoreToZone,
} from "./__helpers/quality-scorer.ts";

// ─── Quality Trend ─────────────────────────────────────────────────────────────

export {
  createQualityTrend,
  addPhaseMetrics,
  computeRollingAverage,
  detectRegression,
  serializeTrend,
  deserializeTrend,
} from "./__helpers/quality-trend.ts";

// ─── Working Memory ───────────────────────────────────────────────────────────

export {
  parseWorkingMemory,
  serializeWorkingMemory,
  addSection,
  summarizeSection,
  shouldAutoSummarize,
} from "./__helpers/working-memory.ts";

// ─── Context Monitoring ──────────────────────────────────────────────────────

export {
  createContextMonitor,
  getCurrentZone,
} from "./__helpers/context-monitor.ts";

// ─── Memory Parsing ──────────────────────────────────────────────────────────

export { parseMemoryFile } from "./__helpers/memory-parser.ts";

// ─── Procedure Types ────────────────────────────────────────────────────────

export {
  procedureStepSchema,
  procedureEntrySchema,
} from "./__schemas/memory.schemas";

export type { ProcedureStep, ProcedureEntry } from "./__schemas/memory.schemas";

// ─── Replay Schemas ─────────────────────────────────────────────────────────

export {
  replayThresholdSchema,
  prePlanSchema,
  replayResultSchema,
} from "./__schemas/memory.schemas";

export type {
  ReplayThreshold,
  PrePlan,
  ReplayResult,
} from "./__schemas/memory.schemas";

// ─── Procedure Parsing ──────────────────────────────────────────────────────

export {
  parseProcedureFile,
  parseProcedureContent,
  serializeProcedures,
  generateProcedureId,
} from "./__helpers/procedure-parser.ts";

// ─── Procedure Recall ───────────────────────────────────────────────────────

export { recallProcedures } from "./__helpers/procedure-recall.ts";

// ─── Procedure Replay ───────────────────────────────────────────────────────

export {
  findReplayableProcedures,
  adaptProcedureToContext,
  replayProcedure,
  convertToPrePlan,
  selectReplayableProcedures,
  ProcedureReplayContextSchema,
  ProcedureReplayResultSchema,
} from "./__helpers/procedure-replay.ts";

export type {
  ProcedureReplayContext,
  ProcedureReplayResult,
} from "./__helpers/procedure-replay.ts";

// ─── Procedure Lifecycle ────────────────────────────────────────────────────

export {
  evaluateRetirement,
  applyRetirement,
  updateExecutionStats,
  recordReplayOutcome,
  shouldAutoRetireAfterReplay,
} from "./__helpers/procedure-lifecycle.ts";

// ─── Milestone Recall ──────────────────────────────────────────────────────

export {
  scoreMilestoneRecall,
  parseVersion,
  versionDistance,
  calculateMilestoneProximity,
  calculateTagOverlap,
} from "./__helpers/milestone-recall.ts";

export type {
  MilestoneRecallConfig,
  ScoredMemoryEntry,
} from "./__helpers/milestone-recall.ts";

// ─── Context Pruning ────────────────────────────────────────────────────────

export {
  digestStaleEnvelopes,
  applySectionRetention,
  preserveCriticalContext,
  logPruningEvents,
  pruneWorkingMemory,
} from "./__helpers/context-pruning.ts";

// ─── Auto-Compaction ────────────────────────────────────────────────────────

export {
  shouldTriggerCompaction,
  scoreSections,
  compactSection,
  compactWorkingMemory,
} from "./__helpers/auto-compaction.ts";

// ─── Pruning & Compaction Schemas ───────────────────────────────────────────

export {
  retentionPolicySchema,
  pruningConfigSchema,
  pruningEventSchema,
  pruningResultSchema,
  sectionScoreSchema,
  compactionConfigSchema,
  compactionResultSchema,
} from "./__schemas/memory.schemas";

export type {
  RetentionPolicy,
  PruningConfig,
  PruningEvent,
  PruningResult,
  SectionScore,
  CompactionConfig,
  CompactionResult,
} from "./__schemas/memory.schemas";

// ─── Semantic Search ──────────────────────────────────────────────────────

export {
  tokenize,
  computeTfIdf,
  cosineSimilarity,
  semanticRecall,
} from "./__helpers/semantic-search.ts";

export type { SemanticRecallResult } from "./__helpers/semantic-search.ts";

// ─── Memory Bridge ─────────────────────────────────────────────────────────

export {
  handleReadMemory,
  handleReadWorking,
  handleReadProcedures,
  handleCheckContext,
  handleCheckCompression,
  handleAppendWorking,
  handleClearWorking,
  handleUpdateProcedureStats,
  handleReadGlobalMemory,
  handleFindReplayable,
  handleRecordReplayOutcome,
} from "./__helpers/bridge.ts";

// ─── Cognitive Profile ────────────────────────────────────────────────────

export {
  CognitiveProfileSchema,
  ImportResultSchema,
  ExportOptionsSchema,
  MergeResultSchema,
  exportCognitiveProfile,
  importCognitiveProfile,
  exportToGlobalMemory,
  loadGlobalMemory,
  mergeGlobalEntries,
} from "./__helpers/cognitive-profile.ts";

export type {
  CognitiveProfile,
  ImportResult,
  ExportOptions,
  MergeResult,
} from "./__helpers/cognitive-profile.ts";

// ─── Meta-Cognition ──────────────────────────────────────────────────────

export {
  ReflectionSchema,
  QualityAssessmentSchema,
  PastOutcomeSchema,
  assessPlanQuality,
  generateReflection,
} from "./__helpers/meta-cognition.ts";

export type {
  Reflection,
  QualityAssessment,
  PastOutcome,
} from "./__helpers/meta-cognition.ts";
