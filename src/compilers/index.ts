/**
 * Public API for the compilers module.
 *
 * Exports compilation functions and plugin manifest schemas.
 */

// Compilation functions
export {
  compileAgent,
  compileAgentClaude,
  compileAgentCursor,
  compileAgentPlugin,
  compileSkill,
  compileSkillClaude,
  compileSkillCursor,
  compileSkillPlugin,
  compileRule,
  compileRuleClaude,
  compileRuleCursor,
  compileRulePlugin,
  validateFormat,
} from "./__helpers/compile";
export type { SupportedFormat } from "./__helpers/compile";

// Plugin manifest schemas and types
export {
  KEBAB_CASE_REGEX,
  SEMVER_REGEX,
  pluginAuthorSchema,
  pluginManifestSchema,
  generatePluginManifest,
} from "./__schemas/compilers.schemas";
export type {
  PluginAuthor,
  PluginManifest,
  PluginManifestInput,
} from "./__schemas/compilers.schemas";

// Parity schemas and types (R10)
export {
  PARITY_ENTITY_TYPES,
  parityEntityTypeSchema,
  PARITY_FORMATS,
  parityFormatSchema,
  formatCountSchema,
  contentParityCheckSchema,
  parityReportSchema,
} from "./__schemas/compilers.schemas";
export type {
  ParityEntityType,
  ParityFormat,
  FormatCount,
  ContentParityCheck,
  ParityReport,
} from "./__schemas/compilers.schemas";

// Parity verification functions (R10)
export {
  checkFormatParity,
  checkContentParity,
  generateParityReport,
} from "./__helpers/parity";
