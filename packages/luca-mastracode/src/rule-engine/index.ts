// Rule definition schema + factory
export {
    defineRule,
    type RuleDefinition,
    type RuleFinding,
    type RuleFile,
    type RuleSeverity,
} from './define-rule.js'

// Recurring-pitfall detection
export {
    detectRecurringPitfalls,
    renderDraftRule,
    renderSuggestedRulesMarkdown,
    writeSuggestedRules,
    type RecurrenceReport,
    type RecurringPitfall,
} from './recurrence.js'

// Rule discovery + execution engine
export {
    discoverAndRun,
    loadRules,
    runRules,
    _formatRelative,
    type RuleExecutionError,
    type RuleLoadError,
    type RuleRunReport,
} from './runner.js'
