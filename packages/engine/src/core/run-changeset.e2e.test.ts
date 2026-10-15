import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { GitAdapter } from '../git/git-adapter'
import {
    createPracticeRepo,
    git,
    happyTurns,
    latestStuck,
    PRACTICE_SPEC_NUMBER,
    practiceTracker,
    SUM,
} from '../testing/practice-repo'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2 for the changeset writer (#461): in a repo with
 * `.changeset/config.json`, the engine commits one changeset to the run
 * branch before it opens the PR. It names the workspace packages the run
 * changed (minus the config's `ignore`), with the bump from the spec's
 * `release:*` label (patch with none), and the spec's title and link as its
 * summary.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-changeset-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const SPEC_URL = `https://github.com/acme/app/issues/${PRACTICE_SPEC_NUMBER}`

const changesetConfig = ({ ignore }: { ignore: string[] }): string =>
    JSON.stringify(
        {
            $schema: 'https://unpkg.com/@changesets/config@3.0.0/schema.json',
            changelog: '@changesets/cli/changelog',
            commit: false,
            fixed: [],
            linked: [],
            access: 'restricted',
            baseBranch: 'main',
            updateInternalDependencies: 'patch',
            ignore,
        },
        null,
        4
    )

/**
 * A repo with two workspace packages, `@practice/math` and `@practice/text`.
 * Bun installs workspace packages offline; auto-install and the install
 * cache are off, so nothing reaches the network or leaves the repo.
 */
const WORKSPACE_FILES: Record<string, string> = {
    'package.json': JSON.stringify(
        { name: 'practice', private: true, workspaces: ['packages/*'] },
        null,
        4
    ),
    'bunfig.toml':
        '[install]\nauto = "disable"\n\n[install.cache]\ndisable = true\n',
    'packages/math/package.json': JSON.stringify(
        { name: '@practice/math', version: '1.0.0', main: 'index.ts' },
        null,
        4
    ),
    'packages/math/index.ts':
        'export const add = (a: number, b: number): number => a + b\n',
    'packages/text/package.json': JSON.stringify(
        { name: '@practice/text', version: '1.0.0', main: 'index.ts' },
        null,
        4
    ),
    'packages/text/index.ts':
        'export const shout = (text: string): string => text.toUpperCase()\n',
}

/** The two workspace packages, with changesets set up (nothing ignored). */
const CHANGESET_FILES: Record<string, string> = {
    ...WORKSPACE_FILES,
    '.changeset/config.json': changesetConfig({ ignore: [] }),
    '.changeset/README.md': '# Changesets\n\nOne file per change.\n',
}

const MATH_CHANGE =
    'export const add = (a: number, b: number): number => a + b\n\nexport const double = (n: number): number => add(n, n)\n'

const TEXT_CHANGE =
    'export const shout = (text: string): string => text.toUpperCase()\n\nexport const whisper = (text: string): string => text.toLowerCase()\n'

/** Ticket #11's turns, with the implementer also changing these files. */
const turnsChanging = (files: Record<string, string>) => {
    const { testWriter, implementer, reviewer } = happyTurns()
    return [
        testWriter,
        {
            ...implementer,
            files: {
                'src/sum.ts': SUM,
                'src/index.ts': "export { sum } from './sum'\n",
                ...files,
            },
        },
        reviewer,
    ]
}

/** The practice tracker, with the spec carrying these labels too. */
const trackerWithSpecLabels = ({
    labels,
}: {
    labels: string[]
}): InMemoryTracker => {
    const tracker = practiceTracker()
    tracker.updateIssue({
        number: PRACTICE_SPEC_NUMBER,
        changes: { labels: ['ready-for-agent', ...labels] },
    })
    return tracker
}

/** The changeset files (not the README) under `.changeset/` at `ref`. */
const changesetsAt = async ({
    cwd,
    ref,
}: {
    cwd: string
    ref: string
}): Promise<string[]> =>
    (await git(cwd, 'ls-tree', '-r', '--name-only', ref, '--', '.changeset/'))
        .split('\n')
        .filter(
            (path) => path.endsWith('.md') && basename(path) !== 'README.md'
        )

type Changeset = {
    releases: Record<string, string>
    summary: string
}

/** Reads a changeset's front matter (package: bump) and its summary. */
const parseChangeset = ({ text }: { text: string }): Changeset => {
    const match = /^---\r?\n([\s\S]*?)^---\r?\n?([\s\S]*)$/m.exec(text)
    if (match === null || !text.startsWith('---')) {
        throw new Error(`Not a changeset:\n${text}`)
    }
    const releases: Record<string, string> = {}
    for (const line of (match[1] ?? '').split('\n')) {
        if (line.trim() === '') continue
        const release = /^\s*["']?([^"':]+?)["']?\s*:\s*(\w+)\s*$/.exec(line)
        if (release === null) throw new Error(`Not a release line: ${line}`)
        releases[release[1] ?? ''] = release[2] ?? ''
    }
    return { releases, summary: (match[2] ?? '').trim() }
}

/**
 * The one PR's head branch in origin, and every changeset on it, parsed.
 */
const prChangesets = async ({
    origin,
    tracker,
}: {
    origin: string
    tracker: InMemoryTracker
}): Promise<{ head: string; changesets: Changeset[] }> => {
    const pulls = tracker.pullRequests()
    expect(pulls).toHaveLength(1)
    const head = pulls[0]?.head ?? ''
    const paths = await changesetsAt({ cwd: origin, ref: head })
    const changesets = await Promise.all(
        paths.map(async (path) =>
            parseChangeset({
                text: await git(origin, 'show', `${head}:${path}`),
            })
        )
    )
    return { head, changesets }
}

/** Runs ticket #11 on a practice repo made from `files`, to its PR. */
const runToPr = async ({
    files,
    changed,
    labels = [],
    under = root,
}: {
    files: Record<string, string>
    /** Files the implementer changes besides `src/`. */
    changed: Record<string, string>
    /** The spec's labels besides `ready-for-agent`. */
    labels?: string[]
    /** The folder to make the practice repo in. Defaults to `root`. */
    under?: string
}) => {
    await mkdir(under, { recursive: true })
    const practice = await createPracticeRepo({ root: under, files })
    const ran = await practice.run({
        turns: turnsChanging(changed),
        tracker: trackerWithSpecLabels({ labels }),
    })
    expect(ran.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    return { ...ran, practice }
}

describe('the changeset on a run PR, end to end', () => {
    test('the PR branch has one changeset naming only the package the run changed, as a patch with no release label', async () => {
        const { tracker, practice } = await runToPr({
            files: CHANGESET_FILES,
            changed: { 'packages/math/index.ts': MATH_CHANGE },
        })

        const { changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets).toHaveLength(1)
        expect(changesets[0]?.releases).toEqual({ '@practice/math': 'patch' })
    }, 90_000)

    test("the changeset's summary is the spec's title with a link to the spec", async () => {
        const { tracker, practice } = await runToPr({
            files: CHANGESET_FILES,
            changed: { 'packages/math/index.ts': MATH_CHANGE },
        })

        const { changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets).toHaveLength(1)
        expect(changesets[0]?.summary).toContain('Practice spec')
        expect(changesets[0]?.summary).toContain(SPEC_URL)
    }, 90_000)

    test('the changeset is committed on the run branch, past main, and main keeps none', async () => {
        const { tracker, practice } = await runToPr({
            files: CHANGESET_FILES,
            changed: { 'packages/math/index.ts': MATH_CHANGE },
        })

        const { head } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(
            await changesetsAt({ cwd: practice.origin, ref: 'main' })
        ).toEqual([])
        const added = (
            await git(
                practice.origin,
                'diff',
                '--name-only',
                '--diff-filter=A',
                `main..${head}`,
                '--',
                '.changeset/'
            )
        )
            .split('\n')
            .filter((path) => path !== '')
        expect(added).toHaveLength(1)
        expect(added[0]).toMatch(/^\.changeset\/[^/]+\.md$/)
    }, 90_000)

    test('a spec labeled release:minor gets a minor bump', async () => {
        const { tracker, practice } = await runToPr({
            files: CHANGESET_FILES,
            changed: { 'packages/math/index.ts': MATH_CHANGE },
            labels: ['release:minor'],
        })

        const { changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/math': 'minor' },
        ])
    }, 90_000)

    test('a spec labeled release:major names both changed packages with a major bump', async () => {
        const { tracker, practice } = await runToPr({
            files: CHANGESET_FILES,
            changed: {
                'packages/math/index.ts': MATH_CHANGE,
                'packages/text/index.ts': TEXT_CHANGE,
            },
            labels: ['release:major'],
        })

        const { changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/math': 'major', '@practice/text': 'major' },
        ])
    }, 90_000)

    test('a spec labeled release:patch gets a patch bump', async () => {
        const { tracker, practice } = await runToPr({
            files: CHANGESET_FILES,
            changed: { 'packages/text/index.ts': TEXT_CHANGE },
            labels: ['release:patch'],
        })

        const { changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/text': 'patch' },
        ])
    }, 90_000)

    test('a spec labeled release:none gets a PR branch with no new changeset file and no changeset commit', async () => {
        const { tracker, practice, records } = await runToPr({
            files: CHANGESET_FILES,
            changed: { 'packages/math/index.ts': MATH_CHANGE },
            labels: ['release:none'],
        })

        const { head, changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets).toEqual([])
        const added = (
            await git(
                practice.origin,
                'diff',
                '--name-only',
                '--diff-filter=A',
                `main..${head}`,
                '--',
                '.changeset/'
            )
        )
            .split('\n')
            .filter((path) => path !== '')
        expect(added).toEqual([])
        const subjects = (
            await git(practice.origin, 'log', '--format=%s', `main..${head}`)
        )
            .split('\n')
            .filter((subject) => subject !== '')
        expect(subjects).toEqual([
            'feat: build #11 Add sum',
            'test: add failing tests for #11 Add sum',
        ])
        const written = records.filter(
            (record) => record.kind === 'changeset_written'
        )
        expect(written).toHaveLength(1)
        expect(written[0]).toMatchObject({
            content: { path: null, bump: 'none', packages: [] },
        })
    }, 90_000)

    test('packages the changesets config ignores are left out of the changeset', async () => {
        const { tracker, practice } = await runToPr({
            files: {
                ...CHANGESET_FILES,
                '.changeset/config.json': changesetConfig({
                    ignore: ['@practice/text'],
                }),
            },
            changed: {
                'packages/math/index.ts': MATH_CHANGE,
                'packages/text/index.ts': TEXT_CHANGE,
            },
        })

        const { changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/math': 'patch' },
        ])
    }, 90_000)

    test('of the same run on two repos, only the one with a changesets config gets a changeset', async () => {
        const run = {
            changed: { 'packages/math/index.ts': MATH_CHANGE },
            labels: ['release:minor'],
        }
        const withConfig = await runToPr({
            ...run,
            files: CHANGESET_FILES,
            under: join(root, 'with-config'),
        })
        const { tracker, practice } = await runToPr({
            ...run,
            files: WORKSPACE_FILES,
            under: join(root, 'without-config'),
        })

        // With the config: one changeset.
        const configured = await prChangesets({
            origin: withConfig.practice.origin,
            tracker: withConfig.tracker,
        })
        expect(configured.changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/math': 'minor' },
        ])

        // Without it: no `.changeset/` folder, and no commit past the ticket's.
        const head = tracker.pullRequests()[0]?.head ?? ''
        expect(
            await git(
                practice.origin,
                'ls-tree',
                '-r',
                '--name-only',
                head,
                '--',
                '.changeset/'
            )
        ).toBe('')
        const subjects = (
            await git(practice.origin, 'log', '--format=%s', `main..${head}`)
        )
            .split('\n')
            .filter((subject) => subject !== '')
        expect(subjects).toEqual([
            'feat: build #11 Add sum',
            'test: add failing tests for #11 Add sum',
        ])
    }, 90_000)
})

