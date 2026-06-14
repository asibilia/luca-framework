import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import { existsSync, readFileSync } from 'node:fs'

function findUmbrellaDistClaude(): string {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 20; i += 1) {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
                    name?: string
                }
                if (pkg.name === '@alecsibilia/luca') {
                    return join(dir, 'dist', 'claude')
                }
            } catch {
                // ignore
            }
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 20; i += 1) {
        const candidate = join(dir, 'packages', 'luca', 'package.json')
        if (existsSync(candidate)) {
            try {
                const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as {
                    name?: string
                }
                if (pkg.name === '@alecsibilia/luca') {
                    return join(dir, 'packages', 'luca', 'dist', 'claude')
                }
            } catch {
                // ignore
            }
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    throw new Error('Could not find @alecsibilia/luca package root')
}

const distClaude = findUmbrellaDistClaude()
const COMMANDS_DIR = join(distClaude, '.claude', 'commands')
const AGENTS_DIR = join(distClaude, '.claude', 'agents')
const SKILLS_DIR = join(distClaude, 'skills')

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
        const commands = await listMarkdownFiles(COMMANDS_DIR)
        const agents = await listMarkdownFiles(AGENTS_DIR)
        expect(commands.length).toBeGreaterThan(0)
        expect(agents.length).toBeGreaterThan(0)
    })

    test('every command markdown file has frontmatter with name + description', async () => {
        const files = await listMarkdownFiles(COMMANDS_DIR)
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            expect(hasFrontmatter(content)).toBe(true)
            expect(hasFrontmatterField(content, 'name')).toBe(true)
            expect(hasFrontmatterField(content, 'description')).toBe(true)
        }
    })

    test('every agent markdown file has frontmatter with name + description', async () => {
        const files = await listMarkdownFiles(AGENTS_DIR)
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            expect(hasFrontmatter(content)).toBe(true)
            expect(hasFrontmatterField(content, 'name')).toBe(true)
            expect(hasFrontmatterField(content, 'description')).toBe(true)
        }
    })

    test('every bundled SKILL.md has frontmatter with name + description', async () => {
        const files = await listSkillFiles(SKILLS_DIR)
        for (const file of files) {
            const content = await readFile(file, 'utf-8')
            expect(hasFrontmatter(content)).toBe(true)
            expect(hasFrontmatterField(content, 'name')).toBe(true)
            expect(hasFrontmatterField(content, 'description')).toBe(true)
        }
    })

    test('no bundled skill references stale mastracode tools or paths', async () => {
        const files = [
            ...(await listMarkdownFiles(COMMANDS_DIR)),
            ...(await listMarkdownFiles(AGENTS_DIR)),
            ...(await listSkillFiles(SKILLS_DIR)),
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
