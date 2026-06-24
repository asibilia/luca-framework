/**
 * Recurrence-driven rule promotion.
 *
 * Counts how often the same postmortem violation code has appeared across
 * runs. When the distinct-run count reaches a threshold (default 3),
 * {@link detectRecurringPitfalls} surfaces it; {@link renderDraftRule}
 * generates a draft `.luca/rules/<slug>.ts` template and
 * {@link renderSuggestedRulesMarkdown} renders the full suggestion set.
 *
 * Drafts are NEVER auto-applied — the harness only surfaces a "this pitfall
 * has bitten you 3+ times, here's a starting point" suggestion. The user
 * edits and commits.
 *
 * Recurrence is counted as the number of *distinct runs* a code appeared in
 * (not total occurrences) so a single noisy run cannot spuriously promote a
 * rule.
 *
 * Ported from luca-mastracode `rule-engine/recurrence.ts`. Changes from the
 * mastracode original:
 *   - `detectRecurringPitfalls` is pure: it takes the per-run
 *     `PostmortemReport[]` as an explicit argument rather than discovering
 *     runs itself (the dropped `listArchivedRuns` archive layer) and calling
 *     `analyzeRun(runId)`. The caller assembles the reports.
 *   - `writeSuggestedRules` is not ported — the `.luca/` phase-dir contract
 *     has no `SUGGESTED-RULES.md` slot; callers render on demand via
 *     `renderSuggestedRulesMarkdown`.
 */
import type { PostmortemReport, ViolationCode } from '../analysis/postmortem.ts'

export interface RecurringPitfall {
    /** ViolationCode that recurred. */
    code: ViolationCode
    /** Distinct run count where this code appeared. */
    runCount: number
    /** Total occurrences across all runs (sum of per-run violation counts). */
    occurrences: number
    /**
     * Run IDs where this code appeared.
     *
     * Ordering follows the **caller-supplied `reports` order**: the
     * function preserves insertion order via a `Set<string>` keyed on
     * `report.runId`. To get "oldest-first" semantics (matching the
     * legacy mastracode behaviour, audit ref M4), pass the `reports`
     * array sorted by `startedAt` ascending. To get "newest-first",
     * sort descending. The function deliberately does not re-sort
     * internally because reports may lack `startedAt` (e.g. legacy
     * runs without a session-start event) and caller-side sorting is
     * the only signal the function can trust.
     */
    runIds: string[]
    /** Most recent violation message seen. */
    sampleMessage: string
    /** Suggested rule id, e.g. `recurring/todo-move-blocked`. */
    suggestedRuleId: string
    /** Suggested concept slug, e.g. `pitfall:todo-move-blocked`. */
    pitfallConcept: string
}

export interface RecurrenceReport {
    /** Total distinct runs scanned. */
    runsScanned: number
    /** Recurrence threshold used. */
    threshold: number
    /** Pitfalls meeting or exceeding threshold, sorted by runCount desc. */
    recurring: RecurringPitfall[]
}

const DEFAULT_THRESHOLD = 3

/**
 * Convert a ViolationCode to a kebab-case rule id slug.
 * `FORCED_TRANSITION` -> `forced-transition`
 */
function codeToSlug(code: ViolationCode): string {
    return code.toLowerCase().replace(/_/g, '-')
}

/**
 * Scan a set of per-run postmortem reports and surface violation codes that
 * have recurred at or above the threshold.
 */
export function detectRecurringPitfalls(opts: {
    reports: PostmortemReport[]
    threshold?: number
}): RecurrenceReport {
    const threshold = opts.threshold ?? DEFAULT_THRESHOLD

    const stats = new Map<
        ViolationCode,
        { runIds: Set<string>; occurrences: number; sampleMessage: string }
    >()

    for (const report of opts.reports) {
        for (const v of report.violations) {
            let entry = stats.get(v.code)
            if (!entry) {
                entry = {
                    runIds: new Set(),
                    occurrences: 0,
                    sampleMessage: v.message,
                }
                stats.set(v.code, entry)
            }
            entry.runIds.add(report.runId)
            entry.occurrences += 1
            entry.sampleMessage = v.message
        }
    }

    const recurring: RecurringPitfall[] = []
    for (const [code, entry] of stats) {
        if (entry.runIds.size < threshold) continue
        const slug = codeToSlug(code)
        recurring.push({
            code,
            runCount: entry.runIds.size,
            occurrences: entry.occurrences,
            runIds: [...entry.runIds],
            sampleMessage: entry.sampleMessage,
            suggestedRuleId: `recurring/${slug}`,
            pitfallConcept: `pitfall:${slug}`,
        })
    }

    recurring.sort((a, b) => b.runCount - a.runCount)

    return { runsScanned: opts.reports.length, threshold, recurring }
}

