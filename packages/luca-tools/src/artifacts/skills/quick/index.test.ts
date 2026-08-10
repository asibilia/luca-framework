/**
 * Contract guard for the `quick` skill.
 *
 * `quick` used to be the single worst offender against the workflow
 * contract: it `mkdir -p`-ed a `sed`-slugified `NNN-<slug>/` under a
 * top-level `quick/` directory `LUCA_DIR_CONTRACT` does not know about
 * (with three-digit numbering `PHASE_SLUG_RE` rejects), wrote artifacts it was
 * never in the right step to write, and then ran
 * `idle → learn → finalize → idle` — three consecutive ILLEGAL
 * transitions, unmasked, so the very first one hard-failed in the user's
 * face.
 *
 * These assertions run against the bytes `emitSkill` actually writes to
 * `skills/quick/SKILL.md` — the same function `luca init` uses to
 * materialize the artifact — not against the source file's text. A
 * regression that only survives in the TS module but never reaches the
 * emitted markdown would still fail here, and vice versa.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    PIPELINE_TRANSITIONS,
    isLegalTransition,
    type PipelineStep,
} from '@alecsibilia/luca-core/state'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { quickSkill } from './index.ts'

import { emitSkill } from '../../../compile/emit-skill.ts'
import { SKILLS } from '../index.ts'

/** Bytes of the emitted `skills/quick/SKILL.md`. */
let emitted: string
let outputRoot: string

beforeAll(async () => {
    outputRoot = await mkdtemp(join(tmpdir(), 'luca-quick-emit-'))
    const result = await emitSkill(quickSkill, outputRoot)
    expect(result.path).toBe(join(outputRoot, 'skills', 'quick', 'SKILL.md'))
    emitted = await readFile(result.path, 'utf8')
})

afterAll(async () => {
    if (outputRoot) await rm(outputRoot, { recursive: true, force: true })
})

describe('the skill still ships', () => {
    it('is registered in the bundled SKILLS list', () => {
        // Guards the half-delete: if `quick` is ever retired it must be
        // removed from `/lu` and added to RETIRED_ARTIFACTS in the same
        // change, which will delete this file too.
        expect(SKILLS).toContain(quickSkill)
    })

    it('emits a non-empty SKILL.md with the skill frontmatter', () => {
        expect(emitted).toContain('name: quick')
        expect(emitted.length).toBeGreaterThan(200)
    })
})

/**
 * The out-of-contract directory the old body invented. Assembled from parts
 * so a repo-wide grep for that path stays at zero matches — the grep is one
 * of this change's acceptance criteria, and a guard test spelling the string
 * literally would defeat it.
 */
const OUT_OF_CONTRACT_DIR = ['.luca', 'quick'].join('/')

describe('directory contract', () => {
    it('never names the out-of-contract quick/ directory', () => {
        expect(emitted).not.toContain(OUT_OF_CONTRACT_DIR)
    })

    it('names at least one contract-valid `.luca/phases/<NN>-<slug>` directory', () => {
        // The bare absence grep above is vacuous on its own — it passes if
        // the directory block is deleted and nothing replaces it. Require a
        // positive, contract-shaped directory expression.
        const dirs = emitted.match(/\.luca\/phases\/[0-9]{2}-[a-z][a-z0-9-]*/g)
        expect(dirs).not.toBeNull()
        expect((dirs ?? []).length).toBeGreaterThan(0)
    })

    it('uses two-digit phase numbering, never the old three-digit glob', () => {
        expect(emitted).not.toContain('[0-9][0-9][0-9]')
    })

    it('does not create phase directories with `mkdir`', () => {
        // Directory creation is owned by `luca roadmap add-phase`, which
        // validates the slug against PHASE_SLUG_RE. A raw mkdir bypasses it.
        expect(emitted).not.toContain('mkdir')
    })

    it('does not slugify the task description itself', () => {
        // `configs.ts` states phase slugs are derived from roadmap order and
        // are NOT LLM-named. The old body built one with a `sed` pipeline.
        expect(emitted).not.toContain('sed ')
        expect(emitted).not.toContain("tr '[:upper:]'")
    })

    it('registers the phase through the `luca roadmap add-phase` verb', () => {
        expect(emitted).toContain('luca roadmap add-phase')
    })
})

describe('pipeline transitions', () => {
    /** Every `--to-step <step>` the skill emits, in body order. */
    const advances = (): string[] =>
        [...emitted.matchAll(/luca state advance --to-step ([a-z-]+)/g)].map(
            (m) => m[1] as string
        )

    it('names only real pipeline steps', () => {
        for (const step of advances()) {
            expect(Object.keys(PIPELINE_TRANSITIONS)).toContain(step)
        }
    })

    it('walks a legal path from `idle`, the only step quick can start in', () => {
        // The skill refuses to run unless pipelineStep is `idle`, so folding
        // its advances from `idle` reproduces exactly what the CLI will be
        // asked to do. Any illegal hop fails here the way `luca state
        // advance` would fail in the user's face.
        let from: PipelineStep = 'idle'
        for (const to of advances()) {
            expect({ from, to, legal: isLegalTransition(from, to as PipelineStep) }).toEqual({
                from,
                to,
                legal: true,
            })
            from = to as PipelineStep
        }
    })

    it('never advances into `learn`, `finalize`, or `idle`', () => {
        // The three steps the old body jumped to from `idle`. quick hands the
        // pipeline to `/lu`; it does not drive the tail of the run itself.
        const emittedSteps = advances()
        expect(emittedSteps).not.toContain('learn')
        expect(emittedSteps).not.toContain('finalize')
        expect(emittedSteps).not.toContain('idle')
    })

    it('leaves every advance unmasked', () => {
        // A masked advance (`|| true`, `2>/dev/null`) hides a real contract
        // violation instead of surfacing it.
        for (const match of emitted.matchAll(
            /luca state advance --to-step [a-z-]+/g
        )) {
            const tail = emitted.slice(
                match.index ?? 0,
                (match.index ?? 0) + 120
            )
            expect(tail).not.toContain('|| true')
            expect(tail).not.toContain('2>/dev/null')
        }
    })

    it('gates itself on pipelineStep being idle', () => {
        expect(emitted).toContain('pipelineStep')
        expect(emitted).toContain('idle')
    })
})

describe('stage-gated artifacts', () => {
    it('writes no phase artifacts of its own', () => {
        // `plan.md` is legal only at pipelineStep=plan and
        // `execute/summary.md` only at execute; quick reaches neither, so it
        // must not claim to write them. The downstream `/lu` steps do.
        expect(emitted).not.toContain('execute/summary.md')
        expect(emitted).not.toMatch(/(Create|Write|write)\s+`?plan\.md/)
    })

    it('does not commit', () => {
        expect(emitted).not.toContain('git commit')
        expect(emitted).not.toContain('git add')
    })

    it('hands the pipeline off to /lu', () => {
        expect(emitted).toContain('Skill(skill: "lu")')
    })
})
