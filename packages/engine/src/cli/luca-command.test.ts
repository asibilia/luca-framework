import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import {
    implemented,
    intakePassed,
    practiceTicket,
    reviewed,
    testsWritten,
} from '../testing/build-fixtures'
import { makeCheckouts } from '../testing/checkouts-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The `luca` command end to end (seam 4): the engine package's `luca` bin,
 * run as its own Bun process in a throwaway folder that is not a repo.
 */

const ENGINE_DIR = join(import.meta.dir, '..', '..')

const EnginePackageSchema = z.looseObject({
    bin: z.record(z.string(), z.string()).default({}),
})

const enginePackage = async () =>
    EnginePackageSchema.parse(
        JSON.parse(await Bun.file(join(ENGINE_DIR, 'package.json')).text())
    )

/** The file the engine package's `luca` bin points at. */
const lucaBin = async (): Promise<string> => {
    const file = (await enginePackage()).bin.luca
    if (file === undefined) throw new Error('The engine has no `luca` bin')
    return join(ENGINE_DIR, file)
}

/** What v13's global hook hands `luca hook stage-gate` on stdin. */
const HOOK_INPUT = JSON.stringify({
    session_id: 'abc',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    cwd: '/somewhere',
})

let cwd = ''

beforeEach(async () => {
    cwd = realpathSync(await mkdtemp(join(tmpdir(), 'luca-command-')))
})

afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
})

