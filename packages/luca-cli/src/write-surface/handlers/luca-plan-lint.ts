import { readFile } from 'node:fs/promises'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { sanitizeControlChars } from '../helpers/sanitize-control-chars.ts'

const inputSchema = z.object({
    file: z
        .string()
        .min(1)
        .describe(
            'Path to the plan.md file to lint (absolute, or relative to the project root).'
        ),
})

/** A single advisory lint finding (1-based line number + message). */
interface LintFinding {
    line: number
    message: string
}

/** Any criterion bullet — the architect grammar renders them as `- **…`. */
const CRITERION_LINE = /^- \*\*/

/** A well-formed criterion ID prefix: `- **ac-NN**:` / `- **anti-NN**:` (optional `.M`). */
const CRITERION_ID = /^- \*\*((?:ac|anti)-\d+(?:\.\d+)?)\*\*:/

/** An anti-criterion line anywhere in the file. */
const ANTI_CRITERION = /^- \*\*anti-\d+(?:\.\d+)?\*\*:/

/** Compound-criterion connectives (case-insensitive) that suggest a splitting-test review. */
const COMPOUND_CONNECTIVE = /( and | with )/i

/** Absolute quantifiers that demand `.M` sub-criteria enumeration. */
const ABSOLUTE_QUANTIFIER = /\b(all|every|complete)\b/i

/** Any deliverable bullet candidate — the architect grammar renders them as `- **D…`. */
const DELIVERABLE_LINE = /^- \*\*D/

/**
 * A well-formed deliverable line: `- **D<N>**: <text> → <ac-IDs>` where
 * `<ac-IDs>` is a comma-separated list of `ac-NN` / `anti-NN` IDs
 * (optional `.M`). The `.+` before the arrow is greedy so the LAST ` → `
 * on the line separates the text from the ID list.
 */
const DELIVERABLE_GRAMMAR =
    /^- \*\*D\d+\*\*: .+ → ((?:ac|anti)-\d+(?:\.\d+)?(?:\s*,\s*(?:ac|anti)-\d+(?:\.\d+)?)*)\s*$/

/** Extracts each criterion ID from a deliverable line's `<ac-IDs>` tail. */
const REFERENCED_ID = /(?:ac|anti)-\d+(?:\.\d+)?/g

/**
 * Mask the contents of inline backtick code spans with spaces (preserving
 * each span's length) so code-span text never triggers the prose-level
 * compound-connective / absolute-quantifier checks, while line/column
 * positions in any remaining matches stay accurate.
 *
 * @param line - A single plan-file line.
 * @returns The line with every `` `…` `` span's interior blanked out.
 */
function maskInlineCodeSpans(line: string): string {
    return line.replace(
        /`[^`]*`/g,
        (span) => `\`${' '.repeat(span.length - 2)}\``
    )
}

/**
 * Locate a `## <heading>` section as a half-open line-index range
 * `[start, end)` over `lines`. The section starts on the line after the
 * heading and ends at the next `## ` heading (or EOF).
 *
 * @param lines - The plan file split into lines.
 * @param heading - Pattern matching the section's heading line.
 * @returns The section range, or `null` when the heading is absent (the
 *   section's per-line checks are then vacuous).
 */
function findSection(
    lines: string[],
    heading: RegExp
): { start: number; end: number } | null {
    const headingIndex = lines.findIndex((line) => heading.test(line))
    if (headingIndex === -1) return null
    let end = lines.length
    for (let i = headingIndex + 1; i < lines.length; i++) {
        const line = lines[i]
        if (line !== undefined && /^##\s/.test(line)) {
            end = i
            break
        }
    }
    return { start: headingIndex + 1, end }
}

/**
 * Locate the `## Verification Criteria` section (see {@link findSection}).
 *
 * @param lines - The plan file split into lines.
 * @returns The section range, or `null` when the heading is absent (the
 *   per-line checks are then vacuous — only the file-level anti-criteria
 *   check still applies).
 */
