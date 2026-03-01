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

// ─── Procedure Parsing ──────────────────────────────────────────────────────

export {
  parseProcedureFile,
  parseProcedureContent,
  serializeProcedures,
  generateProcedureId,
} from "./__helpers/procedure-parser.ts";

// ─── Procedure Recall ───────────────────────────────────────────────────────

export { recallProcedures } from "./__helpers/procedure-recall.ts";

// ─── Procedure Lifecycle ────────────────────────────────────────────────────

export {
  evaluateRetirement,
  applyRetirement,
  updateExecutionStats,
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
} from "./__helpers/bridge.ts";