/** Runs `luca <args>` in `cwd` and gathers its exit code and output. */
const luca = async ({
    args,
    stdin = '',
}: {
    args: string[]
    stdin?: string
}): Promise<{ exit_code: number; stdout: string; stderr: string }> => {
    const child = Bun.spawn([process.execPath, await lucaBin(), ...args], {
        cwd,
        stdin: new Blob([stdin]),
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, exit_code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    return { exit_code, stdout, stderr }
}

describe('luca hook', () => {
    test('luca hook stage-gate exits 0 and prints nothing', async () => {
        const end = await luca({
            args: ['hook', 'stage-gate'],
            stdin: HOOK_INPUT,
        })

        expect(end).toEqual({ exit_code: 0, stdout: '', stderr: '' })
    }, 30_000)

    test('any other luca hook call exits 0 and prints nothing', async () => {
        const end = await luca({
            args: ['hook', 'post-tool-use', '--strict', 'extra'],
            stdin: HOOK_INPUT,
        })

        expect(end).toEqual({ exit_code: 0, stdout: '', stderr: '' })
    }, 30_000)

    test('luca hook with nothing on stdin exits 0 and prints nothing', async () => {
        const end = await luca({ args: ['hook', 'stage-gate'] })

        expect(end).toEqual({ exit_code: 0, stdout: '', stderr: '' })
    }, 30_000)
})

describe('luca subcommands', () => {
    test('an unknown subcommand prints usage and exits 2', async () => {
        const end = await luca({ args: ['frobnicate'] })

        expect(end.exit_code).toBe(2)
        const output = `${end.stdout}\n${end.stderr}`
        expect(output).toMatch(/usage/i)
        expect(output).toContain('setup')
    }, 30_000)

    test('luca --help lists the subcommands', async () => {
        const end = await luca({ args: ['--help'] })

        expect(end.exit_code).toBe(0)
        expect(`${end.stdout}\n${end.stderr}`).toContain('setup')
    }, 30_000)

    test('luca setup is reached through luca, and a bad flag prints its usage and exits 2', async () => {
        const end = await luca({ args: ['setup', '--no-such-flag'] })

        expect(end.exit_code).toBe(2)
        expect(`${end.stdout}\n${end.stderr}`).toContain('luca setup')
    }, 30_000)

    test('luca --help lists init', async () => {
        const end = await luca({ args: ['--help'] })

        expect(end.exit_code).toBe(0)
        expect(`${end.stdout}\n${end.stderr}`).toMatch(/^\s+init\b/m)
    }, 30_000)

    test('luca init is reached through luca, and a bad flag prints its usage and exits 2', async () => {
        const end = await luca({ args: ['init', '--no-such-flag'] })

        expect(end.exit_code).toBe(2)
        const output = `${end.stdout}\n${end.stderr}`
        expect(output).toContain('luca init')
        expect(output).toContain('--skip-muninndb')
    }, 30_000)

    test('luca --help lists upgrade', async () => {
        const end = await luca({ args: ['--help'] })

        expect(end.exit_code).toBe(0)
        expect(`${end.stdout}\n${end.stderr}`).toMatch(/^\s+upgrade\b/m)
    }, 30_000)

    test('luca upgrade is reached through luca, and a bad flag prints its usage with --to and exits 2', async () => {
        const end = await luca({ args: ['upgrade', '--no-such-flag'] })

        expect(end.exit_code).toBe(2)
        const output = `${end.stdout}\n${end.stderr}`
        expect(output).toContain('luca upgrade')
        expect(output).toContain('--to')
    }, 30_000)

    test('luca init usage names --skip-skills', async () => {
        const end = await luca({ args: ['init', '--no-such-flag'] })

        expect(end.exit_code).toBe(2)
        expect(`${end.stdout}\n${end.stderr}`).toContain('--skip-skills')
    }, 30_000)

    test('luca --help lists doctor', async () => {
        const end = await luca({ args: ['--help'] })

        expect(end.exit_code).toBe(0)
        expect(`${end.stdout}\n${end.stderr}`).toMatch(/^\s+doctor\b/m)
    }, 30_000)

    test('luca doctor is reached through luca, and a bad flag prints its usage and exits 2', async () => {
        const end = await luca({ args: ['doctor', '--no-such-flag'] })

        expect(end.exit_code).toBe(2)
        const output = `${end.stdout}\n${end.stderr}`
        expect(output).toContain('luca doctor')
        expect(output).toContain('--fix')
    }, 30_000)
})

describe('luca models', () => {
    /** A run on `repo` of one joined ticket, its test-writer on `model`. */
    const modelRun = ({
        repo,
        model,
    }: {
        repo: string
        model: string
    }): JournalRecord[] => {
        const start = (role: 'test-writer' | 'implementer', on: string) =>
            ({
                kind: 'agent_started',
                ticket: 11,
                role,
                content: { role, prompt: 'p', model: on },
            }) satisfies JournalEntry
        return recordsFrom({
            entries: [
                ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
                start('test-writer', model),
                testsWritten({ ticket: 11 }),
                start('implementer', 'opus'),
                implemented({ ticket: 11 }),
                reviewed({ ticket: 11 }),
                {
                    kind: 'ticket_joined',
                    ticket: 11,
                    role: null,
                    content: { ok: true, shas: ['r1'], lines_changed: 40 },
                },
            ],
        }).map((record) =>
            record.kind === 'run_started'
                ? { ...record, content: { ...record.content, repo } }
                : record
        )
    }

    /** Every file and folder under `dir` but `skip`, with its time and text. */
    const snapshot = async (
        dir: string,
        skip: string[] = []
    ): Promise<Record<string, string>> => {
        const found: Record<string, string> = {}
        for (const name of await readdir(dir, { recursive: true })) {
            if (skip.some((top) => name === top || name.startsWith(`${top}/`)))
                continue
            const path = join(dir, name)
            const info = await stat(path)
            found[name] = info.isFile()
                ? `${info.mtimeMs} ${await Bun.file(path).text()}`
                : 'folder'
        }
        return found
    }

    test('luca --help lists models', async () => {
        const end = await luca({ args: ['--help'] })

        expect(end.exit_code).toBe(0)
        expect(`${end.stdout}\n${end.stderr}`).toMatch(/^\s+models\b/m)
    }, 30_000)

    test("luca models prints the report for the current repo's runs, and writes nothing", async () => {
        const checkouts = await makeCheckouts({ dir: join(cwd, 'git') })
        const runs_dir = join(cwd, 'runs')
        const ours = modelRun({ repo: checkouts.main, model: 'sonnet' })
        const theirs = modelRun({ repo: checkouts.outside, model: 'haiku' })
        for (const [run_id, records] of [
            ['ours', ours],
            ['theirs', theirs],
        ] as const) {
            await mkdir(join(runs_dir, run_id), { recursive: true })
            await Bun.write(
                join(runs_dir, run_id, 'journal.jsonl'),
                records.map((record) => JSON.stringify(record)).join('\n') +
                    '\n'
            )
        }
        await Bun.write(
            join(checkouts.main, '.luca', 'config.json'),
            JSON.stringify({ checks: { test: 'bun test' } })
        )
        const before = {
            runs: await snapshot(runs_dir),
            repo: await snapshot(checkouts.main, ['.git']),
        }

        const child = Bun.spawn([process.execPath, await lucaBin(), 'models'], {
            cwd: checkouts.main,
            env: { ...process.env, LUCA_RUNS_DIR: runs_dir },
            stdout: 'pipe',
            stderr: 'pipe',
        })
        const [stdout, exit_code] = await Promise.all([
            new Response(child.stdout).text(),
            child.exited,
        ])

        expect(exit_code).toBe(0)
        // Loaded here, so the other tests in this file run without it.
        const { formatModelReport, scoreModels } =
            await import('../models/model-score')
        const expected = formatModelReport({
            report: scoreModels({ runs: [ours] }),
        }).trim()
        const both = formatModelReport({
            report: scoreModels({ runs: [ours, theirs] }),
        }).trim()
        expect(expected).not.toBe(both)
        expect(stdout).toContain(expected)
        expect(stdout).not.toContain(both)
        expect({
            runs: await snapshot(runs_dir),
            repo: await snapshot(checkouts.main, ['.git']),
        }).toEqual(before)
    }, 30_000)
})

describe('the engine package bins', () => {
    test('has a luca bin and a luca-run bin, and no luca-setup bin', async () => {
        const { bin } = await enginePackage()

        expect(bin.luca).toBeDefined()
        expect(bin['luca-run']).toBe('src/cli/luca-run.ts')
        expect(bin['luca-setup']).toBeUndefined()
    })
})
