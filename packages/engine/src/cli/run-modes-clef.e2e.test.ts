import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { runSpec, type RunEnd } from './run-modes'
import {
    fakeClaudeLauncher,
    recordingBoard,
    recordsOf,
    kindsIn,
} from './run-modes-helpers'

import type { DecisionModelFetch } from '../jev/clef-client'
import type { JournalRecord } from '../journal/journal-record'
import { createFakeMuninn } from '../testing/fake-muninn'
import {
    EMPTY_LEARNER_TURN,
    HAPPY_TURNS,
    makePracticeRepo,
    PRACTICE_ENGINE_CONFIG,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * `luca-run --spec` with Clef and memory on a practice repo (#566: the run
 * built once, its tests only reading what it left).
 */

describe('luca-run --spec with Clef and memory, on one run', () => {
    // One run, built once (#566), whose config names a Clef model and a
    // memory vault, with credentials, a fake fetch, and a fake MuninnDB.
    let root = ''
    const logs: string[] = []
    const recorder = recordingBoard()
    const urls: string[] = []
    const muninn = createFakeMuninn()
    let result: RunEnd
    let records: JournalRecord[] = []

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-run-modes-'))
        const { repo } = await makePracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                decision_model: { model: '@cf/cloudflare/clef-flash' },
                muninn: { vault: 'practice-vault' },
            },
        })
        const fetch: DecisionModelFetch = async (url) => {
            urls.push(url)
            return new Response(
                JSON.stringify({
                    result: { model: 'clef-flash', answers: {} },
                    success: true,
                })
            )
        }

        result = await runSpec({
            spec_number: 10,
            repo,
            run_id: 'run-1',
            base_branch: null,
            runs_dir: join(root, 'runs'),
            tracker: practiceTracker(),
            launcher: fakeClaudeLauncher({
                turns: [...HAPPY_TURNS, EMPTY_LEARNER_TURN(10)],
            }).launcher,
            decision_model: {
                credentials: {
                    ok: true,
                    account_id: 'acc',
                    api_token: 'not-real-tok',
                    file: '/home/.config/luca/.env',
                },
                fetch,
            },
            memory: { client: muninn },
            board: recorder.board,
            log: (line) => {
                logs.push(line)
            },
        })
        records = recordsOf({ runs_dir: join(root, 'runs'), run_id: 'run-1' })
    }, 120_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('with credentials, asks Clef in shadow mode with the config’s model', () => {
        expect(result.ok).toBe(true)
        expect(recorder.kinds()).toContain('jev_asked')
        expect(recorder.kinds()).toContain('jev_answered')
        expect(recorder.kinds()).not.toContain('decision_model_off')
        expect(urls.length).toBeGreaterThan(0)
        expect(
            urls.every((url) =>
                url.endsWith('/accounts/acc/ai/run/@cf/cloudflare/clef-flash')
            )
        ).toBe(true)
        expect(logs.join('\n')).toContain('@cf/cloudflare/clef-flash')
        expect(logs.join('\n')).not.toContain('not-real-tok')
    })

    test('with a memory client, memory is on with the config’s vault, and the client is closed', () => {
        expect(result.ok).toBe(true)
        const [started] = records
        expect(
            started?.kind === 'run_started' ? started.content.memory : null
        ).toEqual({ project_vault: 'practice-vault' })
        expect(
            muninn
                .calls()
                .filter(({ op }) => op === 'recall')
                .map(({ vault }) => vault)
                .slice(0, 2)
        ).toEqual(['practice-vault', 'default'])
        expect(kindsIn(records)).toContain('memories_saved')
        expect(muninn.closed()).toBe(true)
    })
})
