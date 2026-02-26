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

// ─── Validation ─────────────────────────────────────────────────────────────────

export {
  sanitizeJsonParse,
  safeSanitizeJsonParse,
  validateAgentConfig,
  validateSkillConfig,
  validateRuleConfig,
  safeValidateAgentConfig,
  safeValidateSkillConfig,
  safeValidateRuleConfig,
} from "./__helpers/validation-utils";
