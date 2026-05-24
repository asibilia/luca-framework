/**
 * PLAN.md checkbox auto-ticking — closes the executor self-attestation gap.
 *
 * The pipeline's executor stage commits work but does NOT mark `- [ ]`
 * tasks as `- [x]` in `plan.md`. That left the planning artifact
 * perpetually out-of-sync with reality: even after a phase passed
 * verification + review and the work shipped, `plan.md` still claimed
 * everything was unstarted.
 *
 * Rather than ask the executor to tick its own boxes (low integrity — the
 * executor is the *claimant*, not the verifier), we tick boxes from
 * `luca state advance` AFTER the diff guard and verification guard have
 * already passed. By that point the phase is independently attested.
 *
 * Only then does this module flip checkboxes for the matching phase section
 * in `plan.md`. The result: `plan.md` becomes a faithful audit trail, and
 * any unchecked task remaining post-completion is a meaningful signal
 * (either a heading mismatch or a deliberately deferred task).
 *
 * Behaviour is **advisory**: any failure (missing file, no matching heading,
 * write error) is reported in the return value but never throws and never
 * blocks `luca state advance`. The caller logs the outcome to the session
 * ledger so a downstream reviewer can see whether ticking succeeded.
 *
 * Ported from luca-mastracode `util/plan-checkboxes.ts` (CF1 close, per
 * parity-review §CF1). NOTE: this helper is pure (no CLI surface, no
 * filesystem-walking beyond the supplied path) and could be promoted to
 * `@alecsibilia/luca-core` if a second caller needs it. Tracking that as
 * a v14 carry-forward (parallels CF11 for `parseAdvanceCommand`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Outcome of a `tickPhaseTasks` call. Always returned — never throws.
 *
 * - `success: true, tickedCount > 0`  — happy path; N boxes flipped.
 * - `success: true, tickedCount === 0` — section found but already
 *   complete (or genuinely had no checkbox lines). Advisory note in
 *   `reason`.
 * - `success: false`                   — couldn't tick. `reason`
 *   explains (file missing, heading not found, write failure). Caller
 *   decides whether to surface as a warning.
 */
export interface TickResult {
    success: boolean
    /** Count of `- [ ]` → `- [x]` flips actually written. */
    tickedCount: number
    /** Already-completed boxes within the section (for diagnostics). */
    alreadyTickedCount: number
    /** Plan file path that was inspected. */
    planFile: string
    /** Phase heading text used to scope the search. */
    phaseName: string
    /** Human-readable reason — populated on failure or no-op. */
    reason?: string
    /** Line numbers (1-indexed) of the boxes that were ticked. */
    tickedLines: number[]
}

/**
 * Match an `## Phase N: ...` or `### Phase N: ...` style heading whose
 * text (after the `Phase N:` prefix) equals `phaseName`. Also matches a
 * bare `## phaseName` heading for cases where the executor names a
 * phase directly. Comparison is case-insensitive and tolerates trailing
 * whitespace.
 */
function isPhaseHeading(line: string, phaseName: string): boolean {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!m || !m[2]) return false
    const headingText = m[2].trim()
    const target = phaseName.trim().toLowerCase()
    if (!target) return false

    // Exact heading text match (case-insensitive)
    if (headingText.toLowerCase() === target) return true

    // "Phase N: <name>" → strip prefix and compare
    const prefixed = /^Phase\s+\d+(?:\.\d+)*\s*[:\-—]\s*(.+)$/i.exec(
        headingText
    )
    if (prefixed && prefixed[1] && prefixed[1].trim().toLowerCase() === target)
        return true

    // Symmetric case where currentPhaseName already includes "Phase N:" prefix
    if (headingText.toLowerCase() === `phase ${target}`) return true

    return false
}

/**
 * Return the heading depth (number of `#` chars) for a markdown heading
 * line, or `0` if the line is not a heading.
 */
