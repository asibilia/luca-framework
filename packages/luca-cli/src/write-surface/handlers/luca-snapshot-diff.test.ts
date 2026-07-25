import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    buildWorktreeSnapshotTree,
    lucaSnapshotCreateTool,
    REVIEW_PREFIX_TREE_RELPATH,
} from './luca-snapshot-create.ts'
import { lucaSnapshotDiffTool, parseAuditCitePaths } from './luca-snapshot-diff.ts'

async function runGit(cwd: string, args: string[]): Promise<string> {
    const proc = Bun.spawn(['git', ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const code = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    if (code !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
    }
    return stdout
}

async function initRepoWithCommit(cwd: string): Promise<void> {
    await runGit(cwd, ['init', '-q', '-b', 'main'])
    await runGit(cwd, ['config', 'user.email', 'test@example.com'])
    await runGit(cwd, ['config', 'user.name', 'Test'])
    await writeFile(join(cwd, 'tracked.txt'), 'v1\n')
    await runGit(cwd, ['add', 'tracked.txt'])
    await runGit(cwd, ['commit', '-q', '-m', 'init'])
}

async function writeActivePhaseState(cwd: string): Promise<void> {
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'execute',
            currentPhase: 1,
            roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
        })
    )
}

const AUDITS_RELDIR = '.luca/phases/01-auth-rewrite/audits'

async function writeAudit(
    cwd: string,
    reviewer: string,
    content: string
): Promise<void> {
    await mkdir(join(cwd, AUDITS_RELDIR), { recursive: true })
    await writeFile(join(cwd, AUDITS_RELDIR, `${reviewer}.md`), content)
}

async function snapshot(cwd: string): Promise<void> {
    const r = await lucaSnapshotCreateTool.handler({}, { cwd })
    if (r.isError) {
        throw new Error(`snapshot create failed: ${(r.content[0] as { text: string }).text}`)
    }
}

interface DiffOutput {
    verdict: string
    prior_tree: string | null
    changed_paths: string[]
    cite_paths: string[]
    reason: string
}

async function runDiff(cwd: string): Promise<DiffOutput> {
    const r = await lucaSnapshotDiffTool.handler({}, { cwd })
    expect(r.isError).toBeFalsy()
    return JSON.parse((r.content[0] as { text: string }).text) as DiffOutput
}

function expectPayloadConsumed(cwd: string): void {
    expect(existsSync(join(cwd, REVIEW_PREFIX_TREE_RELPATH))).toBe(false)
}

const CITED_AUDIT = `PERSPECTIVE: architecture
VERDICT: REQUEST_CHANGES
FINDINGS:
- [MUST-FIX] broken thing
  File: src/broken.ts:12
  Suggestion: fix it
  Cross-phase: false
- [SHOULD-FIX] naming nit
  File: tracked.txt:1
  Suggestion: rename
  Cross-phase: false
- [NOTE] future debt to track

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 1
  CROSS_PHASE_COUNT: 0
`

