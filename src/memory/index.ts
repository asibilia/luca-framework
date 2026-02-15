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
} from "./types.ts";

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
} from "./types.ts";

// ─── Token Estimation ──────────────────────────────────────────────────────────

export {
  estimateTokens,
  estimateFileTokens,
  estimateMemoryBudget,
} from "./token-estimator.ts";

// ─── Compression ───────────────────────────────────────────────────────────────

export { analyzeMemoryEntries } from "./compression.ts";

// ─── Quality Scoring ───────────────────────────────────────────────────────────

export { calculatePhaseQuality, scoreToZone } from "./quality-scorer.ts";

// ─── Quality Trend ─────────────────────────────────────────────────────────────

export {
  createQualityTrend,
  addPhaseMetrics,
  computeRollingAverage,
  detectRegression,
  serializeTrend,
  deserializeTrend,
} from "./quality-trend.ts";

// ─── Working Memory ───────────────────────────────────────────────────────────

export {
  parseWorkingMemory,
  serializeWorkingMemory,
  addSection,
  summarizeSection,
  shouldAutoSummarize,
} from "./working-memory.ts";

// ─── Context Monitoring ──────────────────────────────────────────────────────

export { createContextMonitor } from "./context-monitor.ts";

// ─── Memory Parsing ──────────────────────────────────────────────────────────

export { parseMemoryFile } from "./memory-parser.ts";

// ─── Procedure Types ────────────────────────────────────────────────────────

export { procedureStepSchema, procedureEntrySchema } from "./types.ts";

export type { ProcedureStep, ProcedureEntry } from "./types.ts";

// ─── Procedure Parsing ──────────────────────────────────────────────────────

export {
  parseProcedureFile,
  parseProcedureContent,
  serializeProcedures,
  generateProcedureId,
} from "./procedure-parser.ts";

// ─── Procedure Recall ───────────────────────────────────────────────────────

export { recallProcedures } from "./procedure-recall.ts";

// ─── Procedure Lifecycle ────────────────────────────────────────────────────

export {
  evaluateRetirement,
  applyRetirement,
  updateExecutionStats,
} from "./procedure-lifecycle.ts";

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
} from "./bridge.ts";
