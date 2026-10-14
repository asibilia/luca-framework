import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { commitIn, type BuildContext } from './execute-build'

import type { AgentLauncher } from '../agents/agent-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import {
    JournalRecordSchema,
    type CommitStage,
    type JournalRecord,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { git } from '../testing/practice-repo'
import type { Tracker } from '../tracker/tracker'

/**
 * The engine's commit step, on a real git repo: nothing left to commit
 * never runs a failing `git commit` (#494), an untracked link pointing
 * outside the checkout is never committed (#496), and the leftover scan
 * doesn't flag an agent's changeset, framework files loaded by name, or
 * files the repo names (#507).
 */

let root = ''
let repo = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-commit-in-'))
    repo = join(root, 'repo')
    await mkdir(join(repo, 'src'), { recursive: true })
    await git(repo, 'init', '-q', '-b', 'main')
    await git(repo, 'config', 'user.email', 'luca@example.com')
    await git(repo, 'config', 'user.name', 'Luca')
    await Bun.write(join(repo, 'src', 'index.ts'), 'export {}\n')
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'first')
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/**
 * A build step's context on `repo`, with a state noting `prepare_made`, and
 * whether the repo had a changesets config when the run branch was made.
 */
const contextWith = ({
    prepare_made,
    changesets = false,
    config = {},
}: {
    prepare_made: string[]
    changesets?: boolean
    /** The repo's `.luca/config.json`, before defaults. */
    config?: object
}): BuildContext => ({
    git: createGitAdapter({ repo_root: repo }),
    launcher: {} as AgentLauncher,
    journal: createJournal({ file: join(root, 'run-1', 'journal.jsonl') }),
    tracker: {} as Tracker,
    state: { ...replayRun({ records: [] }), prepare_made, changesets },
    config: EngineConfigSchema.parse(config),
    run_dir: join(root, 'run-1'),
    step: { run_id: 'run-1', first_seq: 1, redo: false },
})

const commit = ({
    context,
    stage,
}: {
    context: BuildContext
    stage: CommitStage
}) =>
    commitIn({
        context,
        cwd: repo,
        ticket: 11,
        stage,
        message: `${stage}: #11`,
        mention_text: '',
    })

const byKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

describe('commitIn with nothing to commit (#494)', () => {
    test.each(['green', 'fix', 'red'] as const)(
        'a %s stage whose only change came from prepare journals the current commit with no files, and makes no commit',
        async (stage) => {
            await Bun.write(join(repo, 'build-stamp.txt'), 'built\n')
            const context = contextWith({ prepare_made: ['build-stamp.txt'] })
            const head = (await git(repo, 'rev-parse', 'HEAD')).trim()

            await commit({ context, stage })

            const records = context.journal.read()
            expect(byKind(records, 'leftover_scan')[0]?.content).toEqual({
                stage,
                hits: [],
            })
            expect(byKind(records, 'commit_made')[0]?.content).toEqual({
                stage,
                sha: head,
                message: `${stage}: #11`,
                files: [],
            })
            expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
            // Prepare's file stays in the worktree, untracked.
            expect(
                await git(repo, 'ls-files', '--others', '--exclude-standard')
            ).toContain('build-stamp.txt')
        }
    )
})

describe('commitIn with a link pointing outside the checkout (#496)', () => {
    test('leaves the link out, notes it once, and commits the rest', async () => {
        const vendor = join(root, 'vendor-tools')
        await mkdir(vendor)
        await mkdir(join(repo, 'tools'))
        await symlink(vendor, join(repo, 'tools', 'bin'))
        // A link inside the checkout is a file like any other.
        await symlink('index.ts', join(repo, 'src', 'main.ts'))
        await Bun.write(
            join(repo, 'src', 'index.ts'),
            "export { main } from './main'\n"
        )
        // A journal from before `prepare_made` existed notes nothing.
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(
            byKind(records, 'prepare_made').map(({ content }) => content)
        ).toEqual([{ paths: ['tools/bin'], outside_links: true }])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'src/index.ts',
            'src/main.ts',
        ])
        expect(
            await git(repo, 'ls-files', '--others', '--exclude-standard')
        ).toBe('tools/bin\n')
    })
})

/** Writes these files into `repo` and commits them on main. */
const commitFiles = async (files: Record<string, string>) => {
    await writeFiles(files)
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'more files')
}

/** Writes these files into `repo`, as an agent leaves them. */
const writeFiles = async (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
        await Bun.write(join(repo, path), content)
    }
}

/** The paths the latest leftover scan flagged, each once, sorted. */
const hitPaths = (records: JournalRecord[]): string[] =>
    [
        ...new Set(
            (byKind(records, 'leftover_scan').at(-1)?.content.hits ?? []).map(
                ({ path }) => path
            )
        ),
    ].sort()

