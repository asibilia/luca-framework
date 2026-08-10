/**
 * Regression guard for the `session-resume` skill body.
 *
 * ## Why this compiles the manifest instead of reading `index.ts`
 *
 * Asserting tokens against the SOURCE passes on text sitting in a comment or
 * an unreferenced constant — and this file's docblock deliberately *names*
 * `.luca/telemetry/` and `.continue-here.md` while explaining why neither is
 * read. A source-token guard would therefore be green in exactly the case it
 * is meant to catch. So: run the real compiler (`compile`) over the real
 * `sessionResumeSkill` export and assert the emitted
 * `skills/session-resume/SKILL.md` bytes — what a harness actually loads.
 * A token moved into a comment, a dead constant, or a body no longer passed
 * to `defineSkill` does not survive that round trip.
 *
 * The manifest is deliberately scoped to this one artifact rather than the
 * whole of `ARTIFACTS`: every invariant below is single-artifact, and the
 * emit path exercised is identical. (`record-recall.test.ts` compiles the
 * full corpus because ITS invariant is corpus-wide.)
 *
 * ## The invariants
 *
 * 1. The readback is LEDGER-sourced. The telemetry sink was narrowed to the
 *    recall family; `signal.*` no longer exists, and re-pointing this skill
 *    back at `.luca/telemetry/` would silently produce an empty digest.
 * 2. The pause↔resume loop closes through the `session:phase-boundary-handoff`
 *    memory. The skill previously claimed to process a `.continue-here.md`
 *    checkpoint that no producer writes and `LUCA_DIR_CONTRACT` forbids.
 * 3. The two behaviours that justify this skill's existence next to
 *    `progress` — the rework readback and the partially-filled `audits/`
 *    detection — are present. Losing either makes the skill a strict subset of
 *    `progress` and it should then be folded, not left as a duplicate surface.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

import { sessionResumeSkill } from './index.ts'

import { compile } from '../../../compile/index.ts'

let outputRoot: string
/** The emitted SKILL.md bytes a harness loads. */
let emitted: string

beforeAll(async () => {
    outputRoot = mkdtempSync(join(tmpdir(), 'luca-session-resume-'))
    await compile([sessionResumeSkill], outputRoot)
    emitted = readFileSync(
        join(outputRoot, 'skills', 'session-resume', 'SKILL.md'),
        'utf8'
    )
})

afterAll(() => {
    if (outputRoot) rmSync(outputRoot, { recursive: true, force: true })
})

describe('session-resume ships at all', () => {
    test('the compile emitted a non-trivial SKILL.md', () => {
        expect(emitted.length).toBeGreaterThan(500)
    })
})

describe('the readback reads the ledger, not the retired telemetry sink', () => {
    test('no compiled directive points at .luca/telemetry', () => {
        expect(emitted).not.toContain('.luca/telemetry')
    })

    test('no compiled directive references a retired signal.* kind', () => {
        expect(emitted).not.toContain('signal.satisfaction')
        expect(emitted).not.toContain('signal.failure')
    })

    test('the rework readback sources .luca/ledger.jsonl', () => {
        expect(emitted).toContain('.luca/ledger.jsonl')
    })

    test('it replays both ledger rework events', () => {
        expect(emitted).toContain('pipeline-re-entered')
        expect(emitted).toContain('fixloop-counted')
    })

    test('the ledger replay is scoped to this run', () => {
        // An unscoped replay would mix other runs' loops into the digest.
        expect(emitted).toContain('.sessionId')
        expect(emitted).toContain('.runId == $run')
    })
})

describe('the pause handoff closes through MuninnDB, not a checkpoint file', () => {
    test('it recalls the phase-boundary handoff memory', () => {
        expect(emitted).toContain('session:phase-boundary-handoff')
    })

    test('the success criteria no longer claim a checkpoint file is processed', () => {
        expect(emitted).not.toContain('Checkpoint file processed')
    })

    test('the body states .continue-here.md is not to be read or resurrected', () => {
        // The name may appear only as a prohibition. If a future edit turns it
        // back into an instruction, this pins the surrounding sentence.
        const mentionsCheckpointPath = emitted.includes('.continue-here.md')
        if (mentionsCheckpointPath) {
            expect(emitted).toContain('There is **no checkpoint file to read.**')
            expect(emitted).toContain('LUCA_DIR_CONTRACT')
        }
    })
})

describe('the behaviours that justify keeping this skill beside progress', () => {
    test('mid-review abandonment: partially-filled audits/ detection', () => {
        expect(emitted).toContain('audits/')
        expect(emitted).toContain('mid-review abandonment')
    })

    test('mid-phase abandonment: plan without a matching summary', () => {
        expect(emitted).toContain('execute/summary.md')
        expect(emitted).toContain('mid-phase abandonment')
    })

    test('the Signal Synthesis readback survives', () => {
        expect(emitted).toContain('Signal Synthesis')
        expect(emitted).toContain('learn.md')
    })
})
