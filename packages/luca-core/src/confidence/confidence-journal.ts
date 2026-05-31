/**
 * Confidence journal — append-only log of execution-time decision confidence.
 *
 * Data layer: `.luca/phases/<slug>/confidence.jsonl` (machine-readable,
 * append-only). Each entry records an on-the-fly decision the executor made
 * under ambiguity, so the review step can focus human attention on the
 * low-confidence blocks.
 *
 * Ported from luca-mastracode `state/confidence-journal.ts`. Changes from the
 * mastracode original:
 *   - `.planning/confidence-journal.jsonl` (a root cross-run log) →
 *     `.luca/phases/<slug>/confidence.jsonl` (a per-phase file, via
 *     `phasePathFor`); `slug` and `cwd` are explicit parameters.
 *   - `getConfidenceSummary` and `renderConfidenceJournalMarkdown` are pure
 *     over a caller-supplied `ConfidenceEntry[]`.
 *   - `renderConfidenceJournalMarkdown` returns the markdown string only — it
 *     no longer writes a file. The `.luca/` phase-dir contract has no
 *     rendered-markdown slot (`CONFIDENCE-JOURNAL.md` was not carried over);
 *     callers render on demand.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { phasePathFor } from '../luca-dir/index.ts'

import {
    ConfidenceEntrySchema,
    type ConfidenceEntry,
    type ConfidenceLevel,
    type ConfidenceSummary,
} from './schemas.ts'

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/** Append a confidence entry to a phase's journal, stamping the timestamp. */
export function appendConfidenceEntry(opts: {
    cwd: string
    slug: string
    entry: Omit<ConfidenceEntry, 'timestamp'>
}): ConfidenceEntry {
    const full: ConfidenceEntry = {
        ...opts.entry,
        timestamp: new Date().toISOString(),
    }
    const p = join(opts.cwd, phasePathFor(opts.slug, 'confidence'))
    mkdirSync(dirname(p), { recursive: true })
    appendFileSync(p, `${JSON.stringify(full)}\n`, 'utf-8')
    return full
}

/**
 * Read all entries from a phase's confidence journal.
 *
 * Parses line-by-line so a single malformed entry does not discard the whole
 * journal; skipped lines are reported via `console.warn`. Returns `[]` when
 * the journal is missing or empty.
 */
export function readConfidenceJournal(opts: {
    cwd: string
    slug: string
}): ConfidenceEntry[] {
    const p = join(opts.cwd, phasePathFor(opts.slug, 'confidence'))
    if (!existsSync(p)) return []

    const content = readFileSync(p, 'utf-8')
    if (!content.trim()) return []

    const entries: ConfidenceEntry[] = []
    const invalidLines: number[] = []

    for (const [index, line] of content.split('\n').entries()) {
        if (!line.trim()) continue
        try {
            const parsed = ConfidenceEntrySchema.safeParse(JSON.parse(line))
            if (parsed.success) {
                entries.push(parsed.data)
            } else {
                invalidLines.push(index + 1)
            }
        } catch {
            invalidLines.push(index + 1)
        }
    }

    if (invalidLines.length > 0) {
        const plural = invalidLines.length === 1
        console.warn(
            `[confidence-journal] skipped ${invalidLines.length} invalid ` +
                `entr${plural ? 'y' : 'ies'} in ${p} ` +
                `at line${plural ? '' : 's'} ${invalidLines.join(', ')}.`
        )
    }

    return entries
}

// ---------------------------------------------------------------------------
// Pure aggregation + rendering
// ---------------------------------------------------------------------------

/** Compute aggregate confidence statistics over a set of entries. */
export function getConfidenceSummary(
    entries: ConfidenceEntry[]
): ConfidenceSummary {
    const categories: Record<string, number> = {}
    let high = 0
    let medium = 0
    let low = 0

    for (const entry of entries) {
        if (entry.confidence === 'high') high++
        else if (entry.confidence === 'medium') medium++
        else low++
        categories[entry.category] = (categories[entry.category] ?? 0) + 1
    }

    return { total: entries.length, high, medium, low, categories }
}

const CONFIDENCE_EMOJI: Record<ConfidenceLevel, string> = {
    high: '🟢',
    medium: '🟡',
    low: '🔴',
}

/**
 * Render a confidence journal into human-readable Markdown — grouped by phase,
 * with a summary table and a low-confidence warning. Pure: returns the string,
 * writes nothing.
 */
export function renderConfidenceJournalMarkdown(
    entries: ConfidenceEntry[]
): string {
    if (entries.length === 0) {
        return '# Confidence Journal\n\nNo entries recorded yet.\n'
    }

    const summary = getConfidenceSummary(entries)

    const lines: string[] = [
        '# Confidence Journal',
        '',
        '## Summary',
        '',
        '| Confidence | Count |',
        '|------------|-------|',
        `| 🟢 High   | ${summary.high} |`,
        `| 🟡 Medium | ${summary.medium} |`,
        `| 🔴 Low    | ${summary.low} |`,
        '',
    ]

    const catParts = Object.entries(summary.categories)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, count]) => `${cat} (${count})`)
    if (catParts.length > 0) {
        lines.push(`**Categories**: ${catParts.join(', ')}`, '')
    }

    if (summary.low > 0) {
        lines.push(
            `⚠️ **${summary.low} low-confidence decision${summary.low > 1 ? 's' : ''} ` +
                `require${summary.low === 1 ? 's' : ''} human review** — ` +
                'see entries marked 🔴 below.',
            ''
        )
    }

    lines.push('---', '')

    const byPhase = new Map<string, ConfidenceEntry[]>()
    for (const entry of entries) {
        const key = entry.phase || 'Unspecified Phase'
        const list = byPhase.get(key)
        if (list) list.push(entry)
        else byPhase.set(key, [entry])
    }

    for (const [phase, phaseEntries] of byPhase) {
        lines.push(`## ${phase}`, '')
        for (const entry of phaseEntries) {
            lines.push(
                `### ${CONFIDENCE_EMOJI[entry.confidence]} Wave ${entry.wave}, ${entry.task}`,
                '',
                `- **Confidence**: ${entry.confidence}`,
                `- **Category**: ${entry.category}`,
                `- **Decision**: ${entry.decision}`
            )
            if (entry.alternatives.length > 0) {
                lines.push(
                    `- **Alternatives**: ${entry.alternatives.join('; ')}`
                )
            }
            lines.push(
                `- **Reasoning**: ${entry.reasoning}`,
                `- **Risk**: ${entry.risk}`
            )
            if (entry.files.length > 0) {
                lines.push(
                    `- **Files**: ${entry.files.map((f) => `\`${f}\``).join(', ')}`
                )
            }
            if (entry.reviewHint) {
                lines.push(`- **Review hint**: ${entry.reviewHint}`)
            }
            lines.push('')
        }
    }

    return lines.join('\n')
}