describe('luca_snapshot_diff', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-snapshot-diff-'))
        await initRepoWithCommit(cwd)
        await writeActivePhaseState(cwd)
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('verdict empty: nothing changed since the snapshot', async () => {
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('empty')
        expect(out.changed_paths).toEqual([])
        expectPayloadConsumed(cwd)
    })

    test('verdict empty: a changed .luca/ file is excluded from the changed set', async () => {
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)
        // Post-snapshot .luca/ change — must be excluded in code.
        await writeFile(join(cwd, '.luca/scratch-note.md'), 'post-snapshot\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('empty')
        expect(out.changed_paths).toEqual([])
        expectPayloadConsumed(cwd)
    })

    test('verdict zero-overlap: changed paths avoid all cited paths', async () => {
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)
        await writeFile(join(cwd, 'unrelated.ts'), 'export {}\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('zero-overlap')
        expect(out.changed_paths).toEqual(['unrelated.ts'])
        expect(out.cite_paths).toEqual(['src/broken.ts', 'tracked.txt'])
        // prior_tree carries the consumed payload's snapshot tree sha so
        // skip notes can cite it.
        expect(out.prior_tree).toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
        expectPayloadConsumed(cwd)
    })

    test('verdict overlap: renamed+modified cited file still intersects via its old path (--no-renames)', async () => {
        // tracked.txt is cited by the SHOULD-FIX finding in CITED_AUDIT.
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)
        // Rename the cited file (identical content → exact rename, which
        // default-on rename detection would collapse to the NEW path only,
        // hiding the cited old path from the intersection).
        await rm(join(cwd, 'tracked.txt'))
        await writeFile(join(cwd, 'renamed.txt'), 'v1\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('overlap')
        expect(out.changed_paths).toContain('tracked.txt')
        expect(out.changed_paths).toContain('renamed.txt')
        expectPayloadConsumed(cwd)
    })

    test('non-ASCII changed path is emitted literally (core.quotepath=false)', async () => {
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)
        await writeFile(join(cwd, 'ä.ts'), 'export {}\n')

        const out = await runDiff(cwd)

        expect(out.changed_paths).toHaveLength(1)
        const changed = out.changed_paths[0] ?? ''
        // With core.quotepath left on, git emits "\303\244.ts" (quoted,
        // octal-escaped) which could never string-match a literal cite.
        expect(changed.startsWith('"')).toBe(false)
        // NFC-normalize: macOS filesystems may store the name decomposed.
        expect(changed.normalize('NFC')).toBe('ä.ts')
        expect(out.verdict).toBe('zero-overlap')
        expectPayloadConsumed(cwd)
    })

    test('verdict overlap: a SHOULD-FIX cite intersects the changed set', async () => {
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)
        // tracked.txt is cited by the SHOULD-FIX finding — proves
        // SHOULD-FIX cites are collected alongside MUST-FIX.
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('overlap')
        expect(out.changed_paths).toContain('tracked.txt')
        expect(out.cite_paths).toContain('tracked.txt')
        expectPayloadConsumed(cwd)
    })

    test('verdict overlap: untracked new file (live no-commit path) intersects a MUST-FIX cite', async () => {
        await writeAudit(
            cwd,
            'security-auditor',
            '- [MUST-FIX] injection\n  File: src/broken.ts:12\n  Suggestion: sanitize\n  Cross-phase: false\n'
        )
        await snapshot(cwd)
        await mkdir(join(cwd, 'src'), { recursive: true })
        await writeFile(join(cwd, 'src/broken.ts'), 'export {}\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('overlap')
        expect(out.changed_paths).toContain('src/broken.ts')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: empty cite set with a non-empty changed set (no vacuous skip)', async () => {
        // Audit exists but carries zero MUST-FIX/SHOULD-FIX cites.
        await writeAudit(
            cwd,
            'code-architect',
            'PERSPECTIVE: architecture\nVERDICT: APPROVE\nFINDINGS:\n- [NOTE] all good\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.changed_paths).toEqual(['tracked.txt'])
        expect(out.cite_paths).toEqual([])
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: no audits directory at all with a non-empty changed set', async () => {
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: audit cite parse failure', async () => {
        await writeAudit(
            cwd,
            'code-architect',
            '- [MUST-FIX] broken\n  File: no-line-number-here\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('cite')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: absolute-path cite can never match repo-relative changed paths', async () => {
        await writeAudit(
            cwd,
            'code-architect',
            '- [MUST-FIX] broken\n  File: /abs/src/broken.ts:12\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('repo-relative')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: ./-prefixed cite can never match repo-relative changed paths', async () => {
        await writeAudit(
            cwd,
            'code-architect',
            '- [MUST-FIX] broken\n  File: ./src/broken.ts:12\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('repo-relative')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: line:col-style cite (path:line:col) fails parsing', async () => {
        await writeAudit(
            cwd,
            'code-architect',
            '- [MUST-FIX] broken\n  File: src/a.ts:12:5\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('cite')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: multi-path prose cite fails parsing', async () => {
        await writeAudit(
            cwd,
            'code-architect',
            '- [MUST-FIX] broken\n  File: src/a.ts:12 and src/b.ts:30\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('cite')
        expectPayloadConsumed(cwd)
    })

    test('fail-safe ambiguous: MUST-FIX finding with no File: cite (location unknown)', async () => {
        await writeAudit(
            cwd,
            'code-architect',
            '- [MUST-FIX] vague problem, somewhere\n  Suggestion: fix it\n'
        )
        await snapshot(cwd)
        await writeFile(join(cwd, 'tracked.txt'), 'v2\n')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('without a "File:" cite')
        expectPayloadConsumed(cwd)
    })

    test('ambiguous: payload phase does not match the active phase', async () => {
        const built = await buildWorktreeSnapshotTree(cwd)
        if (!built.ok) throw new Error(built.error)
        await mkdir(join(cwd, '.luca/tmp'), { recursive: true })
        await writeFile(
            join(cwd, REVIEW_PREFIX_TREE_RELPATH),
            JSON.stringify({ tree: built.tree, phase: '02-other-phase' })
        )

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('02-other-phase')
        expectPayloadConsumed(cwd)
    })

    test('ambiguous: payload file is missing', async () => {
        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('missing')
        expect(out.prior_tree).toBeNull()
        expectPayloadConsumed(cwd)
    })

    test('ambiguous: payload is unparsable JSON — and still consumed', async () => {
        await mkdir(join(cwd, '.luca/tmp'), { recursive: true })
        await writeFile(join(cwd, REVIEW_PREFIX_TREE_RELPATH), 'not json {{{')

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expectPayloadConsumed(cwd)
    })

    test('ambiguous: payload tree does not resolve to a git tree — and still consumed', async () => {
        await mkdir(join(cwd, '.luca/tmp'), { recursive: true })
        await writeFile(
            join(cwd, REVIEW_PREFIX_TREE_RELPATH),
            JSON.stringify({
                tree: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
                phase: '01-auth-rewrite',
            })
        )

        const out = await runDiff(cwd)

        expect(out.verdict).toBe('ambiguous')
        expect(out.reason).toContain('tree')
        expectPayloadConsumed(cwd)
    })

    test('leaves the real index and worktree untouched', async () => {
        await writeAudit(cwd, 'code-architect', CITED_AUDIT)
        await snapshot(cwd)

        // Mixed dirty state: staged change, unstaged change, untracked file.
        await writeFile(join(cwd, 'staged.txt'), 'staged\n')
        await runGit(cwd, ['add', 'staged.txt'])
        await writeFile(join(cwd, 'tracked.txt'), 'v2-unstaged\n')
        await writeFile(join(cwd, 'untracked.txt'), 'loose\n')

        const before = await runGit(cwd, ['status', '--porcelain'])

        const out = await runDiff(cwd)
        expect(out.verdict).toBe('overlap')

        const after = await runGit(cwd, ['status', '--porcelain'])
        // The consumed payload is itself a .luca/ path — filter those so
        // the assertion targets pre-existing index/worktree state only.
        const filterLuca = (s: string) =>
            s
                .split('\n')
                .filter((line) => !line.includes('.luca/'))
                .join('\n')
        expect(filterLuca(after)).toBe(filterLuca(before))
        expectPayloadConsumed(cwd)
    })

    test('has no allowedPhases declared', () => {
        expect(lucaSnapshotDiffTool.allowedPhases).toBeUndefined()
    })
})

describe('parseAuditCitePaths', () => {
    test('collects cites from MUST-FIX and SHOULD-FIX, skips NOTE', () => {
        const r = parseAuditCitePaths(CITED_AUDIT)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.paths).toEqual(['src/broken.ts', 'tracked.txt'])
    })

    test('fails on a cite without a line number', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: src/a.ts\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a File line before any finding bullet', () => {
        const r = parseAuditCitePaths('File: src/a.ts:3\n- [MUST-FIX] x\n')
        expect(r.ok).toBe(false)
    })

    test('fails on an unknown severity tag', () => {
        const r = parseAuditCitePaths('- [BLOCKER] x\n  File: src/a.ts:3\n')
        expect(r.ok).toBe(false)
    })

    test('strips only the trailing :line from a deep path', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: src/dir/deep/file.test.ts:104\n')
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.paths).toEqual(['src/dir/deep/file.test.ts'])
    })

    test('fails on an absolute-path cite', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: /Users/dev/repo/src/a.ts:3\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a ./-prefixed cite', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: ./src/a.ts:3\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a ../-traversing cite', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: ../other/src/a.ts:3\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a backslashed cite', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: src\\dir\\a.ts:3\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a Windows-drive cite', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: C:\\dir\\a.ts:3\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a line:col-style cite (embedded colon in path portion)', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: src/a.ts:12:5\n')
        expect(r.ok).toBe(false)
    })

    test('fails on a multi-path prose cite (embedded whitespace)', () => {
        const r = parseAuditCitePaths(
            '- [MUST-FIX] x\n  File: src/a.ts:12 and src/b.ts:30\n'
        )
        expect(r.ok).toBe(false)
    })

    test('positive anchor: plain repo-relative path:line still parses', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] x\n  File: src/a.ts:12\n')
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.paths).toEqual(['src/a.ts'])
    })

    test('fails on a MUST-FIX finding with no File: cite', () => {
        const r = parseAuditCitePaths('- [MUST-FIX] vague\n  Suggestion: fix\n')
        expect(r.ok).toBe(false)
    })

    test('fails on an uncited SHOULD-FIX followed by another finding', () => {
        const r = parseAuditCitePaths(
            '- [SHOULD-FIX] vague\n- [MUST-FIX] cited\n  File: src/a.ts:3\n'
        )
        expect(r.ok).toBe(false)
    })

    test('a NOTE finding without a File: cite still parses', () => {
        const r = parseAuditCitePaths('- [NOTE] future debt, no location\n')
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.paths).toEqual([])
    })

    test('an audit with headings but zero findings still parses (empty section is fine)', () => {
        const r = parseAuditCitePaths(
            'PERSPECTIVE: architecture\nVERDICT: APPROVE\n\n## MUST-FIX\n\nNone.\n\n## SHOULD-FIX\n\nNone.\n'
        )
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.paths).toEqual([])
    })
})