describe("an agent's own changeset (#507)", () => {
    test("is dropped and journaled, the ticket isn't stuck, and the PR holds only the engine's changeset", async () => {
        const agent_changeset = '.changeset/add-double.md'
        const { tracker, practice, records } = await runToPr({
            files: CHANGESET_FILES,
            changed: {
                'packages/math/index.ts': MATH_CHANGE,
                [agent_changeset]:
                    '---\n"@practice/math": minor\n---\n\nAdd double\n',
            },
        })

        expect(latestStuck(records)).toBeNull()
        const dropped = records.filter(
            (record) => record.kind === 'changeset_dropped'
        )
        expect(dropped.map((record) => record.ticket)).toContain(11)
        expect(
            dropped.flatMap((record) =>
                record.kind === 'changeset_dropped' ? record.content.paths : []
            )
        ).toContain(agent_changeset)
        const { head, changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/math': 'patch' },
        ])
        expect(
            await changesetsAt({ cwd: practice.origin, ref: head })
        ).not.toContain(agent_changeset)
    }, 90_000)
})

describe('the changeset after a crash', () => {
    test('a run restarted after the changeset was committed does not write a second one', async () => {
        const practice = await createPracticeRepo({
            root,
            files: CHANGESET_FILES,
        })
        const tracker = trackerWithSpecLabels({ labels: ['release:minor'] })

        // The engine dies at the first push of a run branch that already
        // holds a changeset: after the changeset step, before the PR.
        let crashed = false
        const crashAtPush = (real: GitAdapter): GitAdapter => ({
            ...real,
            push: async (args) => {
                const holds = await changesetsAt({
                    cwd: practice.repo,
                    ref: args.branch,
                })
                if (!crashed && holds.length > 0) {
                    crashed = true
                    throw new Error('The engine crashed.')
                }
                return real.push(args)
            },
        })
        await expect(
            practice.run({
                turns: turnsChanging({ 'packages/math/index.ts': MATH_CHANGE }),
                tracker,
                git: crashAtPush,
            })
        ).rejects.toThrow('The engine crashed.')
        expect(crashed).toBe(true)

        const { action } = await practice.run({ resume: true, tracker })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const { head, changesets } = await prChangesets({
            origin: practice.origin,
            tracker,
        })
        expect(changesets.map(({ releases }) => releases)).toEqual([
            { '@practice/math': 'minor' },
        ])
        const changesetCommits = (
            await git(
                practice.origin,
                'log',
                '--format=%H',
                `main..${head}`,
                '--',
                '.changeset/'
            )
        )
            .split('\n')
            .filter((sha) => sha !== '')
        expect(changesetCommits).toHaveLength(1)
    }, 120_000)
})
