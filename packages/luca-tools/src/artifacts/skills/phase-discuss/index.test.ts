/**
 * Regression guard for the pipelineStep self-gate directives in the
 * phase-discuss skill body.
 *
 * The skill originally carried only the ENTRY advance (`research → discuss`);
 * the EXIT advance (`discuss → architect`) lived solely in the `/phase-discuss`
 * COMMAND body, which `/lu` never invokes (it calls `Skill(skill:
 * "phase-discuss")`). Under `/lu` the orchestrator advances on the skill's
 * behalf, so this was command/skill drift rather than a stall — but a
 * STANDALONE `/phase-discuss` had no way out of `discuss`.
 *
 * Each ask is asserted in a SEPARATELY-NAMED describe block so a partial drop
 * of any single directive fails that block independently. The BODY is obtained
 * via the real export (`phaseDiscussSkill.body`), so the assertions run against
 * the rendered skill body the harness actually inlines.
 */
import { describe, it, expect } from 'bun:test'

import {
    PIPELINE_TRANSITIONS,
    isLegalTransition,
} from '@alecsibilia/luca-core/state'

import { phaseDiscussSkill } from './index.ts'

const body = phaseDiscussSkill.body

describe('entry advance (research → discuss)', () => {
    it('retains the entry self-gate directive', () => {
        expect(body).toContain('luca state advance --to-step discuss')
    })
})

describe('exit advance (discuss → architect)', () => {
    it('emits the exit advance directive', () => {
        expect(body).toContain('luca state advance --to-step architect')
    })

    it('guards the exit advance on pipelineStep still being discuss', () => {
        // Locate the exit directive and require the guard to be stated in the
        // same section — a bare `--to-step architect` mention is not enough.
        const index = body.indexOf('luca state advance --to-step architect')
        expect(index).toBeGreaterThan(-1)

        const section = body.slice(Math.max(0, index - 600), index + 600)
        expect(section).toContain('pipelineStep')
        expect(section).toContain('still')
        expect(section).toContain('discuss')
    })

    it('does not mask the advance with `|| true` or stderr redirection', () => {
        const index = body.indexOf('luca state advance --to-step architect')
        expect(index).toBeGreaterThan(-1)

        const section = body.slice(index, index + 200)
        expect(section).not.toContain('|| true')
        expect(section).not.toContain('2>/dev/null')
    })
})

describe('transition contract backing the guard', () => {
    it('permits discuss → architect', () => {
        expect(isLegalTransition('discuss', 'architect')).toBe(true)
    })

    it('has no architect self-edge, so an unguarded second advance is illegal', () => {
        expect(isLegalTransition('architect', 'architect')).toBe(false)
        expect(PIPELINE_TRANSITIONS.architect).not.toContain('architect')
    })
})
