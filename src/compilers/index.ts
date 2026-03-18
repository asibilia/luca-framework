/**
 * Public API for the compilers module.
 *
 * Exports compilation functions and plugin manifest schemas.
 */

// Compilation functions
export {
  compileAgent,
  compileAgentClaude,
  compileAgentPlugin,
  compileSkill,
  compileSkillClaude,
  compileSkillPlugin,
  compileRule,
  compileRuleClaude,
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

// Compiler plugin interface (R13)
export type { CompilerPlugin } from "./__schemas/compilers.schemas";

// Compiler plugin registry (R13)
export {
  registerCompilerPlugin,
  getCompilerPlugin,
  listCompilerPlugins,
  listRegisteredFormats,
  compileAgentViaRegistry,
  compileSkillViaRegistry,
  compileRuleViaRegistry,
  resetCompilerPluginRegistry,
} from "./__helpers/plugin-registry";

// Branding template transforms (Phase 191)
export {
  CONTENT_EXCLUSIONS,
  transformBrandingContent,
  transformBrandingFilename,
  transformBrandingDirname,
  transformOutputsToTemplates,
} from "./__helpers/template-transform";
