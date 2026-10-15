import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { BoardSync } from './board-sync'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import { loadEngineConfig } from '../config/engine-config'
import { runEngine, startRun } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import type { JournalRecord } from '../journal/journal-record'
import { waitUntil } from '../testing/many-tickets'
import {
    createPracticeRepo,
    practiceTracker,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/** Whether `records` hold a test-writer turn's step record of this kind. */
const hasTestWriterStep = ({
    records,
    kind,
}: {
    records: JournalRecord[]
    kind: 'step_started' | 'step_ended'
}): boolean =>
    records.some(
        (record) =>
            record.kind === kind &&
            record.ticket === 11 &&
            record.content.step === 'launch_agent:test-writer'
    )

describe('board sync: a slow step reaches the board while it runs', () => {
    test("a test-writer's turn is sent as started before it ends", async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-board-slow-'))
        try {
            const practice = await createPracticeRepo({ root })
            const loaded = await loadEngineConfig({ repo_root: practice.repo })
            if (!loaded.ok) throw new Error(loaded.error)
            startRun({
                journal: practice.journal,
                spec_number: 10,
                config: loaded.config,
                base_branch: 'main',
            })
            const sends: JournalRecord[][] = []
            const board: BoardSync = {
                sync: async ({ records }) => {
                    sends.push(records)
                },
                end: async () => undefined,
            }
            let agentStarted = false
            let release = () => {}
            const released = new Promise<void>((resolve) => {
                release = resolve
            })
            const launcher = createScriptedLauncher({
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        files: { 'src/sum.test.ts': SUM_TEST },
                        act: async () => {
                            agentStarted = true
                            await released
                        },
                        result: TEST_WRITER_RESULT,
                    },
                ],
            })

            const running = runEngine({
                journal: practice.journal,
                tracker: practiceTracker(),
                git: createGitAdapter({ repo_root: practice.repo }),
                launcher,
                board,
                stop_before: ['run_red_check', 'wait_for_reply'],
            })
            // Whatever the board heard while the turn was still running.
            let sentWhileRunning: JournalRecord[][] = []
            try {
                await waitUntil({
                    check: () => agentStarted,
                    what: "the test-writer's turn to start",
                })
                await waitUntil({
                    check: () =>
                        sends.some((records) =>
                            hasTestWriterStep({ records, kind: 'step_started' })
                        ),
                    what: "the test-writer's step_started to reach the board",
                }).catch(() => undefined)
                sentWhileRunning = [...sends]
            } finally {
                release()
            }
            const action = await running

            expect(action.type).toBe('run_red_check')
            const shown = sentWhileRunning.filter((records) =>
                hasTestWriterStep({ records, kind: 'step_started' })
            )
            expect(shown.length).toBeGreaterThan(0)
            for (const records of shown) {
                expect(hasTestWriterStep({ records, kind: 'step_ended' })).toBe(
                    false
                )
            }
            // Once the turn ends, the board hears that too.
            expect(
                hasTestWriterStep({
                    records: sends.at(-1) ?? [],
                    kind: 'step_ended',
                })
            ).toBe(true)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }, 60_000)
})
