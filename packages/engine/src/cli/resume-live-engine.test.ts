import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

/**
 * One engine per run (#701): `luca-run --resume <id>` lists the processes
 * first and refuses to start a second engine on a run that has one, or when
 * it can't tell. The real `luca-run` runs here with a fake `ps` first on its
 * `PATH`, and a throwaway home, so nothing reads the computer's runs.
 */

const LUCA_RUN = join(import.meta.dir, 'luca-run.ts')

const RUN_ID = 'luca-20261028-234324-26rc'

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-resume-live-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** A `ps` on the test's `PATH` that runs `script` (a shell body). */
const fakePs = async ({ script }: { script: string }) => {
    const file = join(dir, 'ps')
    await writeFile(file, `#!/bin/sh\n${script}\n`)
    await chmod(file, 0o755)
}

/** Runs `luca-run --resume <RUN_ID>` with the fake `ps`. */
const resume = async (): Promise<{ exit_code: number; stderr: string }> => {
    const child = Bun.spawn([process.execPath, LUCA_RUN, '--resume', RUN_ID], {
        cwd: dir,
        env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH ?? ''}`,
            HOME: dir,
            XDG_STATE_HOME: join(dir, 'state'),
            XDG_CONFIG_HOME: join(dir, 'config'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stderr, exit_code] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
    ])
    return { exit_code, stderr }
}

describe('luca-run --resume: one engine per run', () => {
    test('a run that already has a live engine is refused, naming its pid, with exit code 1', async () => {
        await fakePs({
            script: `printf '%s\\n' '75023 1 bun /x/luca-run.ts --resume ${RUN_ID}'`,
        })

        const end = await resume()

        expect(end.stderr).toContain(
            `[luca-run] Run ${RUN_ID} already has a live engine (pid 75023). Not starting a second one.`
        )
        expect(end.exit_code).toBe(1)
    }, 30_000)

    test("a process list that can't be read refuses the resume with exit code 1", async () => {
        await fakePs({ script: "echo 'ps: no permission' >&2\nexit 1" })

        const end = await resume()

        expect(end.stderr).toContain(
            `[luca-run] Couldn't check for a live engine on run ${RUN_ID}. Not starting.`
        )
        expect(end.exit_code).toBe(1)
    }, 30_000)
})
