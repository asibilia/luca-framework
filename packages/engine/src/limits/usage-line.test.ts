import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    fileUsageLine,
    readSharedReadings,
    readUsageLines,
    shareReadings,
    sharedReadings,
    type WindowReading,
} from './usage-line'

import { decide } from '../core/decide'
import {
    epochSeconds,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The files behind the usage line (#434): the readings every run shares in
 * one file in Luca's state folder, and the `luca-board` usage lines the
 * engine reads straight from the plugin's settings file. Real files in a
 * temp dir; two `fileUsageLine`s on one shared file stand for two runs.
 */

const START = Date.parse('2026-01-01T00:00:00.000Z')
const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'
const FIVE_HOUR_RESET = '2026-01-01T03:00:00.000Z'

/** `n` minutes after the start, in ms. */
const minute = (n: number): number => START + n * 60_000

const weekly = ({
    percent,
    arrival,
}: {
    percent: number
    arrival: number
}): WindowReading => ({
    window: 'seven_day',
    percent,
    resets_at: epochSeconds(WEEKLY_RESET),
    arrival,
})

const fiveHour = ({
    percent,
    arrival,
    resets_at,
}: {
    percent: number
    arrival: number
    resets_at?: string
}): WindowReading => ({
    window: 'five_hour',
    percent,
    resets_at: epochSeconds(resets_at ?? FIVE_HOUR_RESET),
    arrival,
})

let root = ''
let shared = ''
let lines = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-usage-files-'))
    shared = join(root, 'state', 'plan-readings.json')
    lines = join(root, 'state', 'board', 'usage-lines.json')
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** The shared file's readings at `now`, as window readings. */
const readBack = async (now = minute(10)): Promise<WindowReading[]> =>
    sharedReadings({
        readings: await readSharedReadings({ file: shared, now }),
    })

/** One run of the fixtures' spec, with ticket #11's test-writer next. */
const records = () =>
    recordsFrom({
        entries: [
            ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
            ...withInstalls({
                entries: [
                    runBranchCreated(),
                    ...ticketBuilt({ ticket: 11 }).slice(0, 2),
                ],
            }),
        ],
    })

const runOn = () =>
    fileUsageLine({
        lines_file: lines,
        shared_file: shared,
        now: () => minute(10),
        log: () => undefined,
    })

describe('the shared readings file', () => {
    test('a reading one run shares is seen by a second run, which pauses at the line', async () => {
        const first = runOn()
        const second = runOn()
        expect(
            decide({
                records: records(),
                usage_lines: await second.read_lines(),
                shared_readings: await second.read_shared(),
            })
        ).toMatchObject({ type: 'launch_agent', role: 'test-writer' })

        await first.share([weekly({ percent: 82, arrival: minute(5) })])

        expect(
            decide({
                records: records(),
                usage_lines: await second.read_lines(),
                shared_readings: await second.read_shared(),
            })
        ).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
            line: 80,
            percent: 82,
            resets_at: WEEKLY_RESET,
        })
    })

    test('an older reading shared later does not replace the newer one in the file', async () => {
        await shareReadings({
            file: shared,
            readings: [weekly({ percent: 82, arrival: minute(5) })],
        })
        await shareReadings({
            file: shared,
            readings: [weekly({ percent: 50, arrival: minute(1) })],
        })

        expect(await readBack()).toEqual([
            weekly({ percent: 82, arrival: minute(5) }),
        ])
    })

    test('a newer reading replaces the older one, and each window keeps its own newest reading', async () => {
        await shareReadings({
            file: shared,
            readings: [
                weekly({ percent: 60, arrival: minute(1) }),
                fiveHour({ percent: 40, arrival: minute(2) }),
            ],
        })
        await shareReadings({
            file: shared,
            readings: [
                weekly({ percent: 70, arrival: minute(3) }),
                weekly({ percent: 82, arrival: minute(6) }),
                weekly({ percent: 75, arrival: minute(4) }),
            ],
        })

        const back = await readBack()
        expect(back).toHaveLength(2)
        expect(back).toContainEqual(weekly({ percent: 82, arrival: minute(6) }))
        expect(back).toContainEqual(
            fiveHour({ percent: 40, arrival: minute(2) })
        )
    })

    test('the file is written whole, with no temp file left beside it', async () => {
        await shareReadings({
            file: shared,
            readings: [weekly({ percent: 82, arrival: minute(5) })],
        })
        await shareReadings({
            file: shared,
            readings: [fiveHour({ percent: 30, arrival: minute(6) })],
        })

        expect(await readdir(join(root, 'state'))).toEqual([
            'plan-readings.json',
        ])
        const text = await readFile(shared, 'utf8')
        expect(() => JSON.parse(text)).not.toThrow()
    })

    test('a window whose reset has passed is dropped on read, and the others are kept', async () => {
        await shareReadings({
            file: shared,
            readings: [
                weekly({ percent: 82, arrival: minute(5) }),
                fiveHour({ percent: 95, arrival: minute(5) }),
            ],
        })

        const afterFiveHourReset = Date.parse(FIVE_HOUR_RESET) + 60_000
        expect(await readBack(afterFiveHourReset)).toEqual([
            weekly({ percent: 82, arrival: minute(5) }),
        ])
        expect(await readBack(Date.parse(WEEKLY_RESET) + 60_000)).toEqual([])
    })

    test('a missing or broken shared file reads as no readings', async () => {
        const read = () => readSharedReadings({ file: shared, now: minute(10) })
        expect(await read()).toEqual([])
        await mkdir(join(root, 'state'), { recursive: true })
        await writeFile(shared, '{ not json')
        expect(await read()).toEqual([])
    })

    test('sharing over a broken file writes a good one', async () => {
        await mkdir(join(root, 'state'), { recursive: true })
        await writeFile(shared, '{ not json')

        await shareReadings({
            file: shared,
            readings: [weekly({ percent: 82, arrival: minute(5) })],
        })

        expect(await readBack()).toEqual([
            weekly({ percent: 82, arrival: minute(5) }),
        ])
    })
})

