import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { LOCKED_PICK } from '../jev/model-pick'
import { readStory } from '../story/story-schema'
import {
    APPROVE,
    happyTurns,
    IMPLEMENTER_RESULT,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'
import {
    gitDiff,
    lineCounts,
    recordsOf,
    runFolder,
    runShas,
    sectionOf,
    shareStoryRun,
    storyAnswer,
    storyPrompt,
    storyWriterCalls,
    storyWriterTurn,
    tagsAfterPullRequest,
    type StoryRun,
} from '../testing/story-run-fixtures'

/**
 * The story step, end to end (#743): a run that opens its pull request
 * starts a story-writer, fills in what the engine knows, checks the story
 * with `readStory`, writes it to `story.json`, and saves it through the
 * tracker. Its prompt holds the pull request, the changed files, the
 * capped diff and the rule files. Scripted agents, the in-memory tracker,
 * a real practice repo; no GitHub, no models.
 */

/** The one story the in-memory tracker saved. */
const savedStory = (run: StoryRun) => {
    const [saved] = run.tracker.savedStories()
    if (saved === undefined) throw new Error('No story was saved.')
    return saved.story
}

const openedOf = (run: StoryRun) => {
    const opened = run.records.find(
        (record) => record.kind === 'pull_request_opened'
    )
    if (opened?.kind !== 'pull_request_opened') throw new Error('No PR.')
    return opened.content
}

describe('a run that opens its pull request writes and saves its story', () => {
    // The diff adds the test file, modifies src/index.ts, deletes docs/old.md.
    // No agent journals an assumption and no finding is left open (#745).
    const happy = shareStoryRun({
        files: { 'docs/old.md': 'Old notes.\nMore old notes.\n' },
        build: (practice) =>
            practice.run({
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        files: {
                            'src/sum.test.ts': SUM_TEST.replace(
                                "from './sum'",
                                "from './index'"
                            ),
                        },
                        result: { ...TEST_WRITER_RESULT, assumptions: [] },
                    },
                    {
                        role: 'implementer',
                        ticket: 11,
                        files: { 'src/index.ts': SUM },
                        act: async (cwd) => {
                            await rm(join(cwd, 'docs', 'old.md'))
                        },
                        result: IMPLEMENTER_RESULT,
                    },
                    { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
                    storyWriterTurn({
                        ...storyAnswer(),
                        notes: 'A key a story has no place for.',
                        repo: 'some-org/other',
                        pr_number: 999,
                    }),
                ],
            }),
    })

    test('the journal holds pull_request_opened, the story-writer’s start and finish, story_saved, worktrees_removed and run_ended, in that order', () => {
        const run = happy()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            tagsAfterPullRequest(run.records, [
                'pull_request_opened',
                'agent_started:story-writer',
                'agent_finished:story-writer',
                'story_saved',
                'worktrees_removed',
                'run_ended',
            ])
        ).toEqual([
            'pull_request_opened',
            'agent_started:story-writer',
            'agent_finished:story-writer',
            'story_saved',
            'worktrees_removed',
            'run_ended',
        ])
    })

    test('the saved story reads as ok, for the opened pull request and the tracker’s repo', () => {
        const run = happy()
        const saved = savedStory(run)
        const opened = openedOf(run)
        const [pull] = run.tracker.pullRequests()

        expect(readStory({ value: saved }).status).toBe('ok')
        expect(saved.pr_number).toBe(opened.number)
        expect(saved.pr_url).toBe(opened.url)
        expect(saved.pr_number).toBe(pull?.number ?? 0)
        expect(saved.pr_url).toBe(pull?.url ?? '')
        expect(saved.repo).toBe(run.tracker.repo)
    })

    test('the saved story’s head_sha is the run branch’s tip and its base_sha the merge base of origin/main and the run branch', async () => {
        const run = happy()
        const { head, base } = await runShas(run)
        const saved = savedStory(run)

        expect(saved.head_sha).toBe(head)
        expect(saved.base_sha).toBe(base)
    })

    test('summary.counts are counted from git, whatever the answer held', async () => {
        const run = happy()
        const { head, base } = await runShas(run)
        const lines = await lineCounts({ repo: run.repo, base, head })

        expect(lines.added).toBeGreaterThan(0)
        expect(lines.removed).toBeGreaterThan(0)
        expect(savedStory(run).summary.counts).toEqual({
            files_added: 1,
            files_changed: 1,
            files_deleted: 1,
            lines_added: lines.added,
            lines_removed: lines.removed,
        })
    })

    test('an author source for the feedback wanted is saved as guessed, with no section of what the run was unsure about', () => {
        expect(savedStory(happy()).summary.feedback_wanted.source).toBe(
            'guessed'
        )
    })

    test('with no open finding and no assumption, what the run was unsure about reads Nothing was left open., and the author source is saved as guessed with no story_refused', () => {
        const run = happy()

        expect(
            sectionOf(storyPrompt(run), '## What the run was unsure about')
        ).toBe('Nothing was left open.')
        expect(savedStory(run).summary.feedback_wanted.source).toBe('guessed')
        expect(recordsOf(run.records, 'story_refused')).toEqual([])
    })

    test('written_by names the run and the story-writer, and written_at is the time of the story-writer’s agent_finished', () => {
        const run = happy()
        const saved = savedStory(run)
        const finished = run.records.find(
            (record) =>
                record.kind === 'agent_finished' &&
                record.content.role === 'story-writer'
        )

        expect(saved.written_by).toBe('Luca run run-1, story-writer')
        expect(finished).toBeDefined()
        expect(saved.written_at).toBe(finished?.time ?? '')
    })

    test('a top-level key the story has no place for is dropped', () => {
        const saved = savedStory(happy())

        expect(saved).not.toHaveProperty('notes')
    })

    test('the run folder holds story.json, the saved story', async () => {
        const run = happy()
        const text = await Bun.file(join(runFolder(run), 'story.json')).text()

        expect(JSON.parse(text)).toEqual(savedStory(run))
    })

    test('story_saved is the run’s, with the home, the head commit and the comment count', async () => {
        const run = happy()
        const { head } = await runShas(run)

        expect(recordsOf(run.records, 'story_saved')).toEqual([
            expect.objectContaining({
                ticket: null,
                content: { home: 'shared', head_sha: head, comments: 1 },
            }),
        ])
    })

    test('the story-writer launches on the locked pick at high effort, with no turn limit of its own and no agent_model ask', () => {
        const run = happy()
        const [launch, ...more] = storyWriterCalls(run.launches)

        expect(more).toEqual([])
        expect(launch).toMatchObject({
            kind: 'launch',
            model: LOCKED_PICK.model,
            effort: 'high',
        })
        expect(launch).not.toHaveProperty('max_turns')
        expect(
            run.records.filter(
                (record) =>
                    record.kind === 'jev_asked' &&
                    record.role === 'story-writer'
            )
        ).toEqual([])
    })

    test('the prompt has the four sections in order, and the pull request section has its six lines', async () => {
        const run = happy()
        const prompt = storyPrompt(run)
        const { head, base } = await runShas(run)
        const opened = openedOf(run)
        const lines = prompt.split('\n')
        const at = [
            '## Pull request',
            '## Changed files',
            '## Diff',
            '## Rule files',
        ].map((heading) => lines.indexOf(heading))

        expect(at.every((index) => index >= 0)).toBe(true)
        expect(at).toEqual(at.toSorted((a, b) => a - b))
        expect(sectionOf(prompt, '## Pull request')).toBe(
            [
                `Number: ${opened.number}`,
                `URL: ${opened.url}`,
                `Title: ${opened.title}`,
                'Base branch: main',
                `Base commit: ${base}`,
                `Head commit: ${head}`,
            ].join('\n')
        )
        expect(prompt.endsWith('\n')).toBe(true)
        expect(prompt.endsWith('\n\n')).toBe(false)
    })

    test('a diff that fits is in the prompt whole, every file in path order', async () => {
        const run = happy()
        const { head, base } = await runShas(run)
        const whole = await gitDiff({ repo: run.repo, base, head })
        const diff = sectionOf(storyPrompt(run), '## Diff')
        const parts = await Promise.all(
            ['docs/old.md', 'src/index.ts', 'src/sum.test.ts'].map((path) =>
                gitDiff({ repo: run.repo, base, head, path })
            )
        )

        expect(diff).toBe(whole.replace(/\n+$/, ''))
        const at = parts.map((part) => diff.indexOf(part.trimEnd()))
        expect(at.every((index) => index >= 0)).toBe(true)
        expect(at).toEqual(at.toSorted((a, b) => a - b))
    })

    test('with no rule files, the rule files section reads No rule files.', () => {
        expect(sectionOf(storyPrompt(happy()), '## Rule files')).toBe(
            'No rule files.'
        )
    })
})

