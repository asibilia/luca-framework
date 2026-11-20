import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { BuildContext } from './build-context'
import { executeStoryAction } from './execute-story'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import { replayRun } from '../journal/replay'
import { story, storyAnswer } from '../story/testing/story-fixtures'
import { intakePassed, practiceTicket } from '../testing/build-fixtures'
import { git, PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Provider-aware story-writer launches and follow-ups (#778 AC6–AC7):
 * fresh `launch_story_writer` runs on `lockedPick({ provider })`, and
 * follow-ups fall back to the active provider's strongest model when no prior
 * model was recorded.
 */

let root = ''
let repo = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-execute-story-'))
    repo = join(root, 'repo')
    await mkdir(join(repo, 'src'), { recursive: true })
    await git(repo, 'init', '-q', '-b', 'main')
    await git(repo, 'config', 'user.email', 'luca@example.com')
    await git(repo, 'config', 'user.name', 'Luca')
    await Bun.write(join(repo, 'src', 'index.ts'), 'export {}\n')
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'base')
    await git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    await Bun.write(join(repo, 'src', 'sum.ts'), 'export const sum = () => 0\n')
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'change')
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const storyContext = ({
    provider,
    launcher,
    journal,
    base_sha,
}: {
    provider: 'claude' | 'agy'
    launcher: ReturnType<typeof createScriptedLauncher>
    journal: ReturnType<typeof createJournal>
    base_sha: string
}): BuildContext => {
    const config = EngineConfigSchema.parse({
        ...PRACTICE_ENGINE_CONFIG,
        models: { provider },
    })
    for (const entry of intakePassed({
        tickets: [practiceTicket({ number: 11 })],
    })) {
        journal.append(entry)
    }
    journal.append({
        kind: 'run_branch_created',
        ticket: null,
        role: null,
        content: {
            branch: 'luca/spec-10-run',
            path: repo,
            base_sha,
        },
    })
    journal.append({
        kind: 'pull_request_opened',
        ticket: null,
        role: null,
        content: {
            number: 42,
            url: 'https://github.com/acme/app/pull/42',
            title: 'Practice PR',
            body: '',
            base: 'main',
            head: 'luca/spec-10-run',
        },
    })
    return {
        git: createGitAdapter({ repo_root: repo }),
        launcher,
        journal,
        tracker: createInMemoryTracker({ issues: [], sub_tickets: {} }),
        state: replayRun({ records: journal.read() }),
        config,
        run_dir: join(root, 'run-1'),
        step: { run_id: 'run-1', first_seq: 1, redo: false },
    }
}

describe('executeStoryAction provider routing (#778 AC6–AC7)', () => {
    test('fresh launch_story_writer under agy launches and journals gemini-4-neon-high as locked', async () => {
        const base_sha = (await git(repo, 'rev-parse', 'HEAD~1')).trim()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'story-writer', ticket: 10, result: storyAnswer() },
            ],
        })
        const context = storyContext({
            provider: 'agy',
            launcher,
            journal,
            base_sha,
        })

        await executeStoryAction({
            action: { type: 'launch_story_writer', problems: [] },
            context,
        })

        const launched = launcher.launches()
        expect(launched).toHaveLength(1)
        expect(launched[0]?.model).toBe('gemini-4-neon-high')
        const started = journal
            .read()
            .findLast((record) => record.kind === 'agent_started')
        expect(started?.kind).toBe('agent_started')
        if (started?.kind === 'agent_started') {
            expect(started.content.model).toBe('gemini-4-neon-high')
            expect(started.content.model_reason).toBe('locked')
            expect(started.content.trial_group).toBeNull()
        }
    })

    test('follow-up launch_story_writer under agy falls back to gemini-4-neon-high when prior agent_started had model null', async () => {
        const base_sha = (await git(repo, 'rev-parse', 'HEAD~1')).trim()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'story-writer', ticket: 10, result: storyAnswer() },
                { role: 'story-writer', ticket: 10, result: storyAnswer() },
            ],
        })
        const context = storyContext({
            provider: 'agy',
            launcher,
            journal,
            base_sha,
        })
        const first = await launcher.launch({
            role: 'story-writer',
            ticket: 10,
            prompt: 'Write story.',
            cwd: repo,
            may_edit_tests: false,
            config: context.config,
            messaging: null,
            model: 'gemini-4-neon-high',
            effort: 'xhigh',
        })
        if (!first.session_id) throw new Error('missing session_id')
        journal.append({
            kind: 'agent_started',
            ticket: null,
            role: 'story-writer',
            content: {
                role: 'story-writer',
                prompt: 'Write story.',
                follow_up_of: null,
                model: null,
                model_reason: null,
                effort: null,
                trial_group: null,
            },
        })
        const baseStory = story()
        journal.append({
            kind: 'agent_finished',
            ticket: null,
            role: 'story-writer',
            content: {
                role: 'story-writer',
                session_id: first.session_id,
                result: {
                    summary: baseStory.summary,
                    map: baseStory.map,
                    stops: baseStory.stops,
                },
            },
        })
        context.state = replayRun({ records: journal.read() })

        await executeStoryAction({
            action: {
                type: 'launch_story_writer',
                session_id: first.session_id,
                message: 'Fix story problems.',
            },
            context,
        })

        const followUpStarted = journal
            .read()
            .findLast((record) => record.kind === 'agent_started')
        expect(followUpStarted?.kind).toBe('agent_started')
        if (followUpStarted?.kind === 'agent_started') {
            expect(followUpStarted.content.follow_up_of).toBe(first.session_id)
            expect(followUpStarted.content.model).toBe('gemini-4-neon-high')
        }
    })
})
