/**
 * Region-scoped prose tests for correlationId format consistency across the
 * 4 mode files that spawn subagents: execute, architect, research, finalize.
 *
 * Why region-scoped (PR #247 lesson):
 *   A whole-file `toContain('Date.now()')` test would pass even if a spawn
 *   site regressed to `<ts>` placeholder, because the generic boilerplate at
 *   the top of every file mentions `Date.now()` in its own example.
 *
 * We extract the spawn-site region (around the "Subagent Telemetry" heading
 * or first `record-subagent` directive) and assert:
 *   - positive: `Date.now()` or `${ts}` template is present
 *   - negative: NO `<ts>` placeholder
 *   - negative: NO hardcoded 10+ digit epoch number outside of `e.g.` examples
 *   - negative: NO compact-ISO 14-digit timestamp form
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, test, expect } from 'bun:test'

const INSTRUCTIONS_DIR = join(
    new URL('.', import.meta.url).pathname,
    '..',
    'instructions'
)

// Strip `e.g. "..."` example clauses so 10-digit timestamps INSIDE examples
// don't false-positive the negative scan.
function stripExamples(s: string): string {
    return s.replace(/e\.g\.[^.\n]*\d{10,}[^.\n]*[.\n]?/gi, '[example]')
}

function spawnSiteRegion(content: string): string {
    // Take everything from the first "Subagent Telemetry" heading or
    // record-subagent directive to the end of the next subsection.
    const startIdx = (() => {
        const a = content.indexOf('Subagent Telemetry')
        const b = content.indexOf('record-subagent')
        if (a < 0) return b
        if (b < 0) return a
        return Math.min(a, b)
    })()
    if (startIdx < 0) return content
    // Region = next 4000 chars (covers boilerplate + spawn-site directives)
    return content.slice(startIdx, startIdx + 4000)
}

const FILES = ['execute.md', 'architect.md', 'research.md', 'finalize.md']

describe.each(FILES)('correlationId format in %s', (filename) => {
    const raw = readFileSync(join(INSTRUCTIONS_DIR, filename), 'utf8')
    const region = stripExamples(spawnSiteRegion(raw))

    test('positive: spawn-site directive mentions Date.now() or ${ts} template', () => {
        const hasDateNow = /Date\.now\(\)/.test(region)
        const hasTsTemplate = /\$\{ts\}/.test(region)
        expect(hasDateNow || hasTsTemplate).toBe(true)
    })

    test('negative: no bare <ts> placeholder (legacy shape that breaks correlationId regex)', () => {
        // Allow `<ts>` only in passages that explicitly call it out as a
        // forbidden form (the audit prose itself may reference the legacy
        // shape). Strip those callouts before the negative scan.
        const cleaned = region.replace(
            /NOT\s+`?<ts>`?\s+placeholder/gi,
            '[forbidden-callout]'
        )
        expect(cleaned).not.toMatch(/<ts>/)
    })

    test('negative: no hardcoded compact-ISO 14-digit timestamp (e.g. 20260514135050)', () => {
        expect(region).not.toMatch(/\b\d{14}\b/)
    })

    test('negative: no hardcoded 10+ digit epoch timestamp outside example clauses (e.g. 1747100816781)', () => {
        // `stripExamples` (applied to `region` above) already replaces
        // explanatory `e.g. ... <digits> ...` clauses with `[example]` so
        // this assertion catches a hardcoded epoch number that escapes the
        // example context and would silently regress the spawn-site
        // directive away from a live `Date.now()` call.
        expect(region).not.toMatch(/\b\d{10,}\b/)
    })
})
