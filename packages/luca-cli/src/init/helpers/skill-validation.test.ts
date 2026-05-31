import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

const SKILLS_ROOT = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../skills'
)

// Tokens that indicate stale mastracode references that should NOT appear
// in the new Claude Code-first skills. Each file is checked against this
// list to prevent regressions.
const FORBIDDEN_TOKENS = [
    'workflowState({',
    'workflowState(',
    'writePlanningFile(',
    'manageRoadmap(',
    'manageTodos(',
    'ensureFeatureBranch(',
    'runChecks(',
    'runRules(',
    'verificationResult(',
    'confidenceJournal(',
    'projectPreferences(',
    'prReview(',
    'repoCleanup(',
    'claimVerifier(',
    'sessionLedger(',
    '.planning/', // legacy directory — should use .luca/
    'luca:1-triage',
    'luca:2-research',
    'luca:3-discuss',
    'luca:4-architect',
    'luca:5-review',
    'switch-mode',
    're-enter-pipeline',
]

function hasFrontmatter(content: string): boolean {
    return /^---\n[\s\S]*?\n---\n/.test(content)
}

function hasFrontmatterField(content: string, field: string): boolean {
    const m = content.match(/^---\n([\s\S]*?)\n---\n/)
    if (!m) return false
    const fm = m[1]!
    return new RegExp(`^${field}:\\s+\\S`, 'm').test(fm)
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => join(dir, e.name))
}

/**
 * List every bundled skill's SKILL.md — skills/ holds one directory per
 * skill, each containing a SKILL.md.
 */
async function listSkillFiles(skillsDir: string): Promise<string[]> {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillFile = join(skillsDir, entry.name, 'SKILL.md')
        files.push(skillFile)
    }
    return files
}

describe('bundled skill markdown — structural validation', () => {
    test('commands/ and agents/ exist with at least one .md each', async () => {
        const commands = await listMarkdownFiles(join(SKILLS_ROOT, 'commands'))
        const agents = await listMarkdownFiles(join(SKILLS_ROOT, 'agents'))
        expect(commands.length).toBeGreaterThan(0)
        expect(agents.length).toBeGreaterThan(0)
    })

    test('every command markdown file has frontmatter with name + description', async () => {
        const files = await listMarkdownFiles(join(SKILLS_ROOT, 'commands'))
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            expect(hasFrontmatter(content)).toBe(true)
            expect(hasFrontmatterField(content, 'name')).toBe(true)
            expect(hasFrontmatterField(content, 'description')).toBe(true)
        }
    })

    test('every agent markdown file has frontmatter with name + description', async () => {
        const files = await listMarkdownFiles(join(SKILLS_ROOT, 'agents'))
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            expect(hasFrontmatter(content)).toBe(true)
            expect(hasFrontmatterField(content, 'name')).toBe(true)
            expect(hasFrontmatterField(content, 'description')).toBe(true)
        }
    })

    test('every bundled SKILL.md has frontmatter with name + description', async () => {
        const files = await listSkillFiles(join(SKILLS_ROOT, 'skills'))
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            expect(hasFrontmatter(content)).toBe(true)
            expect(hasFrontmatterField(content, 'name')).toBe(true)
            expect(hasFrontmatterField(content, 'description')).toBe(true)
        }
    })

    test('no bundled skill references stale mastracode tools or paths', async () => {
        const files = [
            ...(await listMarkdownFiles(join(SKILLS_ROOT, 'commands'))),
            ...(await listMarkdownFiles(join(SKILLS_ROOT, 'agents'))),
            ...(await listSkillFiles(join(SKILLS_ROOT, 'skills'))),
        ]
        const violations: Array<{
            file: string
            token: string
        }> = []
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            for (const token of FORBIDDEN_TOKENS) {
                if (content.includes(token)) {
                    violations.push({ file, token })
                }
            }
        }
        if (violations.length > 0) {
            const detail = violations
                .map(
                    (v) =>
                        `${v.file.split('/').slice(-2).join('/')} → "${v.token}"`
                )
                .join('\n')
            throw new Error(
                `Found ${violations.length} stale mastracode reference(s):\n${detail}`
            )
        }
        expect(violations.length).toBe(0)
    })
})
