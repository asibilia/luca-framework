/**
 * Carries out the PR's story step (#743): starts the story-writer (or
 * follows it up with a refusal's problems), builds the story from its
 * answer and what the engine knows, checks it with the story schema's
 * reader, writes `story.json` to the run folder, and saves it through the
 * tracker; or journals the skip, and tells the owner of it (#744).
 */
import { basename, join } from 'node:path'

import { followUpModel, runTurn } from './agent-turn'
import { need, type BuildContext } from './build-context'
import type { StoryAction } from './decide-story'
import { nothingLeftOpen, runAsks, runUnsure } from './story-asks'
import { isBinary, type StoryDiffFile } from './story-diff'
import { storyPrompt } from './story-prompt'
import { servesProblems } from './story-serves'

import { roleEffort } from '../agents/role-effort'
import type { GitAdapter } from '../git/git-adapter'
import { diffFiles } from '../git/git-diff'
import { LOCKED_PICK } from '../jev/model-pick'
import type { JournalRecord } from '../journal/journal-record'
import type { StoryState } from '../journal/replay'
import { readStory, STORY_SCHEMA_VERSION } from '../story/story-schema'
import { postCommentOnce } from '../tracker/post-comment-once'
import { isTrackerNetworkFailure, TrackerError } from '../tracker/tracker'

const ROLE = 'story-writer'

/** The run's opened PR, from its latest `pull_request_opened`. */
const openedOf = (records: JournalRecord[]) => {
    const opened = records.findLast(
        (record) => record.kind === 'pull_request_opened'
    )
    if (opened?.kind !== 'pull_request_opened') {
        throw new Error('The journal has no pull_request_opened yet.')
    }
    return opened.content
}

/** The run branch's diff against its base: its commits and changed files. */
type RunDiff = { head_sha: string; base_sha: string; files: StoryDiffFile[] }

/**
 * The run branch's tip (the PR's head), its merge base with
 * `origin/<base_branch>`, and every changed file with its line counts and
 * its part of the diff, from git.
 */
const readRunDiff = async ({
    git,
    cwd,
    base_branch,
}: {
    git: GitAdapter
    cwd: string
    base_branch: string
}): Promise<RunDiff> => {
    const head_sha = await git.head({ cwd })
    const base_sha = await git.mergeBase({
        cwd,
        a: `origin/${base_branch}`,
        b: head_sha,
    })
    const range = { cwd, from: base_sha, to: head_sha }
    const files = diffFiles({
        changed: await git.changedFiles(range),
        counts: await git.lineCounts(range),
        text: await git.diffText(range),
    })
    return { head_sha, base_sha, files }
}

/** The story's counts, from git: a rename is a changed file, a binary file 0 lines. */
const countsOf = (files: StoryDiffFile[]) => ({
    files_added: files.filter(({ status }) => status === 'added').length,
    files_changed: files.filter(
        ({ status }) => status === 'modified' || status === 'renamed'
    ).length,
    files_deleted: files.filter(({ status }) => status === 'deleted').length,
    lines_added: files.reduce(
        (sum, file) => sum + (isBinary(file) ? 0 : (file.added ?? 0)),
        0
    ),
    lines_removed: files.reduce(
        (sum, file) => sum + (isBinary(file) ? 0 : (file.removed ?? 0)),
        0
    ),
})

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The whole story: the answer's summary, map and stops, with every field
 * the engine knows filled in over whatever the answer held. When the run
 * left nothing open, the feedback's source is `guessed` (#745); else the
 * answer's is kept.
 */
const storyValue = ({
    answer,
    context,
    diff,
}: {
    answer: NonNullable<StoryState['answer']>
    context: BuildContext
    diff: RunDiff
}): Record<string, unknown> => {
    const opened = openedOf(context.journal.read())
    const { summary, map, stops } = answer.result
    const wanted = summary.feedback_wanted
    const guessed = nothingLeftOpen(runUnsure({ state: context.state }))
    return {
        schema_version: STORY_SCHEMA_VERSION,
        repo: context.tracker.repo,
        pr_number: opened.number,
        pr_url: opened.url,
        title: opened.title,
        base_ref: opened.base,
        head_ref: opened.head,
        head_sha: diff.head_sha,
        base_sha: diff.base_sha,
        written_at: answer.time,
        written_by: `Luca run ${basename(context.run_dir)}, story-writer`,
        summary: {
            ...summary,
            ...(guessed && isPlainObject(wanted)
                ? { feedback_wanted: { ...wanted, source: 'guessed' } }
                : {}),
            counts: countsOf(diff.files),
        },
        map,
        stops,
    }
}

