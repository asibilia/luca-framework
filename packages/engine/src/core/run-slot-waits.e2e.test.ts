import { readFileSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { PREPARE_SLOTS } from '../gates/prepare-slots'
import { TEST_SLOTS } from '../gates/test-slots'
import {
    liveFileIn,
    readLive,
    type LiveWait,
} from '../testing/live-file-fixtures'
import {
    createPracticeRepo,
    EMPTY_LEARNER_TURN,
    HAPPY_TURNS,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * Waits inside a step (#632), end to end on the practice repo, with
 * scripted agents: while a check waits for a prepare slot or a test slot,
 * the run's live file says so, and once the slot is taken it doesn't. The
 * wait's length is journaled as `wait_ms` already, so the journal gets no
 * new record for it. Here the test holds the engine's slots itself, from
 * the implementer's turn on, so the checks after it must wait.
 */

/** The practice config, with a prepare command and two test slots. */
const CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    prepare: 'true',
    prepare_concurrency: 1,
    test_concurrency: 2,
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-slot-waits-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** The live file's waits for `kind`, or `null` while there is no file. */
const waitsFor = ({
    file,
    kind,
}: {
    file: string
    kind: LiveWait['for']
}): LiveWait[] | null =>
    readLive(file)?.waits.filter((wait) => wait.for === kind) ?? null

/** Waits until `until` holds, up to `ms`; whether it did. */
const eventually = async ({
    until,
    ms = 8000,
}: {
    until: () => boolean
    ms?: number
}): Promise<boolean> => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (until()) return true
        await Bun.sleep(20)
    }
    return false
}

/** Takes `count` of `slots` and holds them until `release` is called. */
const hold = ({
    slots,
    limit,
    count,
}: {
    slots: typeof PREPARE_SLOTS
    limit: number
    count: number
}) => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
        release = resolve
    })
    for (let n = 0; n < count; n += 1) {
        void slots.run({ limit, work: () => released })
    }
    return { release: () => release() }
}

/**
 * The happy path's scripted launcher; the implementer's launch runs
 * `during` first, without waiting for it.
 */
const onImplementer = ({ during }: { during: () => void }): AgentLauncher => {
    const scripted = createScriptedLauncher({
        turns: [...HAPPY_TURNS, EMPTY_LEARNER_TURN(10)],
    })
    return {
        ...scripted,
        launch: async (args) => {
            if (args.role === 'implementer') during()
            return scripted.launch(args)
        },
    }
}

/**
 * A journal's lines with what differs between any two runs masked (times,
 * shas, the temp folder, durations and waits, the order lenses start in),
 * so two runs that did the same compare the same.
 */
const comparable = ({ text, dir }: { text: string; dir: string }) =>
    text
        .split('\n')
        .filter((line) => line !== '')
        .map((line) =>
            line
                .replaceAll(realpathSync(dir), '<dir>')
                .replaceAll(dir, '<dir>')
                .replace(/"(seq|first_seq)":\d+/g, '"$1":0')
                .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>')
                .replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
                .replace(/"(\w*_ms)":\d+(\.\d+)?/g, '"$1":0')
                .replace(/\d+(\.\d+)?ms\b/g, '<ms>')
                .replace(/scripted-([a-z-]+)-(\d+)-\d+/g, 'scripted-$1-$2')
        )
        .toSorted()

describe('waits inside a step, in the live file (#632)', () => {
    test('a prepare-slot wait, then a test-slot wait, is in the live file with the ticket and the slots in use while it lasts, and gone once the slot is taken', async () => {
        const practice = await createPracticeRepo({ root, config: CONFIG })
        const file = liveFileIn(root)
        const seen: Record<string, LiveWait | null> = {
            prepare: null,
            test: null,
        }
        const gone = { prepare: false, test: false }
        let watching: Promise<void> = Promise.resolve()
        const launcher = onImplementer({
            during: () => {
                const prepare = hold({
                    slots: PREPARE_SLOTS,
                    limit: 1,
                    count: 1,
                })
                const tests = hold({ slots: TEST_SLOTS, limit: 2, count: 2 })
                watching = (async () => {
                    try {
                        for (const [key, kind, held] of [
                            ['prepare', 'prepare_slot', prepare],
                            ['test', 'test_slot', tests],
                        ] as const) {
                            await eventually({
                                until: () => {
                                    const [wait] =
                                        waitsFor({ file, kind }) ?? []
                                    seen[key] = wait ?? null
                                    return wait !== undefined
                                },
                            })
                            held.release()
                            gone[key] = await eventually({
                                until: () =>
                                    waitsFor({ file, kind })?.length === 0,
                            })
                        }
                    } finally {
                        prepare.release()
                        tests.release()
                    }
                })()
            },
        })

        const { action } = await practice.run({ launcher, live_file: file })
        await watching

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const prepare = seen.prepare
        expect(prepare).not.toBeNull()
        expect({
            ticket: prepare?.ticket,
            in_use: prepare?.in_use,
            slots: prepare?.slots,
        }).toEqual({ ticket: 11, in_use: 1, slots: 1 })
        expect(Number.isNaN(Date.parse(prepare?.since ?? ''))).toBe(false)
        const tests = seen.test
        expect(tests).not.toBeNull()
        expect({
            ticket: tests?.ticket,
            in_use: tests?.in_use,
            slots: tests?.slots,
        }).toEqual({ ticket: 11, in_use: 2, slots: 2 })
        expect(gone).toEqual({ prepare: true, test: true })
    }, 120_000)

    test("a run whose checks waited for a slot leaves the same journal as one that didn't, with no new record", async () => {
        const journals: string[][] = []
        let seen: LiveWait | null = null
        for (const held of [false, true]) {
            const dir = join(root, held ? 'held' : 'free')
            await mkdir(dir)
            const practice = await createPracticeRepo({
                root: dir,
                config: CONFIG,
            })
            const file = liveFileIn(dir)
            let watching: Promise<void> = Promise.resolve()
            const launcher = onImplementer({
                during: () => {
                    if (!held) return
                    const prepare = hold({
                        slots: PREPARE_SLOTS,
                        limit: 1,
                        count: 1,
                    })
                    watching = (async () => {
                        try {
                            await eventually({
                                until: () => {
                                    const [wait] =
                                        waitsFor({
                                            file,
                                            kind: 'prepare_slot',
                                        }) ?? []
                                    seen = wait ?? null
                                    return wait !== undefined
                                },
                            })
                        } finally {
                            prepare.release()
                        }
                    })()
                },
            })

            const { action } = await practice.run({ launcher, live_file: file })
            await watching

            expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
            journals.push(
                comparable({
                    text: readFileSync(practice.journal.file, 'utf8'),
                    dir,
                })
            )
        }

        expect(seen).not.toBeNull()
        expect(journals[1]).toEqual(journals[0] ?? [])
    }, 120_000)
})
