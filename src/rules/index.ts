/**
 * Rule registry for the Luca Framework
 *
 * Pure barrel file — re-exports only. All logic lives in __helpers/.
 */

// Registry (assembled from general + profile rules)
export { ruleRegistry } from "./__helpers/assemble-registry";

// Factory function
export { createRule } from "./__helpers/create-rule";

// Types
export type {
  BaseRule,
  RuleConfig,
  RuleFrontmatter,
  RuleSection,
} from "./__schemas/rule.schemas";

// Profile infrastructure
export { profileRegistry, ProfileConfigSchema } from "./profiles/index";
export type { TechStackProfile, ProfileConfig } from "./profiles/index";