const OLD_MODULE = Array.from(
    { length: 10 },
    (_, at) => `export const oldThing${at} = 'the old module, line ${at}'`
).join('\n')

/** Bytes git reads as binary: they hold a NUL. */
const LOGO = '\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR\u0000\u0001'

describe('the changed files, a binary file, and the rule files in the prompt', () => {
    const layout = shareStoryRun({
        config: {
            ...PRACTICE_ENGINE_CONFIG,
            rule_files: ['AGENTS.md', 'docs/rules.md'],
        },
        files: {
            'AGENTS.md': '# Agents\n\nUse one object argument.\n',
            'docs/rules.md': '# Rules\n\nNo classes.\n',
            'src/b.ts': "export const beta = (): string => 'b'\n",
            'src/c.ts':
                '// The gamma module, gone after this run.\nexport const gamma = 3\n',
            'src/old.ts': `${OLD_MODULE}\n`,
        },
        build: (practice) => {
            const { testWriter, implementer, reviewer } = happyTurns()
            return practice.run({
                turns: [
                    testWriter,
                    {
                        ...implementer,
                        files: {
                            ...implementer.files,
                            'src/a.ts':
                                'export const alpha = (): number => 1 + 1\n',
                            'src/b.ts':
                                "export const beta = (): string => 'bb'\n",
                            'src/new.ts': `${OLD_MODULE}\n`,
                            'assets/logo.png': LOGO,
                        },
                        act: async (cwd) => {
                            await rm(join(cwd, 'src', 'c.ts'))
                            await rm(join(cwd, 'src', 'old.ts'))
                        },
                    },
                    reviewer,
                    storyWriterTurn(storyAnswer()),
                ],
            })
        },
    })

    test('each changed file has its line under Changed files, in path order, a rename by its new path', () => {
        const run = layout()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(sectionOf(storyPrompt(run), '## Changed files')).toBe(
            [
                '- added: assets/logo.png',
                '- added: src/a.ts',
                '- modified: src/b.ts',
                '- deleted: src/c.ts',
                '- modified: src/index.ts',
                '- renamed: src/old.ts -> src/new.ts',
                '- added: src/sum.test.ts',
                '- added: src/sum.ts',
            ].join('\n')
        )
    })

    test('a binary file is one line under Diff and an added file under Changed files', () => {
        const prompt = storyPrompt(layout())

        expect(sectionOf(prompt, '## Diff').split('\n')).toContain(
            'assets/logo.png: binary file, no diff.'
        )
        expect(sectionOf(prompt, '## Changed files').split('\n')).toContain(
            '- added: assets/logo.png'
        )
    })

    test('the rule files are listed in the config’s order', () => {
        expect(sectionOf(storyPrompt(layout()), '## Rule files')).toBe(
            '- `AGENTS.md`\n- `docs/rules.md`'
        )
    })
})

