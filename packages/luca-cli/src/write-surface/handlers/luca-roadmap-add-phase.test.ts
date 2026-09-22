import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaRoadmapAddPhaseTool } from './luca-roadmap-add-phase.ts'

const PHASE_DIR_RE = /^[0-9]{2}-[a-z](?:[a-z0-9-]*[a-z0-9])?$/

async function readState(cwd: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cwd, '.luca/state.json'), 'utf-8'))
}

async function seedState(
    cwd: string,
    overrides: Record<string, unknown> = {}
): Promise<void> {
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'idle',
            currentPhase: 0,
            totalPhases: 0,
            roadmap: [],
            ...overrides,
        })
    )
}

/** Parse the tool's JSON payload out of its first text block. */
function payloadOf(r: { content: Array<{ text: string }> }): {
    nn: string
    slug: string
    dir: string
    totalPhases: number
    currentPhase: number
    renamed: Array<{ from: string; to: string }>
} {
    return JSON.parse(r.content[0]!.text)
}

describe('luca_roadmap_add_phase', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-roadmap-add-phase-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('appends a phase, returns { nn, slug, dir }, creates the directory and regenerates roadmap.md', async () => {
        await seedState(cwd)

        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'fix auth',
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const payload = payloadOf(r)
        expect(payload.nn).toBe('01')
        expect(payload.slug).toBe('01-fix-auth')
        expect(payload.dir).toBe('.luca/phases/01-fix-auth')

        // Directory exists and its basename matches the contract slug regex.
        expect(existsSync(join(cwd, payload.dir))).toBe(true)
        expect(PHASE_DIR_RE.test(payload.slug)).toBe(true)

        // roadmap.md regenerated with the new entry.
        const md = await readFile(join(cwd, '.luca/roadmap.md'), 'utf-8')
        expect(md).toContain('01-fix-auth')
        expect(md).toContain('fix auth')

        const state = await readState(cwd)
        expect(state.totalPhases).toBe(1)
        expect((state.roadmap as unknown[]).length).toBe(1)
    })

    test('rejects a name that slugifies to nothing, with an error result', async () => {
        await seedState(cwd)

        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: '!!!',
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })

        expect(r.isError).toBe(true)
        // State untouched — the invalid entry never landed.
        const state = await readState(cwd)
        expect((state.roadmap as unknown[]).length).toBe(0)
        expect(existsSync(join(cwd, '.luca/roadmap.md'))).toBe(false)
    })

    test('rejects a name that starts with a digit (slug must start with a letter)', async () => {
        await seedState(cwd)
        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: '2fa rollout',
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBe(true)
    })

    test('records deps and complexity on the roadmap entry', async () => {
        await seedState(cwd)
        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'ws reconnect',
            deps: ['fix auth'],
            complexity: 'COMPLEX',
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()

        const state = await readState(cwd)
        const entry = (state.roadmap as Array<Record<string, unknown>>)[0]!
        expect(entry.deps).toEqual(['fix auth'])
        expect(entry.complexity).toBe('COMPLEX')
        expect(entry.status).toBe('pending')
    })

    test('succeeds from a NON-idle pipelineStep (phase-agnostic verb)', async () => {
        // The handler itself must carry no allowedPhases restriction — the
        // stage-gate/CLI self-check consults WRITE_COMMAND_PHASES, and a
        // non-empty allowedPhases here would contradict it.
        expect(lucaRoadmapAddPhaseTool.allowedPhases).toBeUndefined()

        await seedState(cwd, {
            pipelineStep: 'execute',
            currentPhase: 1,
            totalPhases: 1,
            roadmap: [{ name: 'fix auth', deps: [], status: 'in-progress' }],
        })

        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'ws reconnect',
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        expect(payloadOf(r).slug).toBe('02-ws-reconnect')
        const state = await readState(cwd)
        expect(state.pipelineStep).toBe('execute')
        // Appending after the active phase never moves it.
        expect(state.currentPhase).toBe(1)
    })

    test('--after inserts mid-roadmap, renumbers, and renames existing phase dirs', async () => {
        await seedState(cwd, {
            pipelineStep: 'plan',
            currentPhase: 1,
            totalPhases: 2,
            roadmap: [
                { name: 'fix auth', deps: [], status: 'complete' },
                { name: 'profile page', deps: [], status: 'pending' },
            ],
        })
        await mkdir(join(cwd, '.luca/phases/01-fix-auth'), { recursive: true })
        await mkdir(join(cwd, '.luca/phases/02-profile-page'), {
            recursive: true,
        })
        await writeFile(
            join(cwd, '.luca/phases/02-profile-page/plan.md'),
            '# plan\n'
        )

        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'ws reconnect',
            after: 1,
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const payload = payloadOf(r)
        expect(payload.slug).toBe('02-ws-reconnect')

        const state = await readState(cwd)
        const names = (state.roadmap as Array<{ name: string }>).map(
            (p) => p.name
        )
        expect(names).toEqual(['fix auth', 'ws reconnect', 'profile page'])
        expect(state.totalPhases).toBe(3)
        // currentPhase 1 is before the insertion point, so it does not move.
        expect(state.currentPhase).toBe(1)

        // The displaced phase's directory was renumbered, contents intact.
        expect(existsSync(join(cwd, '.luca/phases/03-profile-page'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/phases/02-profile-page'))).toBe(
            false
        )
        expect(
            await readFile(
                join(cwd, '.luca/phases/03-profile-page/plan.md'),
                'utf-8'
            )
        ).toBe('# plan\n')
        expect(payload.renamed).toEqual([
            { from: '02-profile-page', to: '03-profile-page' },
        ])
    })

    test('inserting at or before the active phase shifts currentPhase so the active phase stays active', async () => {
        await seedState(cwd, {
            pipelineStep: 'plan',
            currentPhase: 2,
            totalPhases: 2,
            roadmap: [
                { name: 'fix auth', deps: [], status: 'complete' },
                { name: 'profile page', deps: [], status: 'in-progress' },
            ],
        })

        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'ws reconnect',
            after: 1,
        })
        await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })

        const state = await readState(cwd)
        // "profile page" moved from position 2 to 3; currentPhase follows it.
        expect(state.currentPhase).toBe(3)
        expect(
            (state.roadmap as Array<{ name: string }>)[2]!.name
        ).toBe('profile page')
    })

    test('rejects an out-of-range --after', async () => {
        await seedState(cwd)
        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'fix auth',
            after: 5,
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBe(true)
    })

    test('a duplicate name is NOT a collision — slugs are index-prefixed', async () => {
        // <NN>-<kebab> derives NN from the roadmap index, so two identically
        // named phases still get distinct directories. Documented as a test
        // because the obvious-looking "reject duplicate names" guard would be
        // dead code.
        await seedState(cwd, {
            currentPhase: 1,
            totalPhases: 1,
            roadmap: [{ name: 'fix auth', deps: [], status: 'pending' }],
        })
        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'Fix  AUTH',
            after: 0,
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()
        expect(payloadOf(r).slug).toBe('01-fix-auth')
        expect(existsSync(join(cwd, '.luca/phases/01-fix-auth'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/phases/02-fix-auth'))).toBe(false)
    })

    test('bootstraps an absent state.json', async () => {
        const parsed = lucaRoadmapAddPhaseTool.inputSchema.parse({
            name: 'first phase',
        })
        const r = await lucaRoadmapAddPhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()
        const state = await readState(cwd)
        expect(state.pipelineStep).toBe('idle')
        expect(state.totalPhases).toBe(1)
        // First phase on a fresh roadmap activates, mirroring `roadmap create`.
        expect(state.currentPhase).toBe(1)
    })
})
