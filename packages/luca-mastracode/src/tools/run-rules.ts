/**
 * run-rules (tool) — Mastra tool wrapper for the repo-local rule pack engine.
 *
 * Four actions:
 *   - list:  discover rules in `.luca/rules/` and return their metadata
 *            without executing them. Useful for confirming what rules a
 *            repo has loaded before running them.
 *   - run:   discover, load, and execute all rules. Returns the full
 *            RuleRunReport including findings, timings, and any
 *            load/execution errors. Non-blocking (returns success: true
 *            with the report; the caller decides how to act on findings).
 *   - gate:  same as `run` but blocks (`success: false`,
 *            `code: RULE_VIOLATIONS_DETECTED`) when any finding has
 *            severity `must-fix`. Used by execute-verify before declaring
 *            a wave passing.
 *   - suggest: scan postmortems for recurring pitfalls and render draft
 *            rules to `.planning/SUGGESTED-RULES.md`. Promotes pitfalls
 *            seen in N or more distinct runs (default 3) into rule
 *            templates the user can finalize.
 *
 * Every call appends a `rules-run` ledger event with totals so the
 * postmortem analyzer can observe rule activity over time.
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    detectRecurringPitfalls,
    renderSuggestedRulesMarkdown,
    writeSuggestedRules,
} from '../rule-engine/recurrence.js'
import { discoverAndRun, loadRules } from '../rule-engine/runner.js'
import { appendLedger } from '../state/session-ledger.js'

export const runRulesTool = createTool({
    id: 'run-rules',
    description:
        'Discover, load, and run repo-local rule packs from `.luca/rules/`. ' +
        "Use 'list' to inspect what rules are present without running them, " +
        "'run' to execute all rules and collect findings (non-blocking), " +
        "and 'gate' to block on any must-fix findings (used at execute-verify time). " +
        'Repo-local rules encode the project-specific "house rules" that recur in ' +
        'PR review feedback (Convex anti-patterns, auth requirements, naming conventions, etc.).',
    inputSchema: z.object({
        action: z
            .enum(['list', 'run', 'gate', 'suggest'])
            .describe(
                'list: discover and return rule metadata only | run: execute all rules, return findings | gate: execute and block on must-fix findings | suggest: scan postmortems for recurring pitfalls and render draft rules to .planning/SUGGESTED-RULES.md'
            ),
        rulesDir: z
            .string()
            .optional()
            .describe(
                'Override the rules directory (default: `.luca/rules/` relative to the repo root).'
            ),
        threshold: z
            .number()
            .optional()
            .describe(
                'suggest: minimum number of distinct runs a pitfall must appear in to be promoted (default 3).'
            ),
        write: z
            .boolean()
            .optional()
            .describe(
                'suggest: when true (default), write SUGGESTED-RULES.md to .planning/. When false, return the rendered markdown without writing.'
            ),
    }),
    execute: async (inputData) => {
        const repoRoot = process.cwd()
        const action = inputData.action

        if (action === 'suggest') {
            const threshold = inputData.threshold ?? 3
            const report = detectRecurringPitfalls({ threshold })
            const shouldWrite = inputData.write !== false
            let writePath: string | undefined
            let bytes = 0
            if (shouldWrite) {
                const result = writeSuggestedRules({ repoRoot, report })
                writePath = result.path
                bytes = result.bytes
            }
            const markdown = shouldWrite
                ? undefined
                : renderSuggestedRulesMarkdown(report)
            appendLedger('rules-run', {
                action,
                runsScanned: report.runsScanned,
                threshold,
                recurring: report.recurring.length,
                wrote: shouldWrite,
            })
            return {
                success: true,
                message:
                    report.recurring.length === 0
                        ? `No recurring pitfalls met the threshold (>= ${threshold} runs) across ${report.runsScanned} run(s).`
                        : `Found ${report.recurring.length} recurring pitfall(s) at threshold ${threshold}. ${
                              shouldWrite
                                  ? `Wrote ${bytes} bytes to ${writePath}.`
                                  : 'Markdown returned inline.'
                          }`,
                report,
                writePath,
                markdown,
            }
        }

        if (action === 'list') {
            const rulesDir =
                inputData.rulesDir ?? `${repoRoot}/.luca/rules`
            const { rules, filesDiscovered, loadErrors } = await loadRules(
                { rulesDir }
            )
            appendLedger('rules-run', {
                action,
                filesDiscovered,
                rulesLoaded: rules.length,
                loadErrors: loadErrors.length,
            })
            return {
                success: true,
                message: `Discovered ${filesDiscovered} rule file(s), loaded ${rules.length} rule(s).`,
                rules: rules.map((r) => ({
                    id: r.id,
                    severity: r.severity,
                    description: r.description,
                    scope: r.scope,
                    category: r.category,
                })),
                loadErrors,
            }
        }

        const report = await discoverAndRun({
            repoRoot,
            rulesDir: inputData.rulesDir,
        })

        const mustFixFindings = report.findings.filter(
            (f) => f.severity === 'must-fix'
        )

        appendLedger('rules-run', {
            action,
            filesDiscovered: report.rulesFilesDiscovered,
            rulesLoaded: report.rulesLoaded,
            findings: report.findings.length,
            mustFix: mustFixFindings.length,
            loadErrors: report.loadErrors.length,
            executionErrors: report.executionErrors.length,
        })

        if (action === 'gate' && mustFixFindings.length > 0) {
            return {
                success: false,
                code: 'RULE_VIOLATIONS_DETECTED',
                message: `Rule gate failed: ${mustFixFindings.length} must-fix finding(s) across ${report.rulesLoaded} loaded rule(s). Re-enter execute mode to address before completing this phase.`,
                report,
                mustFix: mustFixFindings,
            }
        }

        return {
            success: true,
            message:
                action === 'gate'
                    ? `Rule gate passed: ${report.rulesLoaded} rule(s) executed, ${report.findings.length} non-blocking finding(s).`
                    : `Ran ${report.rulesLoaded} rule(s): ${report.findings.length} finding(s) (${mustFixFindings.length} must-fix).`,
            report,
        }
    },
})