function headingDepth(line: string): number {
    const m = /^(#{1,6})\s+\S/.exec(line)
    return m && m[1] ? m[1].length : 0
}

/**
 * Tick all unchecked `- [ ]` task boxes under the section whose heading
 * matches `phaseName`. The section ends at the next heading of equal or
 * shallower depth, or end-of-file.
 *
 * Always synchronous; never throws. See `TickResult` for outcome shape.
 *
 * @param planFile  Repo-relative or absolute path to plan.md.
 * @param phaseName Phase name to match. Compared case-insensitively
 *                  against heading text, with `Phase N:` prefix stripping.
 */
export function tickPhaseTasks(
    planFile: string,
    phaseName: string
): TickResult {
    const base: Omit<TickResult, 'success' | 'reason'> = {
        tickedCount: 0,
        alreadyTickedCount: 0,
        planFile,
        phaseName,
        tickedLines: [],
    }

    if (!planFile) {
        return {
            ...base,
            success: false,
            reason: 'planFile path is empty',
        }
    }
    if (!phaseName) {
        return {
            ...base,
            success: false,
            reason: 'phaseName is empty',
        }
    }
    if (!existsSync(planFile)) {
        return {
            ...base,
            success: false,
            reason: `plan.md not found at ${planFile}`,
        }
    }

    let raw: string
    try {
        raw = readFileSync(planFile, 'utf8')
    } catch (err) {
        return {
            ...base,
            success: false,
            reason: `failed to read ${planFile}: ${(err as Error).message}`,
        }
    }

    // Preserve original line endings: split on `\n`, remember whether
    // the file had a trailing newline so we don't accidentally add/strip
    // one.
    const hadTrailingNewline = raw.endsWith('\n')
    const lines = raw.split('\n')
    if (hadTrailingNewline) {
        // `split` leaves a trailing empty string when the input ends in
        // '\n'.
        lines.pop()
    }

    // Locate the matching phase heading.
    let sectionStart = -1
    let sectionDepth = 0
    for (let i = 0; i < lines.length; i++) {
        const candidate = lines[i] ?? ''
        if (isPhaseHeading(candidate, phaseName)) {
            sectionStart = i + 1 // first line *inside* the section
            sectionDepth = headingDepth(candidate)
            break
        }
    }

    if (sectionStart === -1) {
        return {
            ...base,
            success: false,
            reason: `no heading matching phase "${phaseName}" found in ${planFile}`,
        }
    }

    // Determine section end: next heading at depth <= sectionDepth.
    let sectionEnd = lines.length
    for (let i = sectionStart; i < lines.length; i++) {
        const d = headingDepth(lines[i] ?? '')
        if (d > 0 && d <= sectionDepth) {
            sectionEnd = i
            break
        }
    }

    // Tick `- [ ]` checkboxes within [sectionStart, sectionEnd).
    const uncheckedRe = /^(\s*[-*]\s+)\[ \](\s)/
    const checkedRe = /^(\s*[-*]\s+)\[[xX]\](\s)/
    const tickedLines: number[] = []
    let alreadyTicked = 0

    for (let i = sectionStart; i < sectionEnd; i++) {
        const line = lines[i] ?? ''
        if (uncheckedRe.test(line)) {
            lines[i] = line.replace(uncheckedRe, '$1[x]$2')
            tickedLines.push(i + 1) // 1-indexed for human consumption
        } else if (checkedRe.test(line)) {
            alreadyTicked++
        }
    }

    if (tickedLines.length === 0) {
        return {
            ...base,
            success: true,
            alreadyTickedCount: alreadyTicked,
            reason:
                alreadyTicked > 0
                    ? `all ${alreadyTicked} checkbox(es) in phase "${phaseName}" already ticked`
                    : `no '- [ ]' checkboxes found under phase "${phaseName}"`,
        }
    }

    // Reassemble file content; preserve trailing newline state.
    const out = lines.join('\n') + (hadTrailingNewline ? '\n' : '')

    try {
        writeFileSync(planFile, out, 'utf8')
    } catch (err) {
        return {
            ...base,
            success: false,
            reason: `failed to write ${planFile}: ${(err as Error).message}`,
        }
    }

    return {
        ...base,
        success: true,
        tickedCount: tickedLines.length,
        alreadyTickedCount: alreadyTicked,
        tickedLines,
    }
}
