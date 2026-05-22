// Barrel exports for the rule-engine domain.
// Repo-local rule packs (.luca/rules/*.ts). The runner and recurrence-
// driven rule promotion land in following increments.

export { defineRule } from './define-rule.ts'
export type {
    RuleSeverity,
    RuleFinding,
    RuleFile,
    RuleDefinition,
} from './define-rule.ts'
