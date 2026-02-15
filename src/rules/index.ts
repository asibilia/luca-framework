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
import { StateMachineBridgeRule } from "./general/state-machine-bridge.rule";
import { UseBunRule } from "./general/use-bun-instead-of-node-vite-npm-pnpm.rule";

// Import Luca-specific rule
import { LuWorkflowRule } from "./lu-workflow.rule";

// Export base rule class
export { BaseRuleImpl } from "./base/base-rule";

// Export types
export type {
  RuleConfig,
  RuleFrontmatter,
  RuleSection,
} from "./types/rule.types";

// Import BaseRule for registry type annotation (also re-exported)
import type { BaseRule } from "./types/rule.types";
export type { BaseRule };

// Registry mapping rule names to factory functions for bulk processing
export const ruleRegistry: Record<string, () => BaseRule> = {
  "api-snake-case": () => new ApiSnakeCaseRule(),
  "atlassian-mcp": () => new AtlassianMcpRule(),
  "bun-preference": () => new BunPreferenceRule(),
  "complexity-gating": () => new ComplexityGatingRule(),
  cursor_rules: () => new CursorRulesRule(),
  "file-naming": () => new FileNamingRule(),
  "functional-api-reuse": () => new FunctionalAPIReuseRule(),
  "harness-verification": () => new HarnessVerificationRule(),
  "hook-skill-boundary": () => new HookSkillBoundaryRule(),
  "import-standards": () => new ImportStandardsRule(),
  "lodash-preference": () => new LodashPreferenceRule(),
  "mandatory-documentation": () => new MandatoryDocumentationRule(),
  "no-classes": () => new NoClassesRule(),
  "posthog-integration": () => new PosthogIntegrationRule(),
  "schema-first-parsing": () => new SchemaFirstParsingRule(),
  self_improve: () => new SelfImproveRule(),
  "state-machine-bridge": () => new StateMachineBridgeRule(),
  "use-bun-instead-of-node-vite-npm-pnpm": () => new UseBunRule(),
  "lu-workflow": () => new LuWorkflowRule(),
};