const launchStoryWriter = async ({
    action,
    context,
}: {
    action: Extract<StoryAction, { type: 'launch_story_writer' }>
    context: BuildContext
}): Promise<void> => {
    const { journal, launcher, config, state } = context
    const worktree = need({ value: state.run_branch, what: 'run branch' })
    const spec_number = need({ value: state.spec_number, what: 'spec' })
    if ('session_id' in action) {
        const { session_id, message } = action
        const { model, model_reason, effort, trial_group } = followUpModel({
            records: journal.read(),
            session_id,
        })
        journal.append({
            kind: 'agent_started',
            ticket: null,
            role: ROLE,
            content: {
                role: ROLE,
                prompt: message,
                follow_up_of: session_id,
                model,
                model_reason,
                effort,
                trial_group,
            },
        })
        await runTurn({
            context,
            worktree,
            ticket: null,
            role: ROLE,
            may_edit_tests: false,
            start: (cwd) =>
                launcher.followUp({
                    session_id,
                    role: ROLE,
                    ticket: spec_number,
                    message,
                    cwd,
                    config,
                }),
        })
        return
    }
    const opened = openedOf(journal.read())
    const diff = await readRunDiff({
        git: context.git,
        cwd: worktree.path,
        base_branch: opened.base,
    })
    const prompt = storyPrompt({
        pull_request: {
            number: opened.number,
            url: opened.url,
            title: opened.title,
            base_branch: opened.base,
            base_sha: diff.base_sha,
            head_sha: diff.head_sha,
        },
        files: diff.files,
        asks: runAsks({ state }),
        unsure: runUnsure({ state }),
        rule_files: config.rule_files,
        problems: action.problems,
    })
    // Never routed: always the locked pick, at the role's own effort.
    const { model, model_reason } = LOCKED_PICK
    const effort = roleEffort({ role: ROLE, config })
    journal.append({
        kind: 'agent_started',
        ticket: null,
        role: ROLE,
        content: {
            role: ROLE,
            prompt,
            follow_up_of: null,
            model,
            model_reason,
            effort,
            trial_group: null,
        },
    })
    await runTurn({
        context,
        worktree,
        ticket: null,
        role: ROLE,
        may_edit_tests: false,
        start: (cwd) =>
            launcher.launch({
                role: ROLE,
                ticket: spec_number,
                prompt,
                cwd,
                may_edit_tests: false,
                config,
                // It writes nothing and talks to nobody.
                messaging: null,
                model,
                effort,
            }),
    })
}

/**
 * Builds the story from the latest answer and checks it: a refused one is
 * journaled as `story_refused`; a valid one is written to `story.json`
 * and saved. A save the tracker refuses skips the story; a tracker it
 * can't reach is thrown on, for the engine's network wait.
 */
const saveStory = async ({
    context,
}: {
    context: BuildContext
}): Promise<void> => {
    const { journal, tracker, state } = context
    const answer = need({
        value: state.story.answer,
        what: "story-writer's answer",
    })
    const worktree = need({ value: state.run_branch, what: 'run branch' })
    const diff = await readRunDiff({
        git: context.git,
        cwd: worktree.path,
        base_branch: openedOf(journal.read()).base,
    })
    const read = readStory({
        value: storyValue({ answer, context, diff }),
    })
    // The serves refs are checked only on a story the schema read took.
    const problems =
        read.status === 'ok'
            ? servesProblems({ story: read.story, asks: runAsks({ state }) })
            : read.status === 'invalid'
              ? read.problems
              : [
                    `schema_version: ${read.schema_version} is newer than this engine reads`,
                ]
    if (read.status !== 'ok' || problems.length > 0) {
        journal.append({
            kind: 'story_refused',
            ticket: null,
            role: null,
            content: { problems },
        })
        return
    }
    const { story } = read
    await Bun.write(
        join(context.run_dir, 'story.json'),
        `${JSON.stringify(story, null, 2)}\n`
    )
    const skip = (reason: 'head_moved' | 'save_failed', detail: string) =>
        journal.append({
            kind: 'story_skipped',
            ticket: null,
            role: null,
            content: { reason, detail },
        })
    try {
        const saved = await tracker.saveStory({ story })
        if (saved.status === 'head_moved') {
            skip('head_moved', saved.pr_head_sha)
            return
        }
        journal.append({
            kind: 'story_saved',
            ticket: null,
            role: null,
            content: {
                home: saved.home,
                head_sha: story.head_sha,
                comments: saved.comments,
            },
        })
    } catch (error) {
        if (
            isTrackerNetworkFailure(error) ||
            !(error instanceof TrackerError)
        ) {
            throw error
        }
        skip('save_failed', error.message)
    }
}

/**
 * Tells the owner a story was skipped (#744). In the shared home, posts one
 * comment on the PR, once (a redo adopts the one its first try posted), then
 * journals `story_skip_reported`; a comment the tracker refuses is journaled
 * with no id. In the private home it posts and journals nothing: the
 * `story_skipped` record is the report.
 */
const reportStorySkip = async ({
    action,
    context,
}: {
    action: Extract<StoryAction, { type: 'report_story_skip' }>
    context: BuildContext
}): Promise<void> => {
    const { journal, tracker, step } = context
    if ((await tracker.storyHome()) !== 'shared') return
    const body = `Luca could not write the review story for this pull request (${action.reason}). Run \`/luca-pr-prep ${action.number}\` to write it.`
    const comment_id = await postCommentOnce({
        tracker,
        number: action.number,
        body,
        step,
        n: 0,
    }).then(
        ({ id }) => id,
        (error: unknown) => {
            if (
                isTrackerNetworkFailure(error) ||
                !(error instanceof TrackerError)
            ) {
                throw error
            }
            return null
        }
    )
    journal.append({
        kind: 'story_skip_reported',
        ticket: null,
        role: null,
        content: { comment_id },
    })
}

/**
 * Carries out one of the story step's actions and journals what happened.
 * The story-writer runs in the run branch's worktree with the same turn
 * machinery as every agent; the launcher is handed the spec's number as
 * its ticket, as the learner's is.
 */
export const executeStoryAction = async ({
    action,
    context,
}: {
    action: StoryAction
    context: BuildContext
}): Promise<void> => {
    switch (action.type) {
        case 'launch_story_writer':
            return launchStoryWriter({ action, context })
        case 'save_story':
            return saveStory({ context })
        case 'skip_story':
            context.journal.append({
                kind: 'story_skipped',
                ticket: null,
                role: null,
                content: { reason: action.reason, detail: action.detail },
            })
            return
        case 'report_story_skip':
            return reportStorySkip({ action, context })
    }
}
