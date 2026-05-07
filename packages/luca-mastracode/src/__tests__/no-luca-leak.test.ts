import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

/**
 * Phase C — G-DX-LEAK-001 regression test.
 *
 * Asserts that luca-framework-specific PR/release/commit prose does NOT
 * leak into rules, skills, or instruction files that ship to consumer
 * projects. Three anchored patterns:
 *
 *   1. Literal scope-list with pipes
 *      `\b(framework|mastracode|studio|config|docs|repo)\b`
 *      — only matches Scopes: enumeration prose, not bare path refs.
 *
 *   2. Title example with luca-framework version + issue
 *      `feat\(mastracode\):\s*v\d+\.\d+\.\d+\s*#\d+`
 *
 *   3. Bump-rule prose `feat → minor … fix → patch` (single-line form,
 *      back-tick fenced).
 *
 * Allowlist: __tests__/, fixtures/, CHANGELOG.md.
 */

const PKG_ROOT = join(__dirname, '..', '..')
const SCAN_ROOTS = ['rules', 'skills', 'src/instructions']
const ALLOWLIST = [/__tests__\//, /fixtures\//, /CHANGELOG\.md$/]

const PATTERN_SCOPE_LIST = /\b(framework\|mastracode\|studio\|config\|docs\|repo)\b/
const PATTERN_TITLE_EXAMPLE = /feat\(mastracode\):\s*v\d+\.\d+\.\d+\s*#\d+/
const PATTERN_BUMP_PROSE =
    /\bfeat\b\s*(?:→|-->)?\s*\bminor\b.*\bfix\b\s*(?:→|-->)?\s*\bpatch\b/i

function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
            yield* walk(full)
        } else if (st.isFile() && full.endsWith('.md')) {
            yield full
        }
    }
}

function isAllowed(path: string): boolean {
    return ALLOWLIST.some((rx) => rx.test(path))
}

describe('no luca-framework conventions leak into rules/skills/instructions', () => {
    for (const root of SCAN_ROOTS) {
        const absRoot = join(PKG_ROOT, root)
        let files: string[]
        try {
            files = Array.from(walk(absRoot))
        } catch {
            // Directory may not exist in some installs; skip silently.
            continue
        }

        for (const file of files) {
            if (isAllowed(file)) continue
            const rel = file.slice(PKG_ROOT.length + 1)

            test(`${rel} contains no luca-framework PR/release/commit leaks`, () => {
                const body = readFileSync(file, 'utf8')
                expect(
                    PATTERN_SCOPE_LIST.test(body),
                    `${rel}: literal scope-list 'framework|mastracode|...' found — replace with consult-section(pr) reference`,
                ).toBe(false)
                expect(
                    PATTERN_TITLE_EXAMPLE.test(body),
                    `${rel}: hardcoded title example 'feat(mastracode): vX.Y.Z #N' found — render via pr.titleTemplate instead`,
                ).toBe(false)
                expect(
                    PATTERN_BUMP_PROSE.test(body),
                    `${rel}: hardcoded bump prose 'feat → minor … fix → patch' found — read from release.versionBump instead`,
                ).toBe(false)
            })
        }
    }
})