/**
 * Render a draft rule template for a recurring pitfall. Always returns valid
 * TypeScript; the body is intentionally a TODO — the user fills in the matcher.
 */
export function renderDraftRule(pitfall: RecurringPitfall): string {
    const sample = pitfall.sampleMessage
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
    return `/**
 * Auto-suggested rule from luca recurrence detection.
 *
 * This pitfall has appeared in ${pitfall.runCount} distinct run(s)
 * (${pitfall.occurrences} total occurrence(s)).
 *
 * Sample violation message:
 *   ${sample}
 *
 * NEXT STEPS:
 *   1. Decide what code pattern this rule should catch.
 *   2. Implement the matcher in the \`check\` function below.
 *      - Use \`file.content\` for regex checks.
 *      - Use \`file.ast()\` for AST-level matching.
 *   3. Set \`scope\` to the glob of files this rule should run against.
 *   4. Refine the severity (defaults to 'should-fix').
 *   5. Delete this comment block once the rule is real.
 *
 * The rule is exported as a plain duck-typed object so it works in any
 * consumer repo without a runtime dependency on the harness package.
 */

export default {
    id: '${pitfall.suggestedRuleId}',
    severity: 'should-fix',
    description: '${pitfall.code}: ${sample.replace(/'/g, "\\'")}',
    scope: 'src/**/*.ts',
    category: 'recurring',
    check: (file) => {
        // TODO: implement the check.
        // Example (regex):
        //   const findings = []
        //   const re = /badPattern/g
        //   let match
        //   while ((match = re.exec(file.content)) !== null) {
        //       const line = file.content.slice(0, match.index).split('\\n').length
        //       findings.push({
        //           id: \`${pitfall.suggestedRuleId}:\${file.path}:\${line}\`,
        //           path: file.path,
        //           line,
        //           severity: 'should-fix',
        //           summary: 'Recurring pitfall detected',
        //       })
        //   }
        //   return findings
        return []
    },
}
`
}

/**
 * Render the full SUGGESTED-RULES.md report — one section per recurring
 * pitfall with a code block of the draft rule.
 */
export function renderSuggestedRulesMarkdown(report: RecurrenceReport): string {
    if (report.recurring.length === 0) {
        return `# Suggested Rules

No recurring pitfalls met the threshold (>= ${report.threshold} runs).
Scanned ${report.runsScanned} run(s).
`
    }

    const sections = report.recurring.map(
        (
            p
        ) => `## ${p.code} — ${p.runCount} run(s), ${p.occurrences} occurrence(s)

**Suggested rule id**: \`${p.suggestedRuleId}\`
**Pitfall concept**: \`${p.pitfallConcept}\`
**Sample message**: ${p.sampleMessage}

**Runs where this appeared**:
${p.runIds.map((id) => `- ${id}`).join('\n')}

**Draft rule** — copy to \`.luca/rules/${codeToSlug(p.code)}.ts\` and fill in the matcher:

\`\`\`ts
${renderDraftRule(p)}\`\`\`
`
    )

    return `# Suggested Rules

Recurring pitfalls detected at threshold >= ${report.threshold} runs (out of ${report.runsScanned} scanned).

These suggestions are **drafts**. Each is a starting template, not an automatic addition. Review the sample messages, decide whether the pattern is mechanically detectable, fill in the matcher, and commit the rule to \`.luca/rules/\`.

---

${sections.join('\n---\n\n')}`
}
