/**
 * Confidence Journal — append-only log of execution-time decision confidence.
 *
 * During execution, when an executor encounters ambiguity, makes on-the-fly
 * decisions, or lacks sufficient plan detail, it logs an entry here. The
 * result is a reviewable `.planning/CONFIDENCE-JOURNAL.md` that highlights
 * which blocks need human re-review.
 *
 * Data layer: `.planning/confidence-journal.jsonl` (machine-readable, append-only)
 * Presentation: `.planning/CONFIDENCE-JOURNAL.md` (human-readable, regenerated)
 */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    appendFileSync,
    writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

import { readLucaState } from './luca-store.js'

import { CONFIDENCE_JOURNAL_PATH, phasePath } from '../util/phase-paths.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type ConfidenceCategory =
    | 'plan-gap'
    | 'design-choice'
    | 'convention-unclear'
    | 'requirement-ambiguous'
    | 'dependency-unknown'
    | 'scope-creep'

export interface ConfidenceEntry {
    /** ISO 8601 timestamp */
    timestamp: string
    /** Phase name from PLAN.md / ROADMAP.md */
    phase: string
    /** Wave number within the phase */
    wave: number
    /** Task ID or description from PLAN.md */
    task: string
    /** How confident the executor was in its decision */
    confidence: ConfidenceLevel
    /** What kind of ambiguity was encountered */
    category: ConfidenceCategory
    /** What the executor actually decided to do */
    decision: string
    /** Other options that were considered */
    alternatives: string[]
    /** Why this choice was made over alternatives */
    reasoning: string
    /** What could go wrong if this was the wrong call */
    risk: string
    /** Which files were affected by this decision */
    files: string[]
    /** Suggested focus area for human reviewer */
    reviewHint?: string
}

export interface ConfidenceSummary {
    total: number
    high: number
    medium: number
    low: number
    categories: Record<string, number>
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/** `.planning/confidence-journal.jsonl` — root, append-only (Decision #4). */
function journalPath(): string {
    return CONFIDENCE_JOURNAL_PATH()
}

/**
 * Resolve the per-phase rendered Markdown path.
 *
 * Read at call time so it tracks the live `currentPhaseSlug`. When slug is
 * absent (legacy in-flight runs), `phasePath` falls back to `.planning/` root.
 */
function markdownPath(): string {
    const slug = readLucaState().currentPhaseSlug
    return phasePath('CONFIDENCE-JOURNAL.md', slug)
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Append a confidence entry to the JSONL journal.
 */
export function appendConfidenceEntry(
    entry: Omit<ConfidenceEntry, 'timestamp'>
): ConfidenceEntry {
    const full: ConfidenceEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
    }
    const p = journalPath()
    // CONFIDENCE_JOURNAL_PATH() returns `.planning/confidence-journal.jsonl`
    // but does not create the parent dir. Ensure it here so appendFileSync
    // works on a fresh workspace.
    mkdirSync(dirname(p), { recursive: true })
    appendFileSync(p, JSON.stringify(full) + '\n', 'utf-8')
    return full
}

/**
 * Read all confidence journal entries.
 * Parses line-by-line so a single malformed entry doesn't discard the whole journal.
 */
export function readConfidenceJournal(): ConfidenceEntry[] {
    const p = journalPath()
    if (!existsSync(p)) return []

    const content = readFileSync(p, 'utf-8')
    if (!content.trim()) return []

    const entries: ConfidenceEntry[] = []
    const invalidLines: number[] = []

    for (const [index, line] of content.split('\n').entries()) {
        if (!line.trim()) continue
        try {
            entries.push(JSON.parse(line) as ConfidenceEntry)
        } catch {
            invalidLines.push(index + 1)
        }
    }

    if (invalidLines.length > 0) {
        console.warn(
            `[confidence-journal] Skipped ${invalidLines.length} invalid entr${invalidLines.length === 1 ? 'y' : 'ies'} ` +
                `in ${journalPath()} at line${invalidLines.length === 1 ? '' : 's'} ${invalidLines.join(', ')}.`
        )
    }

    return entries
}

/**
 * Compute aggregate confidence stats.
 */
export function getConfidenceSummary(): ConfidenceSummary {
    const entries = readConfidenceJournal()
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

/**
 * Render the JSONL journal into a human-readable Markdown file.
 * Entries are grouped by phase, with emoji indicators for confidence level.
 */
export function renderConfidenceJournalMarkdown(): string {
    const entries = readConfidenceJournal()
    const summary = getConfidenceSummary()

    if (entries.length === 0) {
        const md = '# Confidence Journal\n\nNo entries recorded yet.\n'
        // markdownPath() routes through phasePath() which ensures the parent
        // dir exists, so no separate ensurePlanningDir() call is required.
        writeFileSync(markdownPath(), md, 'utf-8')
        return md
    }

    const confidenceEmoji: Record<ConfidenceLevel, string> = {
        high: '🟢',
        medium: '🟡',
        low: '🔴',
    }

    // --- Summary section ---
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

    // Category breakdown
    const catParts = Object.entries(summary.categories)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, count]) => `${cat} (${count})`)
    if (catParts.length > 0) {
        lines.push(`**Categories**: ${catParts.join(', ')}`)
        lines.push('')
    }

    // Low-confidence warning
    if (summary.low > 0) {
        lines.push(
            `⚠️ **${summary.low} low-confidence decision${summary.low > 1 ? 's' : ''} require${summary.low === 1 ? 's' : ''} human review** — see entries marked 🔴 below.`
        )
        lines.push('')
    }

    lines.push('---')
    lines.push('')

    // --- Entries grouped by phase ---
    const byPhase = new Map<string, ConfidenceEntry[]>()
    for (const entry of entries) {
        const key = entry.phase || 'Unspecified Phase'
        const list = byPhase.get(key)
        if (list) {
            list.push(entry)
        } else {
            byPhase.set(key, [entry])
        }
    }

    for (const [phase, phaseEntries] of byPhase) {
        lines.push(`## ${phase}`)
        lines.push('')

        for (const entry of phaseEntries) {
            const emoji = confidenceEmoji[entry.confidence]
            lines.push(`### ${emoji} Wave ${entry.wave}, ${entry.task}`)
            lines.push('')
            lines.push(`- **Confidence**: ${entry.confidence}`)
            lines.push(`- **Category**: ${entry.category}`)
            lines.push(`- **Decision**: ${entry.decision}`)

            if (entry.alternatives.length > 0) {
                lines.push(
                    `- **Alternatives**: ${entry.alternatives.join('; ')}`
                )
            }

            lines.push(`- **Reasoning**: ${entry.reasoning}`)
            lines.push(`- **Risk**: ${entry.risk}`)

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

    const md = lines.join('\n')
    // markdownPath() routes through phasePath() which ensures the parent
    // dir exists, so no separate ensurePlanningDir() call is required.
    writeFileSync(markdownPath(), md, 'utf-8')
    return md
}
