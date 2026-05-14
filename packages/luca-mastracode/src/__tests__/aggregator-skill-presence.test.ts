/**
 * Smoke tests for the `luca-telemetry-report` aggregator skill. The skill is
 * human-invoked (no execution test); these checks verify only that the assets
 * are present and minimally well-formed.
 *
 * Asserts:
 *   1. SKILL.md present at packages/luca-mastracode/skills/luca-telemetry-report/
 *   2. Frontmatter parses (--- markers present)
 *   3. Forbidden-tools fence present (HTML-comment sentinel)
 *   4. Command shim at packages/luca-mastracode/commands/luca-telemetry-report.md
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, test, expect } from 'bun:test'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')
const SKILL_PATH = join(PKG_ROOT, 'skills', 'luca-telemetry-report', 'SKILL.md')
const CMD_PATH = join(PKG_ROOT, 'commands', 'luca-telemetry-report.md')

describe('luca-telemetry-report skill presence', () => {
    test('SKILL.md exists', () => {
        expect(existsSync(SKILL_PATH)).toBe(true)
    })

    test('SKILL.md frontmatter parses (--- markers present)', () => {
        const content = readFileSync(SKILL_PATH, 'utf8')
        // YAML frontmatter starts with --- on line 1 and has a closing ---.
        const lines = content.split('\n')
        expect(lines[0]).toBe('---')
        const closingIdx = lines.slice(1).indexOf('---')
        expect(closingIdx).toBeGreaterThan(0)
    })

    test('SKILL.md contains forbidden-tools fence (HTML-comment sentinel)', () => {
        const content = readFileSync(SKILL_PATH, 'utf8')
        expect(content).toContain('<!-- forbidden-tools-list-start -->')
        expect(content).toContain('<!-- forbidden-tools-list-end -->')
    })

    test('command shim at commands/luca-telemetry-report.md exists with $ARGUMENTS token', () => {
        expect(existsSync(CMD_PATH)).toBe(true)
        const content = readFileSync(CMD_PATH, 'utf8')
        expect(content).toContain('$ARGUMENTS')
    })
})
