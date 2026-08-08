/**
 * End-to-end acceptance for `luca roadmap add-phase` / `remove-phase`.
 *
 * These spawn the REAL CLI in a scratch repo. A unit test on the handler
 * alone passes even while the verb is unreachable in practice, because
 * registration has three independent points — the citty leaf, the
 * `WRITE_COMMAND_PHASES` entry (enforced by `runWriteHandler`'s self-check),
 * and the stage-gate bash classifier. Running the binary from a NON-idle
 * pipelineStep is the only check that exercises the first two together; the
 * classifier is bound separately in classify-bash-command(-registry).test.ts.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { handleStageGateHook } from '../../hook/helpers/handle-stage-gate-hook.ts'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..', '..')
const CLI = join(REPO_ROOT, 'packages', 'luca-cli', 'src', 'run.ts')

const PHASE_DIR_RE = /^[0-9]{2}-[a-z](?:[a-z0-9-]*[a-z0-9])?$/

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
    return { code: await proc.exited, stdout, stderr }
}

describe('luca roadmap add-phase / remove-phase (CLI end-to-end)', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-roadmap-verbs-e2e-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    async function seed(state: Record<string, unknown>): Promise<void> {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify(
                {
                    pipelineStep: 'idle',
                    currentPhase: 0,
                    totalPhases: 0,
                    roadmap: [],
                    ...state,
                },
                null,
                2
            )
        )
    }

    test('add-phase from a NON-idle pipelineStep returns { nn, slug, dir }, creates the dir, regenerates roadmap.md', async () => {
        // `execute` is deliberately chosen: the full-replace `roadmap create`
        // is refused here (idle/triage only), so a passing run proves the new
        // verb carries its OWN phase-agnostic WRITE_COMMAND_PHASES entry
        // rather than inheriting `create`'s.
        await seed({
            pipelineStep: 'execute',
            currentPhase: 1,
            totalPhases: 1,
            roadmap: [{ name: 'bootstrap', deps: [], status: 'in-progress' }],
        })

        const r = await runCli(cwd, [
            'roadmap',
            'add-phase',
            '--name',
            'fix auth',
        ])

        expect({ code: r.code, stderr: r.stderr }).toEqual({
            code: 0,
            stderr: '',
        })
        const payload = JSON.parse(r.stdout)
        expect(payload.nn).toBe('02')
        expect(payload.slug).toBe('02-fix-auth')
        expect(payload.dir).toBe('.luca/phases/02-fix-auth')
        expect(PHASE_DIR_RE.test(payload.slug)).toBe(true)
        expect(existsSync(join(cwd, payload.dir))).toBe(true)

        const md = await readFile(join(cwd, '.luca/roadmap.md'), 'utf-8')
        expect(md).toContain('02-fix-auth')
        expect(md).toContain('fix auth')
    }, 30_000)

    test('add-phase exits non-zero on a name that cannot produce a valid slug', async () => {
        await seed({ pipelineStep: 'execute' })
        const r = await runCli(cwd, ['roadmap', 'add-phase', '--name', '!!!'])
        expect(r.code).toBe(1)
        expect(r.stderr).toContain('invalid phase slug')
        expect(existsSync(join(cwd, '.luca/roadmap.md'))).toBe(false)
    }, 30_000)

    test('the full-replace `roadmap create` IS still refused at execute (control)', async () => {
        // Control for the first test: proves `execute` is genuinely a gated
        // step for roadmap writes, so add-phase's success there is meaningful.
        await seed({ pipelineStep: 'execute' })
        await writeFile(
            join(cwd, 'phases.json'),
            JSON.stringify([{ name: 'fix auth' }])
        )
        const r = await runCli(cwd, [
            'roadmap',
            'create',
            '--file',
            join(cwd, 'phases.json'),
        ])
        expect(r.code).toBe(1)
        expect(r.stderr).toContain('refused')
    }, 30_000)

    test('remove-phase from a NON-idle pipelineStep renumbers the tail', async () => {
        await seed({
            pipelineStep: 'execute',
            currentPhase: 1,
            totalPhases: 3,
            roadmap: [
                { name: 'bootstrap', deps: [], status: 'in-progress' },
                { name: 'fix auth', deps: [], status: 'pending' },
                { name: 'ws reconnect', deps: [], status: 'pending' },
            ],
        })
        await mkdir(join(cwd, '.luca/phases/03-ws-reconnect'), {
            recursive: true,
        })

        const r = await runCli(cwd, ['roadmap', 'remove-phase', '--nn', '2'])
        expect({ code: r.code, stderr: r.stderr }).toEqual({
            code: 0,
            stderr: '',
        })
        const payload = JSON.parse(r.stdout)
        expect(payload.removed.slug).toBe('02-fix-auth')
        expect(payload.totalPhases).toBe(2)
        expect(existsSync(join(cwd, '.luca/phases/02-ws-reconnect'))).toBe(true)
    }, 30_000)

    test('the stage-gate hook ALLOWS both verbs at a step where bash-mutate is denied', async () => {
        // Point 3 of the registration trap. `plan` maps to coarse PLANNING,
        // where STAGE_TOOL_MATRIX denies `bash-mutate` — so an unregistered
        // noun/verb would be blocked here. A raw `mkdir -p .luca/phases/...`
        // (what the skills do today) is the control.
        await seed({ pipelineStep: 'plan', currentPhase: 1, totalPhases: 1 })
        const gate = async (command: string) =>
            (
                await handleStageGateHook({
                    stdin: JSON.stringify({
                        tool_name: 'Bash',
                        tool_input: { command },
                    }),
                    cwd,
                })
            ).decision

        expect(await gate('luca roadmap add-phase --name "fix auth"')).toBe(
            'allow'
        )
        expect(await gate('luca roadmap remove-phase --nn 3')).toBe('allow')
        expect(await gate('mkdir -p .luca/phases/02-fix-auth')).toBe('block')
    }, 30_000)

    test('remove-phase help states that it RENUMBERS', async () => {
        // Acceptance: the renumber-vs-gap choice must be discoverable.
        const r = await runCli(cwd, ['roadmap', 'remove-phase', '--help'])
        expect(r.stdout + r.stderr).toContain('RENUMBERS')
    }, 30_000)
})
