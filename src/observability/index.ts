/**
 * Observability module for the Luca Framework.
 *
 * Provides agent effectiveness tracking, scorecard persistence,
 * query API for routing decisions, and report generation.
 */

// Schemas and types
export {
  scorecardEntrySchema,
  scorecardSchema,
  SCORECARD_SORT_FIELDS,
  scorecardSortFieldSchema,
  scorecardQuerySchema,
  scorecardReportEntrySchema,
  scorecardReportSchema,
} from "./__schemas/observability.schemas";

export type {
  ScorecardEntry,
  Scorecard,
  ScorecardSortField,
  ScorecardQuery,
  ScorecardReportEntry,
  ScorecardReport,
} from "./__schemas/observability.schemas";

// Scorecard engine
export {
  createScorecardEntry,
  createScorecard,
  recordInvocation,
  queryScorecard,
  formatScorecardReport,
  loadScorecard,
  saveScorecard,
} from "./__helpers/scorecard";