const CHANGESET_CONFIG = JSON.stringify(
    { changelog: '@changesets/cli/changelog', commit: false, ignore: [] },
    null,
    4
)

/** A repo with changesets set up: its config, README, and pre-release file. */
const CHANGESET_FILES: Record<string, string> = {
    '.changeset/config.json': CHANGESET_CONFIG,
    '.changeset/README.md': '# Changesets\n\nOne file per change.\n',
    '.changeset/pre.json': JSON.stringify(
        { mode: 'pre', tag: 'alpha', initialVersions: {}, changesets: [] },
        null,
        4
    ),
}

/** The agent's own changeset, as the Turbo run's implementer wrote one. */
const AGENT_CHANGESET = '.changeset/turbo-core-and-empty-card.md'

/** A used module: `src/sum.ts`, exported from `src/index.ts`. */
const SUM_CHANGE: Record<string, string> = {
    'src/sum.ts':
        'export const sum = (a: number, b: number): number => a + b\n',
    'src/index.ts': "export { sum } from './sum'\n",
}

describe("commitIn with an agent's changeset (#507)", () => {
    test('drops a new changeset from the worktree, journals it, and commits the rest with no leftover hit', async () => {
        await commitFiles(CHANGESET_FILES)
        await writeFiles({
            ...SUM_CHANGE,
            [AGENT_CHANGESET]: '---\n"app": patch\n---\n\nAdd sum\n',
        })
        const context = contextWith({ prepare_made: [], changesets: true })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(
            byKind(records, 'changeset_dropped').map(({ content }) => content)
        ).toEqual([expect.objectContaining({ paths: [AGENT_CHANGESET] })])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'src/index.ts',
            'src/sum.ts',
        ])
        expect(existsSync(join(repo, AGENT_CHANGESET))).toBe(false)
        expect(await git(repo, 'status', '--porcelain')).toBe('')
    })

    test("drops a new changeset at the final review's fix commit too", async () => {
        await commitFiles(CHANGESET_FILES)
        await writeFiles({
            ...SUM_CHANGE,
            '.changeset/final-review-fixes.md':
                '---\n"app": patch\n---\n\nFix the review findings\n',
        })
        const context = contextWith({ prepare_made: [], changesets: true })

        await commitIn({
            context,
            cwd: repo,
            ticket: null,
            stage: 'fix',
            message: 'fix: final review round 1 for spec #10',
            mention_text: '',
        })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(
            byKind(records, 'changeset_dropped').flatMap(
                ({ content }) => content.paths
            )
        ).toEqual(['.changeset/final-review-fixes.md'])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'src/index.ts',
            'src/sum.ts',
        ])
        expect(existsSync(join(repo, '.changeset/final-review-fixes.md'))).toBe(
            false
        )
    })

    test('drops only the new changeset: edits to the changesets config, pre.json, and README are left alone and committed', async () => {
        await commitFiles(CHANGESET_FILES)
        await writeFiles({
            '.changeset/config.json': CHANGESET_CONFIG.replace(
                '"ignore": []',
                '"ignore": ["docs"]'
            ),
            '.changeset/pre.json': JSON.stringify(
                {
                    mode: 'pre',
                    tag: 'beta',
                    initialVersions: {},
                    changesets: [],
                },
                null,
                4
            ),
            '.changeset/README.md':
                '# Changesets\n\nOne file per change. The engine writes them.\n',
            [AGENT_CHANGESET]: '---\n"app": patch\n---\n\nAdd sum\n',
        })
        const context = contextWith({ prepare_made: [], changesets: true })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(
            byKind(records, 'changeset_dropped').flatMap(
                ({ content }) => content.paths
            )
        ).toEqual([AGENT_CHANGESET])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            '.changeset/README.md',
            '.changeset/config.json',
            '.changeset/pre.json',
        ])
        expect(await git(repo, 'show', 'HEAD:.changeset/pre.json')).toContain(
            '"beta"'
        )
    })
})

/** A React Router web package, as the Turbo site had. */
const WEB_PACKAGE: Record<string, string> = {
    'packages/web/package.json': JSON.stringify(
        {
            name: 'web',
            private: true,
            scripts: { dev: 'react-router dev', build: 'react-router build' },
        },
        null,
        4
    ),
}

const VITE_CONFIG = `import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [reactRouter()] })
`

const ENTRY_SERVER = `export default function handleRequest(): Response {
    return new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html' },
    })
}
`

