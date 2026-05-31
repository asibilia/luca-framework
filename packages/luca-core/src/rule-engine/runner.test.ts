import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { discoverAndRun, loadRules } from './runner.ts'

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-runner-'))
    tmpDirs.push(dir)
    return dir
}

function writeFile(repo: string, rel: string, content: string): void {
    const p = join(repo, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
}

const FOO_RULE = `export default {
    id: 'test/no-foo',
    severity: 'must-fix',
    description: 'flags the literal FOO',
    scope: 'src/**/*.ts',
    category: 'test',
    check: (file) =>
        file.content.includes('FOO')
            ? [{ id: file.path + ':1', path: file.path, line: 1, severity: 'must-fix', summary: 'contains FOO' }]
            : [],
}
`

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('discoverAndRun', () => {
    test('discovers and runs a rule pack, producing findings', async () => {
        const repo = cleanDir()
        writeFile(repo, '.luca/rules/no-foo.ts', FOO_RULE)
        writeFile(repo, 'src/a.ts', 'const x = "FOO"')
        writeFile(repo, 'src/b.ts', 'const y = "bar"')
        const report = await discoverAndRun({ repoRoot: repo })
        expect(report.rulesFilesDiscovered).toBe(1)
        expect(report.rulesLoaded).toBe(1)
        expect(report.findings.length).toBe(1)
        expect(report.findings[0]?.path).toBe('src/a.ts')
        // category defaults from the rule when a finding omits it.
        expect(report.findings[0]?.category).toBe('test')
    })

    test('returns an empty report when there is no rules directory', async () => {
        const report = await discoverAndRun({ repoRoot: cleanDir() })
        expect(report.rulesFilesDiscovered).toBe(0)
        expect(report.rulesLoaded).toBe(0)
        expect(report.findings).toEqual([])
    })

    test('records a load error for a rule file that throws on import', async () => {
        const repo = cleanDir()
        writeFile(repo, '.luca/rules/bad.ts', 'throw new Error("boom on import")')
        const report = await discoverAndRun({ repoRoot: repo })
        expect(report.loadErrors.length).toBe(1)
        expect(report.loadErrors[0]?.message).toContain('boom')
    })

    test('records an execution error when a rule check throws', async () => {
        const repo = cleanDir()
        writeFile(
            repo,
            '.luca/rules/throws.ts',
            `export default {
    id: 'test/throws',
    severity: 'must-fix',
    description: 'always throws',
    scope: 'src/**/*.ts',
    check: () => { throw new Error('check boom') },
}
`
        )
        writeFile(repo, 'src/a.ts', 'const x = 1')
        const report = await discoverAndRun({ repoRoot: repo })
        expect(report.executionErrors.length).toBe(1)
        expect(report.executionErrors[0]?.message).toContain('check boom')
    })
})

describe('loadRules', () => {
    test('skips .test.ts files during discovery', async () => {
        const repo = cleanDir()
        writeFile(repo, '.luca/rules/real.ts', FOO_RULE)
        writeFile(repo, '.luca/rules/real.test.ts', 'export default {}')
        const { filesDiscovered, rules } = await loadRules({
            rulesDir: join(repo, '.luca', 'rules'),
        })
        expect(filesDiscovered).toBe(1)
        expect(rules.length).toBe(1)
    })
})
