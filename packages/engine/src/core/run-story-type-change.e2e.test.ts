import { rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { git, happyTurns } from '../testing/practice-repo'
import {
    recordsOf,
    runShas,
    sectionOf,
    shareStoryRun,
    storyAnswer,
    storyPrompt,
    storyWriterTurn,
    tagsAfterPullRequest,
} from '../testing/story-run-fixtures'

/**
 * A file turned into a symlink (#743): git prints that type change as two
 * `diff --git` parts but lists it once in `--name-status` and `--numstat`.
 * The story step still writes and saves the story, and the run ends with
 * its pull request.
 */

describe('a run whose diff turns a file into a symlink', () => {
    const typeChange = shareStoryRun({
        files: { 'src/link.ts': "export const link = 'a plain file'\n" },
        build: (practice) => {
            const { testWriter, implementer, reviewer } = happyTurns()
            return practice.run({
                turns: [
                    testWriter,
                    {
                        ...implementer,
                        act: async (cwd) => {
                            await rm(join(cwd, 'src', 'link.ts'))
                            await symlink('sum.ts', join(cwd, 'src', 'link.ts'))
                        },
                    },
                    reviewer,
                    storyWriterTurn(storyAnswer()),
                ],
            })
        },
    })

    test('the story is saved, the type change is one modified file, and the run ends with its pull request', async () => {
        const run = typeChange()
        const { head, base } = await runShas(run)
        const status = await git(
            run.repo,
            'diff',
            '--name-status',
            base,
            head,
            '--',
            'src/link.ts'
        )
        const prompt = storyPrompt(run)

        expect(status.trim()).toBe('T\tsrc/link.ts')
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            tagsAfterPullRequest(run.records, [
                'pull_request_opened',
                'agent_started:story-writer',
                'story_saved',
                'worktrees_removed',
                'run_ended',
            ])
        ).toEqual([
            'pull_request_opened',
            'agent_started:story-writer',
            'story_saved',
            'worktrees_removed',
            'run_ended',
        ])
        expect(recordsOf(run.records, 'story_skipped')).toEqual([])
        expect(sectionOf(prompt, '## Changed files').split('\n')).toContain(
            '- modified: src/link.ts'
        )
        expect(
            sectionOf(prompt, '## Diff')
                .split('\n')
                .filter(
                    (line) => line === 'diff --git a/src/link.ts b/src/link.ts'
                )
        ).toHaveLength(2)
    })
})
