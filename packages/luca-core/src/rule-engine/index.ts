// Barrel exports for the rule-engine domain.
// Repo-local rule packs (.luca/rules/*.ts): the defineRule contract, the
// discover/run runner, and recurrence-driven rule promotion.

export { defineRule } from './define-rule.ts'
export type {
    RuleSeverity,
    RuleFinding,
    RuleFile,
    RuleDefinition,
} from './define-rule.ts'

export { discoverAndRun, loadRules, runRules } from './runner.ts'
export type {
    RuleExecutionError,
    RuleLoadError,
    RuleRunReport,
} from './runner.ts'

export {
    detectRecurringPitfalls,
    renderDraftRule,
    renderSuggestedRulesMarkdown,
} from './recurrence.ts'
export type { RecurrenceReport, RecurringPitfall } from './recurrence.ts'
