/**
 * Tests for the `luca graph` CLI verb (DAD-P1d).
 *
 * The verb must emit a Mermaid stateDiagram-v2 to stdout, reject an invalid
 * --format (including the RETIRED `json`) with a non-zero exit + zero output,
 * and stay pure (never touch `.luca/`).
 *
 * THE GATE is `emits the golden bytes` below: it drives the REAL command `run`
 * with stdout captured and compares the emitted bytes to the golden captured
 * from the pre-deletion renderer. This is the end of the production call
 * path — `luca graph --format mermaid | diff - <golden>` in test form.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { graphCommand } from './graph.ts'

/** The 13 leaf state ids the Mermaid output must declare. */
const LEAF_IDS = [
    'idle',
    'triage',
    'research',
    'discuss',
    'architect',
    'plan',
    'plan-review',
    'execute',
    'checks',
    'verify',
    'review',
    'learn',
    'finalize',
] as const

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Invoke the command's `run` with an explicit args bag (citty defaults are
 *  NOT applied on a direct `run()` call). */
type RunCtx = { args: Record<string, unknown>; rawArgs: string[]; cmd: unknown }
const runGraph = (args: Record<string, unknown>): unknown =>
    (graphCommand.run as (ctx: RunCtx) => unknown)({
        args,
        rawArgs: [],
        cmd: graphCommand,
    })

/**
 * Run the verb with stdout spied, returning every string written. Captures the
 * calls BEFORE `mockRestore()` — restore clears `mock.calls`.
 */
function captureStdout(args: Record<string, unknown>): string[] {
    const spy = spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
        runGraph(args)
        return spy.mock.calls.map((c) => String(c[0]))
    } finally {
        spy.mockRestore()
    }
}

/** The pre-deletion golden captures, read as raw bytes. */
const GOLDEN_DIR = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'luca-core',
    'src',
    'state',
    '__golden__'
)
const goldenBytes = (name: string): string =>
    readFileSync(join(GOLDEN_DIR, name), 'utf8')

describe('luca graph — mermaid output', () => {
    test('emits the golden bytes for --format mermaid (byte-for-byte)', () => {
        const writes = captureStdout({ format: 'mermaid', annotate: false })
        expect(writes).toHaveLength(1)
        expect(writes[0]!).toBe(goldenBytes('pipeline-graph.mermaid'))
    })

    test('emits the golden bytes for --format mermaid --annotate', () => {
        const writes = captureStdout({ format: 'mermaid', annotate: true })
        expect(writes).toHaveLength(1)
        expect(writes[0]!).toBe(
            goldenBytes('pipeline-graph.annotated.mermaid')
        )
    })

    test('first line is stateDiagram-v2 and declares all 13 leaves', () => {
        const writes = captureStdout({ format: 'mermaid', annotate: false })
        expect(writes).toHaveLength(1)
        const out = writes[0]!
        expect(out.split('\n')[0]).toBe('stateDiagram-v2')
        for (const leaf of LEAF_IDS) {
            const re = new RegExp(`(^|\\n)\\s*${escapeRegex(leaf)} -->`)
            expect(re.test(out)).toBe(true)
        }
    })
})

describe('luca graph — retired json format', () => {
    // `--format json` was `JSON.stringify(pipelineMachine.toJSON())`. The
    // machine is deleted and no honest table equivalent exists, so the format
    // is dropped: it must now be rejected like any other unknown format rather
    // than silently emitting a fabricated schema.
    test('--format json is rejected (exitCode 1, no output)', () => {
        const prevExit = process.exitCode
        try {
            const writes = captureStdout({ format: 'json', annotate: false })
            expect(process.exitCode).toBe(1)
            expect(writes).toHaveLength(0)
        } finally {
            process.exitCode = prevExit ?? 0
        }
    })
})

describe('luca graph — invalid format', () => {
    test('sets exitCode 1 and writes nothing', () => {
        // Snapshot/restore exitCode so a failing verb does not poison the test
        // runner's exit status.
        const prevExit = process.exitCode
        try {
            const writes = captureStdout({ format: 'bogus', annotate: false })
            expect(process.exitCode).toBe(1)
            expect(writes).toHaveLength(0)
        } finally {
            // Restore to 0 when there was no prior code — assigning `undefined`
            // does not clear a set exitCode in Bun, which would leak a non-zero
            // exit to the test runner and fail the file despite 0 test failures.
            process.exitCode = prevExit ?? 0
        }
    })
})

describe('luca graph — purity', () => {
    let cwd: string
    let originalCwd: string

    beforeEach(() => {
        originalCwd = process.cwd()
        cwd = mkdtempSync(join(tmpdir(), 'luca-graph-cli-'))
        process.chdir(cwd)
    })

    afterEach(() => {
        process.chdir(originalCwd)
        rmSync(cwd, { recursive: true, force: true })
    })

    test('running in a temp cwd leaves .luca untouched (ac-11)', () => {
        captureStdout({ format: 'mermaid', annotate: false })
        expect(existsSync(join(cwd, '.luca'))).toBe(false)
    })
})