function findVerificationCriteriaSection(
    lines: string[]
): { start: number; end: number } | null {
    return findSection(lines, /^##\s+Verification Criteria\b/)
}

/**
 * Locate the `## Deliverables` section (see {@link findSection}).
 *
 * @param lines - The plan file split into lines.
 * @returns The section range, or `null` when the heading is absent (which
 *   itself yields the missing-deliverables-section warning).
 */
function findDeliverablesSection(
    lines: string[]
): { start: number; end: number } | null {
    return findSection(lines, /^##\s+Deliverables\b/)
}

/**
 * Run the seven advisory regex checks over a plan file's lines.
 *
 * Checks (a)–(c) are scoped to the `## Verification Criteria` section;
 * check (d) scans the whole file; checks (e)–(g) cover the
 * `## Deliverables` manifest:
 *
 * a. Criterion bullets (`- **…`) lacking a well-formed
 *    `- **ac-NN**:` / `- **anti-NN**:` ID prefix.
 * b. Compound criteria — criterion lines containing ` and ` / ` with `
 *    (case-insensitive; flagged for splitting-test review).
 * c. Absolute quantifiers (`all` / `every` / `complete`, word-boundary)
 *    on a criterion line with no `.M` sub-criteria. Cheap heuristic: a
 *    base criterion `ac-NN` is exempt only when a sibling `ac-NN.M`
 *    exists in the section; sub-criterion lines (`ac-NN.M`) are skipped
 *    since they are already decomposed leaves.
 *
 * For checks (b) and (c) the contents of inline backtick code spans are
 * masked out first — code text (command names, flags, identifiers) never
 * triggers the prose-level heuristics.
 *
 * d. Zero `- **anti-NN**:` lines in the whole file — missing
 *    anti-criteria (reported against line 1 to keep the output format
 *    uniform).
 *
 * e. No `## Deliverables` section — missing the deliverable manifest
 *    (reported against line 1, like check (d)).
 * f. Deliverable bullets (`- **D…`) not matching the
 *    `- **D<N>**: <text> → <ac-IDs>` grammar.
 * g. Grammar-conforming deliverable lines referencing a criterion ID not
 *    declared in the `## Verification Criteria` section. Tombstoned
 *    (`[DROPPED …]`) and split-parent (`[SPLIT → …]`) lines keep their
 *    `- **ac-NN**:` prefix, so they count as declared — the reference
 *    target just has to exist. Skipped when the Verification Criteria
 *    section itself is absent (nothing to validate against).
 *
 * @param lines - The plan file split into lines.
 * @returns The ordered list of findings (per-line checks first, in line
 *   order per section, then the file-level checks).
 */
function lintPlanLines(lines: string[]): LintFinding[] {
    const findings: LintFinding[] = []
    const section = findVerificationCriteriaSection(lines)

    // Pre-collect every well-formed criterion ID in the Verification
    // Criteria section — the absolute-quantifier check tests for `.M`
    // siblings, and the deliverable-reference check tests for existence.
    const sectionIds = new Set<string>()
    if (section) {
        for (let i = section.start; i < section.end; i++) {
            const id = lines[i]?.match(CRITERION_ID)?.[1]
            if (id) sectionIds.add(id)
        }
    }

    if (section) {
        const hasSubCriteria = (baseId: string): boolean => {
            for (const id of sectionIds) {
                if (id.startsWith(`${baseId}.`)) return true
            }
            return false
        }

        for (let i = section.start; i < section.end; i++) {
            const line = lines[i]
            if (line === undefined || !CRITERION_LINE.test(line)) continue
            const lineno = i + 1
            const id = line.match(CRITERION_ID)?.[1]

            // (a) Missing / malformed criterion ID.
            if (!id) {
                findings.push({
                    line: lineno,
                    message:
                        'criterion line lacks an ID — expected a ' +
                        "'- **ac-NN**:' or '- **anti-NN**:' prefix",
                })
            }

            // Checks (b) and (c) are prose-level — mask inline backtick
            // code spans first so code text never triggers them.
            const prose = maskInlineCodeSpans(line)

            // (b) Compound criterion connectives.
            const connective = prose.match(COMPOUND_CONNECTIVE)?.[1]
            if (connective) {
                findings.push({
                    line: lineno,
                    message:
                        `compound criterion (contains '${connective.trim()}') ` +
                        '— apply the splitting test: if the halves can ' +
                        'pass/fail independently, split into separate criteria',
                })
            }

            // (c) Absolute quantifier without `.M` sub-criteria. Skip
            // sub-criterion lines — they are already decomposed.
            const isSubCriterion = id !== undefined && id.includes('.')
            const quantifier = prose.match(ABSOLUTE_QUANTIFIER)?.[1]
            if (quantifier && !isSubCriterion) {
                const exempt = id !== undefined && hasSubCriteria(id)
                if (!exempt) {
                    findings.push({
                        line: lineno,
                        message:
                            `absolute quantifier '${quantifier}' with no ` +
                            '.M sub-criteria — enumerate sub-criteria ' +
                            '(ac-NN.1, ac-NN.2, …) or scope the claim',
                    })
                }
            }
        }
    }

    const deliverables = findDeliverablesSection(lines)
    if (deliverables) {
        for (let i = deliverables.start; i < deliverables.end; i++) {
            const line = lines[i]
            if (line === undefined || !DELIVERABLE_LINE.test(line)) continue
            const lineno = i + 1

            // Grammar and ID extraction are prose-level — mask inline
            // backtick code spans first so a stray arrow or ID inside
            // code text never skews them.
            const masked = maskInlineCodeSpans(line)

            // (f) Malformed deliverable line.
            const idList = masked.match(DELIVERABLE_GRAMMAR)?.[1]
            if (idList === undefined) {
                findings.push({
                    line: lineno,
                    message:
                        'deliverable line does not match the ' +
                        "'- **D<N>**: <text> → <ac-IDs>' grammar",
                })
                continue
            }

            // (g) References to undeclared criterion IDs. Vacuous when
            // the Verification Criteria section is absent.
            if (!section) continue
            for (const refId of idList.match(REFERENCED_ID) ?? []) {
                if (!sectionIds.has(refId)) {
                    findings.push({
                        line: lineno,
                        message:
                            `deliverable references unknown criterion '${refId}' ` +
                            '— not declared in the ## Verification ' +
                            'Criteria section',
                    })
                }
            }
        }
    }

    // (d) Whole-file anti-criteria presence.
    const hasAntiCriteria = lines.some((line) => ANTI_CRITERION.test(line))
    if (!hasAntiCriteria) {
        findings.push({
            line: 1,
            message:
                'no anti-criteria found — expected at least one ' +
                "'- **anti-NN**:' line (what must NOT happen)",
        })
    }

    // (e) Whole-file deliverable-manifest presence.
    if (!deliverables) {
        findings.push({
            line: 1,
            message:
                "no '## Deliverables' section found — expected a " +
                "manifest of '- **D<N>**: <text> → <ac-IDs>' lines " +
                'tracing every explicit ask to its criteria',
        })
    }

    return findings
}

/**
 * Warn-only advisory linter for phase plan files (`luca plan lint`).
 *
 * Runs seven cheap regex checks keyed to the pinned architect criterion
 * and deliverable grammars (see {@link lintPlanLines}) and emits one
 * warning line per finding (`plan lint: <file>:<lineno>: <message>`) plus a summary line.
 * Findings NEVER fail the invocation — the result is non-error regardless
 * of warning count, so the linter can run anywhere in the pipeline
 * without blocking progression. Only an unreadable `--file` path is an
 * error (an operational failure, not a lint finding).
 *
 * Judgment checks deliberately stay OUT of this linter and live
 * instruction-side in the architect / plan-reviewer prompts: probe
 * nameability ("can you name the command that proves this criterion?")
 * and criterion independence ("can A pass while B fails?") require
 * reasoning, not regex.
 */
export const lucaPlanLintTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_plan_lint',
    description:
        'Warn-only advisory linter for a phase plan.md: flags criterion lines without ac-NN/anti-NN IDs, compound criteria (and/with), absolute quantifiers (all/every/complete) lacking .M sub-criteria, missing anti-criteria, a missing ## Deliverables section, malformed deliverable lines (- **D<N>**: <text> → <ac-IDs>), and deliverable references to undeclared criterion IDs. Lint findings never block — only an unreadable file is an error. Phase-agnostic.',
    inputSchema,
    async handler(args, ctx) {
        // Echoed in every output line — sanitize control characters so a
        // hostile path cannot inject newlines or ANSI escape sequences.
        const safeFile = sanitizeControlChars(args.file)
        let raw: string
        try {
            raw = await readFile(args.file, 'utf-8')
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_plan_lint: could not read '${safeFile}' — ${sanitizeControlChars(
                            err instanceof Error ? err.message : String(err)
                        )}`,
                    },
                ],
                isError: true,
            }
        }
        void ctx

        const findings = lintPlanLines(raw.split('\n'))
        const warningLines = findings.map(
            (f) => `plan lint: ${safeFile}:${f.line}: ${f.message}`
        )
        const noun = findings.length === 1 ? 'warning' : 'warnings'
        const summary = `plan lint: ${safeFile}: ${findings.length} ${noun} (advisory — never blocking)`

        return {
            content: [
                {
                    type: 'text',
                    text: [...warningLines, summary].join('\n'),
                },
            ],
        }
    },
}