describe('commitIn with framework files loaded by name (#507)', () => {
    test('vite.config.ts and app/entry.server.tsx in a web package are not flagged as unused, and are committed', async () => {
        await commitFiles(WEB_PACKAGE)
        await writeFiles({
            'packages/web/vite.config.ts': VITE_CONFIG,
            'packages/web/app/entry.server.tsx': ENTRY_SERVER,
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'packages/web/app/entry.server.tsx',
            'packages/web/vite.config.ts',
        ])
    })
})

/** A World of Warcraft addon whose TOC lists its files, as Turbo's did. */
const ADDON: Record<string, string> = {
    'Turbo/Turbo.toc':
        '## Interface: 110002\n## Title: Turbo\n\ncore\\init.lua\n',
    'Turbo/core/init.lua': 'local _, Turbo = ...\nTurbo.version = 1\n',
}

describe('commitIn with a file the repo names (#507)', () => {
    test('core/debug.lua listed in the TOC is not a scratch file, and is committed', async () => {
        await commitFiles(ADDON)
        await writeFiles({
            'Turbo/Turbo.toc':
                '## Interface: 110002\n## Title: Turbo\n\ncore\\init.lua\ncore\\debug.lua\n',
            'Turbo/core/debug.lua':
                'local _, Turbo = ...\nTurbo.debugMode = false\n',
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'Turbo/Turbo.toc',
            'Turbo/core/debug.lua',
        ])
    })

    test('a new TOC added in the same change clears the new core/debug.lua it lists, and both are committed', async () => {
        await writeFiles({
            'Turbo/Turbo.toc':
                '## Interface: 110002\n## Title: Turbo\n\ncore\\debug.lua\n',
            'Turbo/core/debug.lua':
                'local _, Turbo = ...\nTurbo.debugMode = false\n',
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'Turbo/Turbo.toc',
            'Turbo/core/debug.lua',
        ])
    })

    test('a new package.json added in the same change clears the new tools/notes.ts its script runs, and both are committed', async () => {
        await writeFiles({
            'package.json': JSON.stringify(
                {
                    name: 'app',
                    private: true,
                    scripts: { 'release-notes': 'bun tools/notes.ts' },
                },
                null,
                4
            ),
            'tools/notes.ts': "process.stdout.write('What changed\\n')\n",
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'package.json',
            'tools/notes.ts',
        ])
    })

    test('tools/notes.ts named in a package.json script is not flagged as unused or as scratch', async () => {
        await commitFiles({
            'package.json': JSON.stringify(
                { name: 'app', private: true, scripts: {} },
                null,
                4
            ),
        })
        await writeFiles({
            'package.json': JSON.stringify(
                {
                    name: 'app',
                    private: true,
                    scripts: { 'release-notes': 'bun tools/notes.ts' },
                },
                null,
                4
            ),
            'tools/notes.ts': "process.stdout.write('What changed\\n')\n",
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'package.json',
            'tools/notes.ts',
        ])
    })
})

