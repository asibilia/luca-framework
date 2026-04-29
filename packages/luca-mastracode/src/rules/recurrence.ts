/**
 * Recurrence-driven rule promotion.
 *
 * Counts how often the same postmortem pitfall has appeared across runs.
 * When recurrence_count >= threshold (default 3), generates a *draft*
 * `.luca/rules/<concept-slug>.ts` rule template and renders the full
 * suggestion set to `.planning/SUGGESTED-RULES.md` for human review.
 *
 * Drafts are NEVER auto-applied. The harness's job is to surface a
 * "this pitfall has bitten you 3+ times — here's a starting point for
 * a machine-checkable rule" suggestion. The user edits and commits.
 *
 * Counting strategy:
 *   - Iterate every available run (current + archived) via listRuns/
 *     listArchivedRuns + analyzeRun.
 *   - Group violations by `code` (the same key used to derive the
 *     pitfall concept slug).
 *   - Recurrence = count of distinct runs where the code appeared
 *     (not total occurrences — we don't want a single noisy run
 *     to spuriously promote a rule).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { analyzeRun } from '../postmortem.js'
import { listArchivedRuns, listRuns } from '../session-ledger.js'
import type { ViolationCode } from '../postmortem.js'

export interface RecurringPitfall {
    /** ViolationCode that recurred. */
    code: ViolationCode
    /** Distinct run count where this code appeared. */
    runCount: number
    /** Total occurrences across all runs (sum of per-run violation counts). */
    occurrences: number
    /** Run IDs where this code appeared (oldest first). */
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
 * `TODO_MOVE_BLOCKED` -> `todo-move-blocked`
 */
function codeToSlug(code: ViolationCode): string {
    return code.toLowerCase().replace(/_/g, '-')
}

/**
 * Scan all available runs (current + archived) and surface pitfalls
 * that have recurred at or above the threshold.
 */
export function detectRecurringPitfalls(opts?: {
    threshold?: number
}): RecurrenceReport {
    const threshold = opts?.threshold ?? DEFAULT_THRESHOLD

    const liveRuns = listRuns()
    const liveIds = new Set(liveRuns.map((r) => r.runId))
    const archivedIds = listArchivedRuns().filter((id) => !liveIds.has(id))
    const allRunIds = [...liveRuns.map((r) => r.runId), ...archivedIds]

    // Map ViolationCode -> { runIds: Set, occurrences: number, sampleMessage }
    const stats = new Map<
        ViolationCode,
        {
            runIds: Set<string>
            occurrences: number
            sampleMessage: string
            mostRecentRunId: string
        }
    >()

    for (const runId of allRunIds) {
        let report
        try {
            report = analyzeRun(runId)
        } catch {
            continue
        }
        for (const v of report.violations) {
            let entry = stats.get(v.code)
            if (!entry) {
                entry = {
                    runIds: new Set(),
                    occurrences: 0,
                    sampleMessage: v.message,
                    mostRecentRunId: runId,
                }
                stats.set(v.code, entry)
            }
            entry.runIds.add(runId)
            entry.occurrences += 1
            entry.sampleMessage = v.message
            entry.mostRecentRunId = runId
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

    return {
        runsScanned: allRunIds.length,
        threshold,
        recurring,
    }
}

/**
 * Render a draft rule template for a recurring pitfall.
 * Always returns valid TypeScript. Body is intentionally a TODO —
 * the user fills in the matcher logic.
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
export function renderSuggestedRulesMarkdown(
    report: RecurrenceReport
): string {
    if (report.recurring.length === 0) {
        return `# Suggested Rules

No recurring pitfalls met the threshold (>= ${report.threshold} runs).
Scanned ${report.runsScanned} run(s).
`
    }

    const sections = report.recurring.map((p) => {
        return `## ${p.code} — ${p.runCount} run(s), ${p.occurrences} occurrence(s)

**Suggested rule id**: \`${p.suggestedRuleId}\`
**Pitfall concept**: \`${p.pitfallConcept}\`
**Sample message**: ${p.sampleMessage}

**Runs where this appeared**:
${p.runIds.map((id) => `- ${id}`).join('\n')}

**Draft rule** — copy to \`.luca/rules/${codeToSlug(p.code)}.ts\` and fill in the matcher:

\`\`\`ts
${renderDraftRule(p)}\`\`\`
`
    })

    return `# Suggested Rules

Recurring pitfalls detected at threshold >= ${report.threshold} runs (out of ${report.runsScanned} scanned).

These suggestions are **drafts**. Each is a starting template, not an automatic addition. Review the sample messages, decide whether the pattern is mechanically detectable, fill in the matcher, and commit the rule to \`.luca/rules/\`.

---

${sections.join('\n---\n\n')}`
}

/**
 * Write SUGGESTED-RULES.md to .planning/. Creates the directory if missing.
 */
export function writeSuggestedRules(opts: {
    repoRoot: string
    report: RecurrenceReport
}): { path: string; bytes: number } {
    const planningDir = join(opts.repoRoot, '.planning')
    if (!existsSync(planningDir)) mkdirSync(planningDir, { recursive: true })
    const path = join(planningDir, 'SUGGESTED-RULES.md')
    const md = renderSuggestedRulesMarkdown(opts.report)
    writeFileSync(path, md, 'utf-8')
    return { path, bytes: md.length }
}
