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
