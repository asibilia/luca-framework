import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'bun:test'

import { spawnDetached } from './spawn-detached'

let dir = ''

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const waitFor = async ({ check }: { check: () => Promise<boolean> }) => {
    for (let tries = 0; tries < 50; tries += 1) {
        if (await check()) return
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
}

test('a detached process writes its output and env to the log file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-board-spawn-'))
    const log_path = join(dir, 'run.log')
    const errors: unknown[] = []

    const { pid } = spawnDetached({
        command: '/bin/sh',
        args: ['-c', 'echo "token=$LUCA_BOARD_TOKEN cwd=$(pwd)"'],
        env: { LUCA_BOARD_TOKEN: 'abc' },
        cwd: dir,
        log_path,
        on_error: (error) => errors.push(error),
    })

    expect(pid).toBeGreaterThan(0)
    const read = () => readFile(log_path, 'utf8').catch(() => '')
    await waitFor({ check: async () => (await read()).includes('token=') })
    expect(await read()).toContain('token=abc')
    expect(errors).toEqual([])
})

test('a command that does not exist reports through on_error', async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-board-spawn-'))
    const errors: unknown[] = []

    spawnDetached({
        command: join(dir, 'no-such-engine'),
        args: [],
        env: {},
        cwd: dir,
        log_path: join(dir, 'run.log'),
        on_error: (error) => errors.push(error),
    })

    await waitFor({ check: async () => errors.length > 0 })
    expect(String(errors[0])).toContain('ENOENT')
})
