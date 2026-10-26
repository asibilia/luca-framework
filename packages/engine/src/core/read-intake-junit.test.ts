import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import sortBy from 'lodash/sortBy'

import { runEngine } from './execute'
import { startRun } from './run-start'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import { EngineConfigSchema } from '../config/engine-config'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import { git, practiceTracker } from '../testing/practice-repo'

/**
 * Reading intake records the `junit_path` entries git doesn't ignore
 * (#668), in `intake_read`, so intake can refuse a path a test run could
 * get committed. A throwaway git repo with a `.gitignore` stands in for
 * the repo the run is on.
 */

let root = ''
let repo = ''

beforeEach(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'luca-read-intake-')))
    repo = join(root, 'repo')
    await mkdir(repo)
    await git(repo, 'init', '-q', '-b', 'main')
    await Bun.write(join(repo, '.gitignore'), 'packages/ios/.derived/\n')
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** A config with one junit command in each of checks.test and checks.slow_test. */
const JUNIT_CONFIG = {
    checks: {
        test: [
            'bun test',
            {
                run: 'bun run ios:test:core',
                results: 'junit',
                junit_path: [
                    'packages/ios/.derived/junit/core.xml',
                    'junit/core-swift-testing.xml',
                ],
            },
        ],
        slow_test: [
            {
                run: 'bun run ios:test:ui',
                results: 'junit',
                junit_path: [
                    'packages/ios/.derived/junit/ui.xml',
                    'e2e/ui-swift-testing.xml',
                ],
            },
        ],
    },
}

describe('reading intake with junit test commands (#668)', () => {
    test('intake_read lists each junit_path git does not ignore, and leaves out the ignored ones', async () => {
        const journal = createJournal({
            file: join(root, 'runs', 'run-1', 'journal.jsonl'),
        })
        startRun({
            journal,
            spec_number: 10,
            config: EngineConfigSchema.parse(JUNIT_CONFIG),
            repo,
            alongside: true,
        })

        await runEngine({
            journal,
            tracker: practiceTracker(),
            git: createGitAdapter({ repo_root: repo }),
            launcher: createScriptedLauncher({ turns: [] }),
            stop_before: ['snapshot_intake', 'refuse_intake'],
        })

        const read = journal.read().find(({ kind }) => kind === 'intake_read')
        expect(read).toBeDefined()
        const content = read?.kind === 'intake_read' ? read.content : null
        expect(sortBy(content?.junit_paths_not_ignored ?? [])).toEqual([
            'e2e/ui-swift-testing.xml',
            'junit/core-swift-testing.xml',
        ])
    }, 20_000)
})
