import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { commitIn, type BuildContext } from './execute-build'

import type { AgentLauncher } from '../agents/agent-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import type { CommitStage, JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { git } from '../testing/practice-repo'
import type { Tracker } from '../tracker/tracker'

/**
 * The engine's commit step, on a real git repo: nothing left to commit
 * never runs a failing `git commit` (#494), and an untracked link pointing
 * outside the checkout is never committed (#496).
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

/** A build step's context on `repo`, with a state noting `prepare_made`. */
const contextWith = ({
    prepare_made,
}: {
    prepare_made: string[]
}): BuildContext => ({
    git: createGitAdapter({ repo_root: repo }),
    launcher: {} as AgentLauncher,
    journal: createJournal({ file: join(root, 'run-1', 'journal.jsonl') }),
    tracker: {} as Tracker,
    state: { ...replayRun({ records: [] }), prepare_made },
    config: EngineConfigSchema.parse({}),
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
