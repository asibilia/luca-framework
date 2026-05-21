import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { validateVerificationRef } from './validate-verification-ref.ts'

const baseState = {
    currentPhase: 1,
    pipelineStep: 'execute',
    roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
}

async function setupProject(
    cwd: string,
    verifyContent: unknown
): Promise<void> {
    await mkdir(join(cwd, '.luca/phases/01-auth-rewrite'), {
        recursive: true,
    })
    await writeFile(join(cwd, '.luca/state.json'), JSON.stringify(baseState))
    if (verifyContent !== null) {
        await writeFile(
            join(cwd, '.luca/phases/01-auth-rewrite/verify.json'),
            JSON.stringify(verifyContent)
        )
    }
}

describe('validateVerificationRef', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-verify-ref-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns null when criterion is met + has evidence + status=PASS', async () => {
        await setupProject(cwd, {
            status: 'PASS',
            criteria: [
                {
                    criterionId: 'ac-01',
                    description: 'auth middleware rewritten',
                    met: true,
                    evidence: 'src/middleware/auth.ts:42',
                    blocking: true,
                },
            ],
        })

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-01' },
        })
        expect(r).toBeNull()
    })

    test('rejects when verify.json is missing', async () => {
        await setupProject(cwd, null)

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-01' },
        })
        expect(r).not.toBeNull()
        expect(r!.code).toBe('VERIFY_FILE_MISSING')
    })

    test('rejects when there is no active phase', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ currentPhase: 0 })
        )

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-01' },
        })
        expect(r).not.toBeNull()
        expect(r!.code).toBe('NO_ACTIVE_PHASE')
    })

    test('rejects when criterion is not present in verify.json', async () => {
        await setupProject(cwd, {
            status: 'PASS',
            criteria: [
                {
                    criterionId: 'ac-01',
                    met: true,
                    evidence: 'x',
                    blocking: true,
                },
            ],
        })

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-99' },
        })
        expect(r).not.toBeNull()
        expect(r!.code).toBe('CRITERION_NOT_FOUND')
    })

    test('rejects when criterion is met:false', async () => {
        await setupProject(cwd, {
            status: 'FAIL',
            criteria: [
                {
                    criterionId: 'ac-01',
                    met: false,
                    evidence: 'x',
                    blocking: true,
                },
            ],
        })

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-01' },
        })
        expect(r).not.toBeNull()
        expect(r!.code).toBe('CRITERION_UNMET')
    })

    test('rejects when criterion has empty evidence', async () => {
        await setupProject(cwd, {
            status: 'PASS',
            criteria: [
                {
                    criterionId: 'ac-01',
                    met: true,
                    evidence: '',
                    blocking: true,
                },
            ],
        })

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-01' },
        })
        expect(r).not.toBeNull()
        expect(r!.code).toBe('CRITERION_NO_EVIDENCE')
    })

    test('rejects when parent verify status is not PASS', async () => {
        await setupProject(cwd, {
            status: 'STALLED',
            criteria: [
                {
                    criterionId: 'ac-01',
                    met: true,
                    evidence: 'x',
                    blocking: true,
                },
            ],
        })

        const r = await validateVerificationRef({
            cwd,
            ref: { criterionId: 'ac-01' },
        })
        expect(r).not.toBeNull()
        expect(r!.code).toBe('VERIFY_NOT_PASS')
    })
})