describe('the usage lines file', () => {
    test('a missing or broken lines file reads as the defaults, 80 weekly and 85 five-hour', async () => {
        expect(await readUsageLines({ file: lines })).toEqual({
            weekly_line: 80,
            five_hour_line: 85,
        })
        await mkdir(join(root, 'state', 'board'), { recursive: true })
        await writeFile(lines, 'not json at all')
        expect(await readUsageLines({ file: lines })).toEqual({
            weekly_line: 80,
            five_hour_line: 85,
        })
    })

    test('the lines in the file are read, and a missing one reads as its default', async () => {
        await mkdir(join(root, 'state', 'board'), { recursive: true })
        await writeFile(lines, JSON.stringify({ weekly_line: 90 }))

        expect(await readUsageLines({ file: lines })).toEqual({
            weekly_line: 90,
            five_hour_line: 85,
        })
    })

    test('a run reading its lines from the file obeys a raised line: 82% does not pause it at a weekly line of 90', async () => {
        const run = runOn()
        await run.share([weekly({ percent: 82, arrival: minute(5) })])
        await mkdir(join(root, 'state', 'board'), { recursive: true })
        await writeFile(
            lines,
            JSON.stringify({ weekly_line: 90, five_hour_line: 85 })
        )

        expect(
            decide({
                records: records(),
                usage_lines: await run.read_lines(),
                shared_readings: await run.read_shared(),
            })
        ).toMatchObject({ type: 'launch_agent', role: 'test-writer' })
    })

    test("a share that fails is logged, and doesn't throw", async () => {
        await mkdir(join(root, 'state'), { recursive: true })
        const logged: string[] = []
        const run = fileUsageLine({
            lines_file: lines,
            // A folder where the file should be, so the rename fails.
            shared_file: join(root, 'state'),
            now: () => minute(10),
            log: (line) => logged.push(line),
        })

        await run.share([weekly({ percent: 82, arrival: minute(5) })])

        expect(logged).toHaveLength(1)
    })
})
