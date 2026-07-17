/**
 * DAD-P2 persistent-runner acceptance tests (POSIX-only runtime spikes).
 *
 * These are RUNTIME INTEGRATION tests: they spawn real `luca` processes and
 * open real unix sockets. They feed the go/no-go decision (Design/02 §7). Each
 * maps to an acceptance criterion:
 *
 *   test 1 — parity (ac-05):        daemon-up and daemon-down produce a
 *                                   byte-identical state.json for the same
 *                                   event sequence.
 *   test 2 — degradation (ac-06):   kill -9 the daemon mid-run → the next
 *                                   advance succeeds via the cold path (exit 0,
 *                                   no error text).
 *   test 3 — governance (ac-07):    the ownerSessionId bystander exemption is
 *                                   identical daemon-vs-cold (hook-driven).
 *   test 4 — lock hygiene           (ac-08) `luca stop` removes lock.json;
 *                                   (ac-09.1) after kill -9 a cold advance exits
 *                                   0; (ac-09.2) forceUnlock reaps the stale
 *                                   dead-pid lock so a fresh `luca start`
 *                                   re-acquires.
 *   test 5 — latency (ac-10):       daemon advance p95 (≥20 samples, warmup) ≤
 *                                   cold p95 + 15ms.
 *
 * A miss on the runtime spikes (2 / 4b / 5) is a legitimate NO-GO input, not a
 * hard failure of the suite's design.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaStateAdvanceTool } from '../write-surface/index.ts'
import { handleStageGateHook } from '../hook/helpers/handle-stage-gate-hook.ts'
import { sendRequest } from './protocol.ts'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const CLI = join(REPO_ROOT, 'packages', 'luca-cli', 'src', 'run.ts')

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
}

const createdDirs: string[] = []
const liveDaemons: ReturnType<typeof Bun.spawn>[] = []

afterEach(async () => {
    for (const proc of liveDaemons.splice(0)) {
        try {
            proc.kill(9)
        } catch {
            // already gone
        }
    }
    // Give the OS a beat to release sockets before the next test.
    await sleep(30)
    for (const dir of createdDirs.splice(0)) {
        try {
            rmSync(dir, { recursive: true, force: true })
        } catch {
            // best-effort
        }
    }
})

function seedRepo(extra: Record<string, unknown> = {}): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-p2-'))
    createdDirs.push(dir)
    mkdirSync(join(dir, '.luca'), { recursive: true })
    const state = {
        oversight: 'full-auto',
        pipelineStep: 'execute',
        currentPhase: 1,
        totalPhases: 1,
        complexity: 'COMPLEX',
        roadmap: [
            {
                name: 'p',
                deps: [],
                status: 'in-progress',
                complexity: 'COMPLEX',
            },
        ],
        ...extra,
    }
    writeFileSync(
        join(dir, '.luca', 'state.json'),
        `${JSON.stringify(state, null, 2)}\n`
    )
    return dir
}

async function runCli(
    cwd: string,
    args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(['bun', CLI, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env },
    })
    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    return { code, stdout, stderr }
}

async function startDaemon(cwd: string): Promise<ReturnType<typeof Bun.spawn>> {
    const proc = Bun.spawn(['bun', CLI, 'start'], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env },
    })
    liveDaemons.push(proc)
    const sock = join(cwd, '.luca', 'tmp', 'runner.sock')
    for (let i = 0; i < 120 && !existsSync(sock); i++) await sleep(25)
    if (!existsSync(sock)) {
        const err = await new Response(proc.stderr).text()
        throw new Error(`daemon did not create socket within 3s: ${err}`)
    }
    // Confirm it actually answers before returning.
    for (let i = 0; i < 40; i++) {
        const pong = await sendRequest(cwd, { cmd: 'ping' }, 200)
        if (!('unreachable' in pong) && pong.ok) return proc
        await sleep(25)
    }
    throw new Error('daemon socket present but not answering ping')
}

const p95 = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.ceil(0.95 * s.length) - 1] ?? s[s.length - 1] ?? 0
}

describe('DAD-P2 runner acceptance (runtime spikes, POSIX-only)', () => {
    test('test 1 — parity: daemon-up ≡ daemon-down state.json', async () => {
        const seq = ['checks', 'execute', 'checks', 'verify']
        const withDaemon = seedRepo()
        const coldOnly = seedRepo()

        const daemon = await startDaemon(withDaemon)
        for (const to of seq) {
            const r = await runCli(withDaemon, [
                'state',
                'advance',
                `--to-step=${to}`,
            ])
            expect(r.code).toBe(0)
            expect(r.stdout).toContain(`→ '${to}'`)
        }
        // Prove the routes actually went through the daemon (mirror advanced).
        const status = await sendRequest(withDaemon, { cmd: 'status' }, 500)
        expect('unreachable' in status).toBe(false)
        daemon.kill(9)

        for (const to of seq) {
            const r = await runCli(coldOnly, [
                'state',
                'advance',
                `--to-step=${to}`,
            ])
            expect(r.code).toBe(0)
        }

        const a = readFileSync(join(withDaemon, '.luca', 'state.json'), 'utf8')
        const b = readFileSync(join(coldOnly, '.luca', 'state.json'), 'utf8')
        expect(a).toBe(b)
    })

    test('test 2 — degradation: kill -9 daemon, next advance goes cold (exit 0)', async () => {
        const dir = seedRepo()
        const daemon = await startDaemon(dir)

        const first = await runCli(dir, ['state', 'advance', '--to-step=checks'])
        expect(first.code).toBe(0)

        // Hard-kill the daemon; leaves a stale socket + dead-pid lock.
        daemon.kill(9)
        await sleep(120)

        const second = await runCli(dir, ['state', 'advance', '--to-step=execute'])
        expect(second.code).toBe(0)
        expect(second.stdout).toContain("→ 'execute'")
        // No error text surfaced to the user on the degraded path.
        expect(second.stderr.trim()).toBe('')

        const state = JSON.parse(
            readFileSync(join(dir, '.luca', 'state.json'), 'utf8')
        )
        expect(state.pipelineStep).toBe('execute')
    })

    test('test 3 — governance: bystander exemption identical daemon-vs-cold', async () => {
        // Owner is stamped in state; both a gated owner action and a bystander
        // action are evaluated by the hook with the daemon UP and DOWN.
        const dir = seedRepo({ ownerSessionId: 'owner-1' })

        const ownerPayload = JSON.stringify({
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m x' },
            session_id: 'owner-1',
        })
        const bystanderPayload = JSON.stringify({
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m x' },
            session_id: 'bystander-2',
        })

        // Cold (no daemon).
        const ownerCold = await handleStageGateHook({ stdin: ownerPayload, cwd: dir })
        const bystanderCold = await handleStageGateHook({
            stdin: bystanderPayload,
            cwd: dir,
        })

        // Daemon up — the hook reads state.json only, so it must be unaffected.
        await startDaemon(dir)
        const ownerHot = await handleStageGateHook({ stdin: ownerPayload, cwd: dir })
        const bystanderHot = await handleStageGateHook({
            stdin: bystanderPayload,
            cwd: dir,
        })

        // Identical daemon-vs-cold.
        expect(ownerHot.decision).toBe(ownerCold.decision)
        expect(bystanderHot.decision).toBe(bystanderCold.decision)
        // And the exemption is actually exercised: owner blocked, bystander allowed.
        expect(ownerCold.decision).toBe('block')
        expect(bystanderCold.decision).toBe('allow')
    })

    test('test 4a — lock hygiene: luca stop removes lock.json (ac-08)', async () => {
        const dir = seedRepo()
        await startDaemon(dir)
        expect(existsSync(join(dir, '.luca', 'lock.json'))).toBe(true)

        const stop = await runCli(dir, ['stop'])
        expect(stop.code).toBe(0)
        expect(existsSync(join(dir, '.luca', 'lock.json'))).toBe(false)
        expect(existsSync(join(dir, '.luca', 'tmp', 'runner.sock'))).toBe(false)
    })

    test('test 4b — lock hygiene: kill -9 then cold advance (ac-09.1) + fresh start re-acquires (ac-09.2)', async () => {
        const dir = seedRepo()
        const daemon = await startDaemon(dir)
        const lockPath = join(dir, '.luca', 'lock.json')
        const deadPid = JSON.parse(readFileSync(lockPath, 'utf8')).pid

        daemon.kill(9)
        await sleep(120)

        // ac-09.1: the dead-pid lock.json lingers, but a cold advance still
        // exits 0 (state.json.lock is independent of the daemon lock).
        expect(existsSync(lockPath)).toBe(true)
        const cold = await runCli(dir, ['state', 'advance', '--to-step=checks'])
        expect(cold.code).toBe(0)

        // ac-09.2: a fresh `luca start` forceUnlock-reaps the stale dead-pid
        // lock and re-acquires it under a NEW pid.
        const daemon2 = await startDaemon(dir)
        const newLock = JSON.parse(readFileSync(lockPath, 'utf8'))
        expect(newLock.pid).not.toBe(deadPid)
        expect(newLock.pid).toBe(daemon2.pid)
    })

    test('test 5 — latency: daemon advance p95 ≤ cold p95 + 15ms (ac-10)', async () => {
        const SAMPLES = 24
        const WARMUP = 4
        const alt = (i: number): 'checks' | 'execute' =>
            i % 2 === 0 ? 'checks' : 'execute'

        // Cold: direct in-process handler calls (the write path the daemon
        // reuses). This isolates the daemon's added IPC overhead.
        const coldDir = seedRepo()
        const coldTimes: number[] = []
        for (let i = 0; i < WARMUP + SAMPLES; i++) {
            const t0 = performance.now()
            await lucaStateAdvanceTool.handler(
                { toStep: alt(i) },
                { cwd: coldDir }
            )
            const dt = performance.now() - t0
            if (i >= WARMUP) coldTimes.push(dt)
        }

        // Daemon: same advance over the socket (handler + IPC round-trip).
        const hotDir = seedRepo()
        await startDaemon(hotDir)
        const hotTimes: number[] = []
        for (let i = 0; i < WARMUP + SAMPLES; i++) {
            const t0 = performance.now()
            const resp = await sendRequest(
                hotDir,
                { cmd: 'advance', to: alt(i) },
                2000
            )
            const dt = performance.now() - t0
            expect('unreachable' in resp).toBe(false)
            if (i >= WARMUP) hotTimes.push(dt)
        }

        const coldP95 = p95(coldTimes)
        const hotP95 = p95(hotTimes)
        // Report the numbers so the go/no-go has evidence even on a pass.
        console.log(
            `latency p95 — cold=${coldP95.toFixed(2)}ms hot=${hotP95.toFixed(2)}ms ` +
                `delta=${(hotP95 - coldP95).toFixed(2)}ms (threshold +15ms)`
        )
        expect(hotP95).toBeLessThanOrEqual(coldP95 + 15)
    })
})
