/**
 * Rule registry for the Luca Framework
 * Auto-generated index file for bulk rule processing
 */

// Import all general rules
import { ApiSnakeCaseRule } from "./general/api-snake-case.rule";
import { AtlassianMcpRule } from "./general/atlassian-mcp.rule";
import { BunPreferenceRule } from "./general/bun-preference.rule";
import { ComplexityGatingRule } from "./general/complexity-gating.rule";
import { CursorRulesRule } from "./general/cursor_rules.rule";
import { FileNamingRule } from "./general/file-naming.rule";
import { FunctionalAPIReuseRule } from "./general/functional-api-reuse.rule";
import { HarnessVerificationRule } from "./general/harness-verification.rule";
import { HookSkillBoundaryRule } from "./general/hook-skill-boundary.rule";
import { ImportStandardsRule } from "./general/import-standards.rule";
import { LodashPreferenceRule } from "./general/lodash-preference.rule";
import { MandatoryDocumentationRule } from "./general/mandatory-documentation.rule";
import { NoClassesRule } from "./general/no-classes.rule";
import { PosthogIntegrationRule } from "./general/posthog-integration.rule";
import { SchemaFirstParsingRule } from "./general/schema-first-parsing.rule";
import { SelfImproveRule } from "./general/self_improve.rule";
import { UseBunRule } from "./general/use-bun-instead-of-node-vite-npm-pnpm.rule";

// Export base rule class
export { BaseRuleImpl } from "./base/base-rule";

// Export types
export type {
  BaseRule,
  RuleConfig,
  RuleFrontmatter,
  RuleSection,
} from "./types/rule.types";

// Registry mapping rule names to their classes for bulk processing
export const ruleRegistry = {
  "api-snake-case": ApiSnakeCaseRule,
  "atlassian-mcp": AtlassianMcpRule,
  "bun-preference": BunPreferenceRule,
  "complexity-gating": ComplexityGatingRule,
  cursor_rules: CursorRulesRule,
  "file-naming": FileNamingRule,
  "functional-api-reuse": FunctionalAPIReuseRule,
  "harness-verification": HarnessVerificationRule,
  "hook-skill-boundary": HookSkillBoundaryRule,
  "import-standards": ImportStandardsRule,
  "lodash-preference": LodashPreferenceRule,
  "mandatory-documentation": MandatoryDocumentationRule,
  "no-classes": NoClassesRule,
  "posthog-integration": PosthogIntegrationRule,
  "schema-first-parsing": SchemaFirstParsingRule,
  self_improve: SelfImproveRule,
  "use-bun-instead-of-node-vite-npm-pnpm": UseBunRule,
};