/** A line of `length` characters, made from its number so lines differ. */
const lineOf = (at: number, length: number): string =>
    `${at} `.padEnd(length, String.fromCharCode(97 + (at % 26)))

const linesOf = (count: number, length: number): string =>
    Array.from({ length: count }, (_, at) => `${lineOf(at, length)}\n`).join('')

describe('a diff over 150,000 characters', () => {
    // Diffs of about 1,000, 100,000 and 120,000 characters, and a
    // one-line file of 130,000.
    const capped = shareStoryRun({
        files: { 'data/big.txt': linesOf(9, 20) },
        build: (practice) => {
            const { testWriter, implementer, reviewer } = happyTurns()
            return practice.run({
                turns: [
                    testWriter,
                    {
                        ...implementer,
                        files: {
                            ...implementer.files,
                            'data/small.txt': linesOf(10, 90),
                            'data/medium.txt': linesOf(1000, 98),
                            'data/big.txt': linesOf(412, 288).replaceAll(
                                ' ',
                                '_'
                            ),
                            'data/huge.txt': `${'z'.repeat(130_000)}\n`,
                        },
                    },
                    reviewer,
                    storyWriterTurn(storyAnswer()),
                ],
            })
        },
    })

    const partOf = async (run: StoryRun, path: string) => {
        const { head, base } = await runShas(run)
        return gitDiff({ repo: run.repo, base, head, path })
    }

    test('the diff part is at most 150,000 characters, and a file left out keeps its hunk headers and says its line counts', async () => {
        const run = capped()
        const diff = sectionOf(storyPrompt(run), '## Diff')
        const big = await partOf(run, 'data/big.txt')
        const headers = big.split('\n').filter((line) => line.startsWith('@@'))

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(diff.length).toBeGreaterThan(0)
        expect(diff.length).toBeLessThanOrEqual(150_000)
        expect(headers.length).toBeGreaterThan(0)
        const lines = diff.split('\n')
        for (const header of headers) expect(lines).toContain(header)
        expect(lines).toContain(
            'data/big.txt: diff left out for size (412 lines added, 9 removed). Read the file.'
        )
    })

    test('the smaller files are shown whole, smallest first, and the largest that does not fit is left out', async () => {
        const run = capped()
        const diff = sectionOf(storyPrompt(run), '## Diff')
        const small = await partOf(run, 'data/small.txt')
        const medium = await partOf(run, 'data/medium.txt')
        const big = await partOf(run, 'data/big.txt')

        expect(small.length).toBeGreaterThan(900)
        expect(small.length).toBeLessThan(1_200)
        expect(medium.length).toBeGreaterThan(99_000)
        expect(big.length).toBeGreaterThan(119_000)
        expect(diff).toContain(small.trimEnd())
        expect(diff).toContain(medium.trimEnd())
        expect(diff).not.toContain(lineOf(0, 288).replaceAll(' ', '_'))
    })

    test('a file left out with one added line says "1 line added"', () => {
        const lines = sectionOf(storyPrompt(capped()), '## Diff').split('\n')

        expect(lines).toContain(
            'data/huge.txt: diff left out for size (1 line added, 0 removed). Read the file.'
        )
    })
})

describe('pr_story set to false', () => {
    const off = shareStoryRun({
        config: { ...PRACTICE_ENGINE_CONFIG, pr_story: false },
        build: (practice) =>
            practice.run({
                turns: [
                    ...Object.values(happyTurns()),
                    storyWriterTurn(storyAnswer()),
                ],
            }),
    })

    test('the config loads and the run opens its pull request with no story-writer, no story_saved and no story_skipped', () => {
        const run = off()

        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(recordsOf(run.records, 'run_started')[0]).toMatchObject({
            content: { config: { pr_story: false } },
        })
        expect(
            run.records.filter(
                (record) =>
                    record.role === 'story-writer' ||
                    ('content' in record &&
                        typeof record.content === 'object' &&
                        record.content !== null &&
                        'role' in record.content &&
                        record.content.role === 'story-writer')
            )
        ).toEqual([])
        expect(recordsOf(run.records, 'story_saved')).toEqual([])
        expect(recordsOf(run.records, 'story_skipped')).toEqual([])
        expect(storyWriterCalls(run.launches)).toEqual([])
        expect(run.tracker.savedStories()).toEqual([])
    })
})
