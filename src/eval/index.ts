// ─── Schemas ─────────────────────────────────────────────────────────────
export {
  // Grader types
  GRADER_TYPES,
  GraderTypeSchema,
  CODE_GRADER_STRATEGIES,
  CodeGraderStrategySchema,
  GraderResultSchema,
  CodeGraderConfigSchema,
  LlmGraderConfigSchema,
  CompositeGraderEntrySchema,
  CompositeGraderConfigSchema,
  // Eval case + suite
  EvalCaseSchema,
  EvalSuiteConfigSchema,
  EvalSuiteSchema,
  // Results + reports
  TokenUsageSchema,
  EvalResultSchema,
  EvalRunMetadataSchema,
  EvalReportSchema,
  // Comparison
  COMPARISON_VERDICTS,
  ComparisonVerdictSchema,
  EvalDeltasSchema,
  EvalComparisonSchema,
} from "./__schemas/eval.schemas";

export type {
  GraderType,
  CodeGraderStrategy,
  GraderResult,
  CodeGraderConfig,
  LlmGraderConfig,
  CompositeGraderEntry,
  CompositeGraderConfig,
  EvalCase,
  EvalSuiteConfig,
  EvalSuite,
  TokenUsage,
  EvalResult,
  EvalRunMetadata,
  EvalReport,
  ComparisonVerdict,
  EvalDeltas,
  EvalComparison,
} from "./__schemas/eval.schemas";

// ─── Helpers: Graders ────────────────────────────────────────────────────
export { gradeWithCode } from "./__helpers/code-grader";
export type { CustomGraderFn } from "./__helpers/code-grader";
export { gradeWithLlm } from "./__helpers/llm-grader";
export type { LlmAdapter } from "./__helpers/llm-grader";
export { gradeWithComposite } from "./__helpers/composite-grader";

// ─── Helpers: Reporter ───────────────────────────────────────────────────
export {
  writeJsonReport,
  formatMarkdownReport,
  printConsoleReport,
  printComparisonReport,
  loadLatestReport,
  loadReport,
} from "./__helpers/eval-reporter";
export type { ReportFormat } from "./__helpers/eval-reporter";

// ─── Helpers: Comparator ─────────────────────────────────────────────────
export {
  compareEvalRuns,
  compareWithLatestBaseline,
} from "./__helpers/eval-comparator";
