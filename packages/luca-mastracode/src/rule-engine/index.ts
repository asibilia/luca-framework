/**
 * Rule engine — discovery, loading, and execution of repo-local rule packs.
 *
 * Tool wrapper: `tools/run-rules.ts`
 */
export {
    defineRule,
    type RuleDefinition,
    type RuleFile,
    type RuleFinding,
    type RuleSeverity,
} from './define-rule.js'

export {
    detectRecurringPitfalls,
    renderDraftRule,
    renderSuggestedRulesMarkdown,
    writeSuggestedRules,
    type RecurringPitfall,
    type RecurrenceReport,
} from './recurrence.js'

export {
    discoverAndRun,
    loadRules,
    runRules,
    _formatRelative,
    type RuleExecutionError,
    type RuleLoadError,
    type RuleRunReport,
} from './runner.js'
