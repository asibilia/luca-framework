/**
 * Rule registry for the Luca Framework
 * Auto-generated index file for bulk rule processing
 */

// Import all general rules
// -- Unique class names (14 rules)
import { APIpayloadsmustusRule } from './general/api-snake-case.rule';
import { AtlassianMCPintegrRule } from './general/atlassian-mcp.rule';
import { UseBunpackagemanaRule } from './general/bun-preference.rule';
import { GuidelinesforcreatRule } from './general/cursor_rules.rule';
import { FunctionalAPIReuseRule } from './general/functional-api-reuse.rule';
import { HarnessVerificationRule } from './general/harness-verification.rule';
import { HookSkillBoundaryRule } from './general/hook-skill-boundary.rule';
import { StandardsforimportRule } from './general/import-standards.rule';
import { LucaworkflowsystemRule } from './general/lu-workflow.rule';
import { MandatorydocumentatRule } from './general/mandatory-documentation.rule';
import { ProhibitclassusageRule } from './general/no-classes.rule';
import { ApplywheninteractiRule } from './general/posthog-integration.rule';
import { EnforceZodschemafRule } from './general/schema-first-parsing.rule';
import { GuidelinesforcontiRule } from './general/self_improve.rule';
import { GuidelinesforanalyRule } from './general/task-analyzation.rule';
import { UseBuninsteadofNRule } from './general/use-bun-instead-of-node-vite-npm-pnpm.rule';

// -- Duplicate class names requiring aliases (6 rules, 3 pairs)
import { GenericruledescripRule as FileNamingRule } from './general/file-naming.rule';
import { GenericruledescripRule as LodashPreferenceRule } from './general/lodash-preference.rule';
import { GuideforusingTaskRule as DevWorkflowRule } from './general/dev_workflow.rule';
import { GuideforusingTaskRule as TaskmasterDevWorkflowRule } from './general/taskmaster-dev_workflow.rule';
import { ComprehensiverefereRule as TaskmasterRule } from './general/taskmaster.rule';
import { ComprehensiverefereRule as TaskmasterTaskmasterRule } from './general/taskmaster-taskmaster.rule';

// Export base rule class
export { BaseRuleImpl } from './base/base-rule';

// Export types
export type { BaseRule, RuleConfig, RuleFrontmatter, RuleSection } from './types/rule.types';

// Registry mapping rule names to their classes for bulk processing
export const ruleRegistry = {
  'api-snake-case': APIpayloadsmustusRule,
  'atlassian-mcp': AtlassianMCPintegrRule,
  'bun-preference': UseBunpackagemanaRule,
  'cursor_rules': GuidelinesforcreatRule,
  'dev_workflow': DevWorkflowRule,
  'file-naming': FileNamingRule,
  'functional-api-reuse': FunctionalAPIReuseRule,
  'harness-verification': HarnessVerificationRule,
  'hook-skill-boundary': HookSkillBoundaryRule,
  'import-standards': StandardsforimportRule,
  'lodash-preference': LodashPreferenceRule,
  'lu-workflow': LucaworkflowsystemRule,
  'mandatory-documentation': MandatorydocumentatRule,
  'no-classes': ProhibitclassusageRule,
  'posthog-integration': ApplywheninteractiRule,
  'schema-first-parsing': EnforceZodschemafRule,
  'self_improve': GuidelinesforcontiRule,
  'task-analyzation': GuidelinesforanalyRule,
  'taskmaster': TaskmasterRule,
  'taskmaster-dev_workflow': TaskmasterDevWorkflowRule,
  'taskmaster-taskmaster': TaskmasterTaskmasterRule,
  'use-bun-instead-of-node-vite-npm-pnpm': UseBuninsteadofNRule,
};
