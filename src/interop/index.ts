/**
 * Public API for the interop module.
 *
 * Cross-agent interop scanner for discovering agent definitions across
 * IDE tool directories and normalizing them to a common format.
 *
 * T1 (Core) domain — imports only from T0 (shared, complexity).
 */

// ---------------------------------------------------------------------------
// Types (re-exported as type-only)
// ---------------------------------------------------------------------------

export type {
  SourceTool,
  InteropAgentSummary,
  InteropScanResult,
  InteropScanConfig,
} from "./__schemas/interop.schemas";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export {
  sourceToolSchema,
  interopAgentSummarySchema,
  interopScanResultSchema,
  interopScanConfigSchema,
} from "./__schemas/interop.schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export { SOURCE_TOOLS } from "./__schemas/interop.schemas";
export { KNOWN_AGENT_DIRS } from "./__helpers/scanner";

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export { scanForAgents, formatScanSummary } from "./__helpers/scanner";

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export {
  detectSourceTool,
  parseMarkdownFrontmatter,
  extractCapabilities,
  normalizeAgent,
} from "./__helpers/normalizer";
