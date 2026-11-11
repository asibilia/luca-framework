import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll } from 'bun:test'

import { createPracticeRepo, git, type PracticeRun } from './practice-repo'

import type { ScriptedCall, ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { readStory } from '../story/story-schema'
import {
    story,
    storyAnswer,
    type StoryAnswer,
} from '../story/testing/story-fixtures'

/**
 * Fixtures for the story step's end-to-end tests (#743): the story-writer's
 * scripted answers, the problem lines `readStory` gives for them, a practice
 * run built once per `describe`, and ways to read its prompt and the run
 * branch's git state.
 */

/** The story-writer is launched with the practice spec's number, as the learner is. */
export const storyWriterTurn = (result?: unknown): ScriptedTurn =>
    result === undefined
        ? { role: 'story-writer', ticket: 10 }
        : { role: 'story-writer', ticket: 10, result }

export { storyAnswer, type StoryAnswer }

/** An answer whose walk starts in a file that is not on the map. */
export const invalidAnswer = (): StoryAnswer => {
    const valid = storyAnswer()
    return {
        ...valid,
        map: { ...story().map, entry_path: 'src/nowhere.ts' },
    }
}

/** An otherwise valid answer with no `summary.feedback_wanted`. */
export const noFeedbackAnswer = (): StoryAnswer => {
    const { feedback_wanted: _, ...summary } = storyAnswer().summary
    return { ...storyAnswer(), summary }
}

/**
 * The problem lines `readStory` gives for a story built from `answer`, with
 * every field the engine fills in valid.
 */
export const problemsOf = (answer: StoryAnswer): string[] => {
    const base = story()
    const wanted = answer.summary.feedback_wanted
    const summary = {
        ...answer.summary,
        counts: base.summary.counts,
        ...(typeof wanted === 'object' && wanted !== null
            ? { feedback_wanted: { ...wanted, source: 'guessed' } }
            : {}),
    }
    const read = readStory({
        value: { ...base, summary, map: answer.map, stops: answer.stops },
    })
    if (read.status !== 'invalid') throw new Error('The answer is valid.')
    return read.problems
}

/** A practice run plus where it ran. */
export type StoryRun = PracticeRun & { root: string; repo: string }

/**
 * Builds one practice run before a `describe`'s tests and removes it after
 * them. `build` gets the practice repo and runs it.
 *
 * @example
 * const happy = shareStoryRun({ build: (practice) => practice.run({ turns }) })
 */
export const shareStoryRun = ({
    config,
    files,
    build,
}: {
    config?: object
    files?: Record<string, string>
    build: (
        practice: Awaited<ReturnType<typeof createPracticeRepo>>
    ) => Promise<Omit<PracticeRun, 'origin'>>
}): (() => StoryRun) => {
    let root = ''
    let run: StoryRun | undefined
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-story-'))
        const practice = await createPracticeRepo({ root, config, files })
        const ran = await build(practice)
        run = { ...ran, origin: practice.origin, root, repo: practice.repo }
    }, 180_000)
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })
    return () => {
        if (run === undefined) throw new Error('The run was not built.')
        return run
    }
}

/** The run folder of a practice run. */
export const runFolder = (run: StoryRun): string =>
    join(run.root, 'runs', 'run-1')

/** The run branch's tip and its merge base with `origin/main`. */
export const runShas = async (
    run: StoryRun
): Promise<{ branch: string; head: string; base: string }> => {
    const created = run.records.find(
        (record) => record.kind === 'run_branch_created'
    )
    if (created?.kind !== 'run_branch_created') {
        throw new Error('No run branch.')
    }
    const { branch } = created.content
    const head = (await git(run.repo, 'rev-parse', branch)).trim()
    const base = (
        await git(run.repo, 'merge-base', 'origin/main', branch)
    ).trim()
    return { branch, head, base }
}

/** The diff between two commits, as the spec's section 2 asks git for it. */
export const gitDiff = ({
    repo,
    base,
    head,
    path,
}: {
    repo: string
    base: string
    head: string
    /** One file's part only. */
    path?: string
}): Promise<string> =>
    git(
        repo,
        '-c',
        'core.quotepath=false',
        'diff',
        '--no-color',
        '--no-ext-diff',
        '-M',
        '-U3',
        '--no-textconv',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '--diff-algorithm=myers',
        base,
        head,
        ...(path === undefined ? [] : ['--', path])
    )

/** The added and removed line counts of the diff, from `git diff --numstat`. */
export const lineCounts = async ({
    repo,
    base,
    head,
}: {
    repo: string
    base: string
    head: string
}): Promise<{ added: number; removed: number }> => {
    const text = await git(repo, 'diff', '--numstat', '-M', base, head)
    return text
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.split('\t'))
        .reduce(
            (total, [added, removed]) => ({
                added: total.added + (Number(added) || 0),
                removed: total.removed + (Number(removed) || 0),
            }),
            { added: 0, removed: 0 }
        )
}

/**
 * The body of a prompt's section: the lines after the line `heading`, up to
 * the next line that starts with `## `, without the blank lines at its two
 * ends. Empty when the prompt has no such heading.
 */
export const sectionOf = (prompt: string, heading: string): string => {
    const lines = prompt.split('\n')
    const at = lines.indexOf(heading)
    if (at === -1) return ''
    const rest = lines.slice(at + 1)
    const end = rest.findIndex((line) => line.startsWith('## '))
    return (end === -1 ? rest : rest.slice(0, end))
        .join('\n')
        .replace(/^\n+|\n+$/g, '')
}

/** The story-writer's launches and follow-ups, oldest first. */
export const storyWriterCalls = (launches: ScriptedCall[]): ScriptedCall[] =>
    launches.filter(({ role }) => role === 'story-writer')

/** The first story-writer launch's prompt. */
export const storyPrompt = (run: StoryRun): string =>
    storyWriterCalls(run.launches).find(({ kind }) => kind === 'launch')
        ?.prompt ?? ''

/**
 * The records from `pull_request_opened` on, each as its kind, or
 * `<kind>:<role>` for an agent record, keeping only the tags in `keep`.
 */
export const tagsAfterPullRequest = (
    records: JournalRecord[],
    keep: string[]
): string[] => {
    const from = records.findIndex(({ kind }) => kind === 'pull_request_opened')
    return records
        .slice(Math.max(from, 0))
        .map((record) =>
            'content' in record &&
            typeof record.content === 'object' &&
            record.content !== null &&
            'role' in record.content &&
            record.kind.startsWith('agent_')
                ? `${record.kind}:${String(record.content.role)}`
                : record.kind
        )
        .filter((tag) => keep.includes(tag))
}

/** The records of `kind`, as plain objects for `toMatchObject`. */
export const recordsOf = (
    records: JournalRecord[],
    kind: string
): JournalRecord[] => records.filter((record) => record.kind === kind)
