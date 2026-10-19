import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { commitIn, type BuildContext } from './execute-build'

import type { AgentLauncher } from '../agents/agent-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { git } from '../testing/practice-repo'
import type { Tracker } from '../tracker/tracker'

/**
 * The leftover scan and test helpers (#619), on a real git repo: a new file
 * matching `test_helper_patterns` is the test-writer's helper, so it passes
 * the scan and is committed even when only tests name it. Without the
 * setting, a scratch-named file or new markdown only a test names is a
 * leftover (see `commit-in.test.ts`).
 */

let root = ''
let repo = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-commit-helpers-'))
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

const contextWith = ({ config }: { config: object }): BuildContext => ({
    git: createGitAdapter({ repo_root: repo }),
    launcher: {} as AgentLauncher,
    journal: createJournal({ file: join(root, 'run-1', 'journal.jsonl') }),
    tracker: {} as Tracker,
    state: {
        ...replayRun({ records: [] }),
        prepare_made: [],
        changesets: false,
    },
    config: EngineConfigSchema.parse(config),
    run_dir: join(root, 'run-1'),
    step: { run_id: 'run-1', first_seq: 1, redo: false },
})

const byKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

/** A test that uses a scratch-named helper and reads a markdown fixture. */
const SPEC_TEST = `import { expect, test } from 'bun:test'

import { tmpRepo } from './testing/tmp-repo'

test('reads the spec fixture', async () => {
    const text = await Bun.file(tmpRepo('spec-fixture.md')).text()
    expect(text).toContain('# Spec')
})
`

describe('commitIn and test helpers (#619)', () => {
    test('new helper files matching test_helper_patterns pass the scan when only a test names them, and are committed with the test', async () => {
        for (const [path, content] of Object.entries({
            'src/testing/tmp-repo.ts':
                'export const tmpRepo = (name: string): string => `${import.meta.dir}/${name}`\n',
            'src/testing/spec-fixture.md': '# Spec\n\nA fixture.\n',
            'src/spec.test.ts': SPEC_TEST,
        })) {
            await Bun.write(join(repo, path), content)
        }
        const context = contextWith({
            config: {
                checks: { test: 'bun test' },
                test_file_patterns: ['src/**/*.test.ts'],
                test_helper_patterns: ['src/**/testing/**'],
            },
        })

        await commitIn({
            context,
            cwd: repo,
            ticket: 11,
            stage: 'red',
            message: 'red: #11',
            mention_text: '',
        })

        const records = context.journal.read()
        expect(byKind(records, 'leftover_scan').at(-1)?.content.hits).toEqual(
            []
        )
        expect(byKind(records, 'commit_made')[0]?.content.files).toEqual([
            'src/spec.test.ts',
            'src/testing/spec-fixture.md',
            'src/testing/tmp-repo.ts',
        ])
    })
})
