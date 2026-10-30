import { describe, expect, test } from 'bun:test'

import {
    ancestorPids,
    findLiveEngine,
    listProcesses,
    listProcessRows,
    liveRunIds,
    resumeRefusal,
    type ProcessRow,
} from './live-runs'

const RUN_ID = 'luca-20261028-234324-26rc'

describe('liveRunIds', () => {
    test('a run is live when a command line names it with --run-id or --resume', () => {
        const live = liveRunIds({
            command_lines: [
                '/home/me/.bun/bin/bun /opt/luca/luca-run.ts --spec 5 --repo /code --run-id r1 --board-plugin luca-board',
                '/home/me/.bun/bin/luca-run --resume r2 --repo /code',
                'bun luca-run.ts --run-id=r3',
            ],
        })

        expect([...live].toSorted()).toEqual(['r1', 'r2', 'r3'])
    })

    test('ids match whole words only, and other flags name no run', () => {
        const live = liveRunIds({
            command_lines: [
                'bun luca-run.ts --resume r1-old --repo /code',
                'vim notes-about-r1.md',
                'bun luca-run.ts --spec 1',
            ],
        })

        expect(live.has('r1')).toBe(false)
        expect([...live]).toEqual(['r1-old'])
    })
})

describe('findLiveEngine: one engine per run', () => {
    test("another engine resuming the run is found by its pid; the check's own process is left out", () => {
        const found = findLiveEngine({
            run_id: RUN_ID,
            processes: [
                {
                    pid: 75023,
                    ppid: 1,
                    command: `bun /x/luca-run.ts --resume ${RUN_ID}`,
                },
                {
                    pid: 80000,
                    ppid: 81000,
                    command: `bun /x/luca-run.ts --resume ${RUN_ID}`,
                },
            ],
            own_pids: [80000],
        })

        expect(found).toEqual({ pid: 75023 })
    })

    test("only the check's own process and its parent find no live engine", () => {
        const found = findLiveEngine({
            run_id: RUN_ID,
            processes: [
                {
                    pid: 80000,
                    ppid: 81000,
                    command: `bun /x/luca-run.ts --resume ${RUN_ID}`,
                },
                {
                    pid: 81000,
                    ppid: 1,
                    command: `zsh -c luca-run --resume ${RUN_ID}`,
                },
            ],
            own_pids: [80000, 81000],
        })

        expect(found).toBeNull()
    })

    test('a grandparent shell whose command line names the run is one of the check’s own processes, not a live engine', () => {
        const processes = [
            {
                pid: 80000,
                ppid: 80500,
                command: `bun /x/luca-run.ts --resume ${RUN_ID}`,
            },
            {
                pid: 80500,
                ppid: 81000,
                command: `caffeinate -i luca-run --resume ${RUN_ID}`,
            },
            {
                pid: 81000,
                ppid: 1,
                command: `zsh -c luca-run --resume ${RUN_ID}`,
            },
        ]
        const own_pids = ancestorPids({ pid: 80000, processes })
        expect(own_pids.toSorted()).toEqual([1, 80000, 80500, 81000])

        expect(
            findLiveEngine({ run_id: RUN_ID, processes, own_pids })
        ).toBeNull()
    })
})

describe('resumeRefusal: one engine per run', () => {
    /** The resuming process 80000's own chain: a `caffeinate` wrapper, then a shell. */
    const ownChain: ProcessRow[] = [
        {
            pid: 80000,
            ppid: 80500,
            command: `bun /x/luca-run.ts --resume ${RUN_ID}`,
        },
        {
            pid: 80500,
            ppid: 81000,
            command: `caffeinate -i luca-run --resume ${RUN_ID}`,
        },
        {
            pid: 81000,
            ppid: 1,
            command: `zsh -c luca-run --resume ${RUN_ID}`,
        },
    ]

    test('every parent of the resuming process that names the run is left out, at any depth', async () => {
        const refusal = await resumeRefusal({
            run_id: RUN_ID,
            list_process_rows: async () => ownChain,
            own_pid: 80000,
            parent_pid: 80500,
        })

        expect(refusal).toBeNull()
    })

    test('another engine on the run beside the own parent chain is refused, naming its pid', async () => {
        const refusal = await resumeRefusal({
            run_id: RUN_ID,
            list_process_rows: async () => [
                ...ownChain,
                {
                    pid: 75023,
                    ppid: 1,
                    command: `bun /x/luca-run.ts --resume ${RUN_ID}`,
                },
            ],
            own_pid: 80000,
            parent_pid: 80500,
        })

        expect(refusal).toBe(
            `[luca-run] Run ${RUN_ID} already has a live engine (pid 75023). Not starting a second one.`
        )
    })
})

describe('listProcesses', () => {
    test('lists every process by its full command line, ps itself included', async () => {
        const lines = await listProcesses()

        expect(lines).toContain('ps -axww -o command=')
    })

    test('listProcessRows parses each process into its pid, its parent pid and its command line', async () => {
        const rows = await listProcessRows()

        expect(rows).toContainEqual(
            expect.objectContaining({
                ppid: process.pid,
                command: 'ps -axww -o pid=,ppid=,command=',
            })
        )
    })
})
