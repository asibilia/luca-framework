import { describe, expect, test } from 'bun:test'

import { listProcesses, liveRunIds } from './live-runs'

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

describe('listProcesses', () => {
    test('lists every process by its full command line, ps itself included', async () => {
        const lines = await listProcesses()

        expect(lines).toContain('ps -axww -o command=')
    })
})