describe('commitIn still catches real leftovers (#507)', () => {
    test('a stray notes.md, an unused scratch.ts, and a tmp.ts named only by a test are flagged beside accepted framework files, and nothing is committed', async () => {
        await commitFiles({
            ...WEB_PACKAGE,
            // Only a test names tmp.ts: that doesn't make it the repo's.
            'src/paths.test.ts':
                "import { expect, test } from 'bun:test'\n\ntest('names a file', () => {\n    expect('tmp.ts').toContain('.ts')\n})\n",
        })
        const head = (await git(repo, 'rev-parse', 'HEAD')).trim()
        await writeFiles({
            'packages/web/vite.config.ts': VITE_CONFIG,
            'packages/web/app/entry.server.tsx': ENTRY_SERVER,
            'notes.md': '# Notes\n\n- try the other layout\n',
            'src/scratch.ts': 'export const tryIt = (): number => 42\n',
            'src/tmp.ts': 'export const tryThat = (): number => 7\n',
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(hitPaths(records)).toEqual([
            'notes.md',
            'src/scratch.ts',
            'src/tmp.ts',
        ])
        expect(byKind(records, 'commit_made')).toEqual([])
        expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
    })
})

/** What the latest leftover scan let through, as `{ path, reason }`, sorted. */
const passedOf = (records: JournalRecord[]) =>
    (byKind(records, 'leftover_scan').at(-1)?.content.passed ?? [])
        .map(({ path, reason }) => ({ path, reason }))
        .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

const ADR = `# 1. Docs pass the leftover scan

## Status

Accepted
`

describe('commitIn with docs the repo asks for (#520)', () => {
    test('a ticket commit with an ADR and a README passes the scan, journals both as doc places, and commits them', async () => {
        await writeFiles({
            ...SUM_CHANGE,
            'docs/adr/0001-docs-pass.md': ADR,
            'packages/app/README.md': '# App\n\nAdds numbers.\n',
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(passedOf(records)).toEqual([
            { path: 'docs/adr/0001-docs-pass.md', reason: 'doc_place' },
            { path: 'packages/app/README.md', reason: 'doc_place' },
        ])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'docs/adr/0001-docs-pass.md',
            'packages/app/README.md',
            'src/index.ts',
            'src/sum.ts',
        ])
    })

    test('a new .md that a tracked README names passes, and is journaled as named by the repo', async () => {
        await commitFiles({
            'README.md': '# App\n\nSee [setup](guides/setup.md) first.\n',
        })
        await writeFiles({ 'guides/setup.md': '# Setup\n\nRun `bun i`.\n' })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(passedOf(records)).toEqual([
            { path: 'guides/setup.md', reason: 'named_by_repo' },
        ])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'guides/setup.md',
        ])
    })

    test('a new .md that a newly added non-test file names passes, but one only a test names is still flagged', async () => {
        await writeFiles({
            'handbook/SUMMARY.md':
                '# Summary\n\n- [Setup](setup.md)\n- [Deploy](deploy.md)\n',
            'handbook/setup.md': '# Setup\n',
            'handbook/deploy.md': '# Deploy\n',
            'handbook/release.md': '# Release\n',
            'src/handbook.test.ts':
                "import { expect, test } from 'bun:test'\n\ntest('names release.md', () => {\n    expect('release.md').toContain('.md')\n})\n",
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        // Nothing names SUMMARY.md itself, and only a test names release.md.
        expect(hitPaths(records)).toEqual([
            'handbook/SUMMARY.md',
            'handbook/release.md',
        ])
        expect(passedOf(records)).toEqual([
            { path: 'handbook/deploy.md', reason: 'named_by_repo' },
            { path: 'handbook/setup.md', reason: 'named_by_repo' },
        ])
        expect(byKind(records, 'commit_made')).toEqual([])
    })

    test("a new .md matching the config's leftover_allow passes, and is journaled as a config pattern", async () => {
        await writeFiles({ 'handbook/ops/runbook.md': '# Runbook\n' })
        const context = contextWith({
            prepare_made: [],
            config: { leftover_allow: ['handbook/**/*.md'] },
        })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(passedOf(records)).toEqual([
            { path: 'handbook/ops/runbook.md', reason: 'config_pattern' },
        ])
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'handbook/ops/runbook.md',
        ])
    })

    test('a stray NOTES.md and plan.md next to code are still flagged with today’s reasons beside a passing README, and nothing is committed', async () => {
        const head = (await git(repo, 'rev-parse', 'HEAD')).trim()
        await writeFiles({
            ...SUM_CHANGE,
            'src/README.md': '# Source\n',
            'src/NOTES.md': '# Notes\n\n- try the other layout\n',
            'src/plan.md': '# Plan\n\n1. Write sum\n',
        })
        const context = contextWith({ prepare_made: [] })

        await commit({ context, stage: 'green' })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual([
            { path: 'src/NOTES.md', reason: 'a scratch file' },
            {
                path: 'src/plan.md',
                reason: 'a new markdown file the spec and ticket do not name',
            },
        ])
        expect(passedOf(records)).toEqual([
            { path: 'src/README.md', reason: 'doc_place' },
        ])
        expect(byKind(records, 'commit_made')).toEqual([])
        expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
    })
})

describe('the leftover_scan record and old journals (#520)', () => {
    const scanRecord = (content: object) => ({
        kind: 'leftover_scan',
        ticket: 11,
        role: null,
        seq: 1,
        time: '2026-10-14T12:00:00.000Z',
        content,
    })

    test('a scan record keeps what it let through, and one from an old journal without it still parses and replays', () => {
        const passed = [
            { path: 'docs/adr/0001-docs-pass.md', reason: 'doc_place' },
            { path: 'guides/setup.md', reason: 'named_by_repo' },
            { path: 'handbook/intro.md', reason: 'config_pattern' },
        ]
        const fresh = JournalRecordSchema.parse(
            scanRecord({ stage: 'green', hits: [], passed })
        )
        const old = JournalRecordSchema.parse(
            scanRecord({ stage: 'green', hits: [] })
        )

        expect(
            fresh.kind === 'leftover_scan' &&
                (fresh.content.passed ?? []).map(({ path, reason }) => ({
                    path,
                    reason,
                }))
        ).toEqual(passed)
        expect(old.content).toEqual({ stage: 'green', hits: [] })
        expect(() =>
            replayRun({ records: [old, { ...fresh, seq: 2 }] })
        ).not.toThrow()
    })
})
