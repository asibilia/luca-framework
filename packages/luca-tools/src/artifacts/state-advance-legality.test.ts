/**
 * Build-time legality guard for every `luca state advance` directive
 * shipped in a compiled artifact body.
 *
 * ## Why this exists
 *
 * Luca ships three independent hand-written instruction surfaces —
 * `artifacts/modes/`, `artifacts/skills/`, `artifacts/commands/` — and each
 * one emits `luca state advance --to-step <literal>` as prose. Nothing used
 * to check those literals against the canonical transition table in
 * `@alecsibilia/luca-core/state`, so at least four illegal transitions
 * shipped (execute → verify, execute → review, …). Wave 1 of the retro batch
 * fixed the instances; this test is the CAUSAL fix that stops the class from
 * recurring on the next edit.
 *
 * ## What it actually checks
 *
 * The artifact manifest is run through the REAL compiler (`compile()` from
 * `../compile`) into a temp dir, and every emitted file is re-read from
 * disk. All assertions are made against those emitted BYTES — never against
 * the TypeScript source — so a directive that survives to the artifact the
 * harness inlines is the thing under test. A body-level `toContain` over the
 * definition object would not prove the byte ever reaches disk.
 *
 * ## The rule
 *
 * Each artifact that emits at least one literal target falls into exactly
 * one class:
 *
 *   - **owner** — the body drives ONE pipeline step. Every target `T` must
 *     satisfy `T === own` (the entry self-gate: "if pipelineStep is still
 *     <predecessor>, advance into the step I own") or
 *     `isLegalTransition(own, T)` (the exit advance). Mode-agents get their
 *     `own` step for free from `defineAgent`'s `stage:` field — no manual
 *     annotation, so a new mode is covered the moment it is added.
 *   - **orchestrator** — the body legitimately advances on behalf of steps
 *     it does not own (`/lu` walks the whole pipeline; `phase-execute`
 *     walks the execute→learn tail). It declares the ordered span it
 *     drives; the span itself must be a legal WALK, and every target must
 *     be a member of it. Weaker than the owner rule by necessity — which is
 *     why the class is opt-in per artifact with a justification, and never
 *     the default.
 *
 * There is deliberately NO exempt/allowlist class. An earlier draft carried
 * one for `skill:quick`, whose advances were genuinely illegal; the same
 * retro batch fixed quick, and the entry then blanked the guard for the very
 * artifact it was written about. An exemption is a permission grant that
 * removes an artifact from the check entirely, and the only honest tripwire
 * for "is this still needed" is re-running the rule under the intended class
 * — which is just the entry the author should have written. So: fix the
 * artifact, or declare it an orchestrator with a justification. Nothing opts
 * out.
 *
 * An artifact that emits a literal and has NO entry fails. That is the part
 * that stops recurrence — a new skill cannot ship an unvetted advance.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import {
    isLegalTransition,
    parseAllAdvanceCommands,
    PIPELINE_TRANSITIONS,
    PipelineStepValues,
} from '@alecsibilia/luca-core/state'
import type { PipelineStep } from '@alecsibilia/luca-core/state'

import { ARTIFACTS } from './index.ts'

import { compile } from '../compile/index.ts'
import { defineAgent, defineSkill, type Artifact } from '../define/index.ts'

// ---------------------------------------------------------------------------
// Ownership table
// ---------------------------------------------------------------------------

/** A body that drives exactly one pipeline step. */
interface OwnerSpec {
    kind: 'owner'
    step: PipelineStep
}

/**
 * A body that advances on behalf of several steps in sequence. `drives` is
 * the ordered span; it is asserted to be a legal walk, so it cannot be
 * padded into an arbitrary permission set without also being a real path
 * through the machine.
 */
interface OrchestratorSpec {
    kind: 'orchestrator'
    drives: readonly PipelineStep[]
    why: string
}

type OwnershipSpec = OwnerSpec | OrchestratorSpec

/**
 * Keyed by `<kind>:<name>` — the artifact's identity in the manifest, not
 * its emitted path, so the table survives a change to where a kind lands on
 * disk. Mode-agents are absent on purpose: their owning step comes from
 * `defineAgent`'s `stage:` field (see `ownershipFor`).
 */
const OWNERSHIP: Readonly<Record<string, OwnershipSpec>> = {
    // --- single-step owners -------------------------------------------------
    // Each of these is a per-step skill/command: it self-gates into the step
    // it owns, does that step's work, then advances to the one legal
    // successor.
    'skill:phase-research': { kind: 'owner', step: 'research' },
    'skill:phase-discuss': { kind: 'owner', step: 'discuss' },
    'skill:phase-plan': { kind: 'owner', step: 'plan' },
    'skill:lu-review': { kind: 'owner', step: 'review' },
    // `quick` self-gates on `pipelineStep === idle`, then advances
    // `idle → triage` (the entry self-gate — it does triage's work: classify
    // complexity, register the phase) and `triage → research` before handing
    // off to `/lu`. Both legal under the owner rule with `triage` as own.
    'skill:quick': { kind: 'owner', step: 'triage' },
    'command:phase-discuss': { kind: 'owner', step: 'discuss' },
    'command:phase-plan': { kind: 'owner', step: 'plan' },
    'command:phase-execute': { kind: 'owner', step: 'execute' },

    // --- orchestrators ------------------------------------------------------
    'skill:phase-execute': {
        kind: 'orchestrator',
        drives: ['execute', 'checks', 'verify', 'review', 'learn'],
        why:
            'Owns the whole execute→learn tail: it spawns the executor, runs ' +
            '`luca checks run`, spawns the verifier and the reviewers, then the ' +
            'learner — advancing between each because it, not a downstream ' +
            'body, is what holds the loop.',
    },
    'skill:lu': {
        kind: 'orchestrator',
        drives: [
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
        ],
        why:
            'The top-level pipeline orchestrator. It delegates every step to a ' +
            'skill or subagent and advances on that step’s behalf, so its ' +
            'legitimate span is the entire machine.',
    },
}

/**
 * Modes whose instruction body carries an explicit "do NOT call `luca state
 * advance`" gotcha. They are asserted to emit ZERO directives — a stronger
 * claim than the legality rule, which would happily wave through a
 * `discuss → architect` advance from a mode that must never advance at all.
 *
 * `discuss` is the important one: it carries `stage: 'discuss'`, which IS a
 * real pipeline step, so the owner rule alone would treat it as the pipeline
 * discuss stage. It is a non-pipeline brainstorming mode
 * (`modes/discuss.ts`, gotcha: "Discuss is NOT a Luca pipeline stage").
 * `plan` and `build` are the stock read-only / default modes and carry the
 * same gotcha.
 */
const MODES_THAT_MUST_NOT_ADVANCE: readonly string[] = [
    'agent:discuss',
    'agent:plan',
    'agent:build',
]

// ---------------------------------------------------------------------------
// Extraction — over emitted bytes
// ---------------------------------------------------------------------------

/**
 * Long-flag form. Deliberately a plain scan rather than the shell parser:
 * artifact bodies are markdown, and most directives sit in inline backticks
 * or prose where a shell tokenizer sees command substitution and yields
 * nothing. Over-matching is the safe direction here — a `--to-step` literal
 * in prose is still an instruction the model will follow.
 */
const TO_STEP_RE = /--to-step[=\s]+([a-z][a-z0-9-]*)/g

const PIPELINE_STEPS = new Set<string>(PipelineStepValues)

function isPipelineStep(value: string): value is PipelineStep {
    return PIPELINE_STEPS.has(value)
}

/**
 * Every advance target in one emitted artifact, in source order.
 *
 * Two extractors, because `cli-parse.ts` accepts two invocation shapes and
 * both ship in bodies:
 *   1. `TO_STEP_RE` over the whole file — the long-flag form, including
 *      prose mentions.
 *   2. `parseAllAdvanceCommands` (the SAME parser the pipeline-guard hook
 *      uses at runtime) applied line-by-line to fenced code blocks — this is
 *      what catches the bare positional `luca state advance <step>` form,
 *      which the regex above cannot see.
 */
function extractTargets(text: string): string[] {
    const targets: string[] = []
    for (const match of text.matchAll(TO_STEP_RE)) {
        const captured = match[1]
        if (captured !== undefined) targets.push(captured)
    }

    let inFence = false
    for (const line of text.split('\n')) {
        if (line.trimStart().startsWith('```')) {
            inFence = !inFence
            continue
        }
        if (!inFence) continue
        for (const step of parseAllAdvanceCommands(line)) {
            if (!targets.includes(step)) targets.push(step)
        }
    }

    return targets
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

function artifactKey(art: Artifact): string {
    switch (art.kind) {
        case 'agent':
        case 'subagent':
        case 'hook':
            return `${art.kind}:${art.id}`
        case 'command':
        case 'skill':
            return `${art.kind}:${art.name}`
        case 'rule':
            return `rule:${art.rule.id}`
    }
}

/**
 * Resolve an artifact's class. Mode-agents whose `stage` is a real pipeline
 * step are owners implicitly — that is the whole point of `defineAgent`
 * carrying `stage:`, and it means a newly-added mode is covered without
 * anyone remembering to update the table. `standalone`/`fast`/`build` stages
 * are not pipeline steps, so those fall through to the table like any skill.
 */
function ownershipFor(art: Artifact): OwnershipSpec | undefined {
    const explicit = OWNERSHIP[artifactKey(art)]
    if (explicit !== undefined) return explicit
    if (art.kind === 'agent' && isPipelineStep(art.stage)) {
        return { kind: 'owner', step: art.stage }
    }
    return undefined
}

interface Violation {
    key: string
    path: string
    message: string
}

/**
 * Apply the rule to one emitted artifact. Returns every violation found;
 * each message names the artifact, its emitted path, and the offending
 * target so a failure is actionable without re-running anything.
 */
function checkArtifact(
    art: Artifact,
    emittedPath: string,
    text: string
): Violation[] {
    const key = artifactKey(art)
    const targets = extractTargets(text)

    if (MODES_THAT_MUST_NOT_ADVANCE.includes(key)) {
        return targets.map((target) => ({
            key,
            path: emittedPath,
            message: `${key} (${emittedPath}) emits \`--to-step ${target}\`, but this mode carries an explicit "do NOT call luca state advance" gotcha and must emit no directive at all.`,
        }))
    }

    // Subagents are Task-tool workers. `artifacts/shared/shared-prefix.ts`
    // forbids them from running any state-mutating `luca` command, because a
    // subagent advancing the pipeline races the orchestrator that spawned it.
    if (art.kind === 'subagent') {
        return targets.map((target) => ({
            key,
            path: emittedPath,
            message: `${key} (${emittedPath}) emits \`--to-step ${target}\`, but subagents must never mutate pipeline state (see artifacts/shared/shared-prefix.ts).`,
        }))
    }

    if (targets.length === 0) return []

    const spec = ownershipFor(art)
    if (spec === undefined) {
        return [
            {
                key,
                path: emittedPath,
                message: `${key} (${emittedPath}) emits \`--to-step ${targets.join(', ')}\` but has no OWNERSHIP entry. Add one to state-advance-legality.test.ts declaring the pipeline step this body owns.`,
            },
        ]
    }

    const violations: Violation[] = []
    for (const target of targets) {
        if (!isPipelineStep(target)) {
            violations.push({
                key,
                path: emittedPath,
                message: `${key} (${emittedPath}): \`--to-step ${target}\` is not a pipeline step. Legal steps: ${PipelineStepValues.join(', ')}.`,
            })
            continue
        }

        if (spec.kind === 'owner') {
            // `target === spec.step` is the entry self-gate ("if pipelineStep
            // is still <predecessor>, advance into the step I own").
            if (target === spec.step) continue
            if (isLegalTransition(spec.step, target)) continue
            violations.push({
                key,
                path: emittedPath,
                message: `${key} (${emittedPath}): illegal advance \`--to-step ${target}\` — this body owns \`${spec.step}\`, whose only legal successors are [${PIPELINE_TRANSITIONS[spec.step].join(', ')}].`,
            })
            continue
        }

        if (!spec.drives.includes(target)) {
            violations.push({
                key,
                path: emittedPath,
                message: `${key} (${emittedPath}): \`--to-step ${target}\` is outside the span this orchestrator declares it drives [${spec.drives.join(' → ')}].`,
            })
        }
    }

    return violations
}

// ---------------------------------------------------------------------------
// Fixture — compile the real manifest, read the real bytes
// ---------------------------------------------------------------------------

interface Emitted {
    artifact: Artifact
    /** Path relative to the compile root, e.g. `skills/quick/SKILL.md`. */
    path: string
    text: string
}

/**
 * Compile `artifacts` with the production compiler and read every file it
 * wrote back off disk. Hook artifacts are skipped: `emitHook` returns a
 * synthetic `settings.json#hooks.<event>[<id>]` locator rather than a file,
 * and hook handlers are TypeScript, not instruction bodies.
 */
async function compileAndRead(
    artifacts: readonly Artifact[]
): Promise<Emitted[]> {
    const root = await mkdtemp(join(tmpdir(), 'luca-advance-legality-'))
    try {
        const report = await compile(artifacts, root)

        // compile() pushes exactly one path per artifact, in input order.
        // The pairing below depends on that; assert it rather than assume it.
        if (report.paths.length !== artifacts.length) {
            throw new Error(
                `compile() returned ${report.paths.length} paths for ${artifacts.length} artifacts — the index pairing this test relies on is broken.`
            )
        }

        const out: Emitted[] = []
        for (const [index, artifact] of artifacts.entries()) {
            const emitted = report.paths[index]
            if (emitted === undefined || emitted.kind === 'hook') continue
            out.push({
                artifact,
                path: relative(root, emitted.path),
                text: await readFile(emitted.path, 'utf-8'),
            })
        }
        return out
    } finally {
        await rm(root, { recursive: true, force: true })
    }
}

let emitted: Emitted[] = []

beforeAll(async () => {
    emitted = await compileAndRead(ARTIFACTS)
})

afterAll(() => {
    emitted = []
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compiled artifact bytes', () => {
    it('emits a file for every non-hook artifact', () => {
        const nonHook = ARTIFACTS.filter((a) => a.kind !== 'hook').length
        expect(emitted.length).toBe(nonHook)
    })

    it('actually carries advance directives (the scan is not a no-op)', () => {
        const withTargets = emitted.filter(
            (e) => extractTargets(e.text).length > 0
        )
        expect(withTargets.length).toBeGreaterThan(0)
    })
})

describe('every emitted --to-step directive is a legal transition', () => {
    it('reports no violations across the whole manifest', () => {
        const violations = emitted.flatMap((e) =>
            checkArtifact(e.artifact, e.path, e.text)
        )
        expect(violations.map((v) => v.message)).toEqual([])
    })
})

describe('ownership table integrity', () => {
    it('declares only real pipeline steps', () => {
        const bogus: string[] = []
        for (const [key, spec] of Object.entries(OWNERSHIP)) {
            const declared = spec.kind === 'owner' ? [spec.step] : spec.drives
            for (const step of declared) {
                if (!isPipelineStep(step)) bogus.push(`${key}: ${step}`)
            }
        }
        expect(bogus).toEqual([])
    })

    it('declares orchestrator spans that are legal walks through the machine', () => {
        const brokenEdges: string[] = []
        for (const [key, spec] of Object.entries(OWNERSHIP)) {
            if (spec.kind !== 'orchestrator') continue
            for (let i = 0; i + 1 < spec.drives.length; i += 1) {
                const from = spec.drives[i]
                const to = spec.drives[i + 1]
                if (from === undefined || to === undefined) continue
                if (!isLegalTransition(from, to)) {
                    brokenEdges.push(`${key}: ${from} → ${to}`)
                }
            }
        }
        expect(brokenEdges).toEqual([])
    })

    it('carries a justification on every entry that widens the rule', () => {
        const unjustified = Object.entries(OWNERSHIP)
            .filter(([, spec]) => spec.kind !== 'owner')
            .filter(([, spec]) => !('why' in spec) || spec.why.trim().length < 40)
            .map(([key]) => key)
        expect(unjustified).toEqual([])
    })

    it('has no entry for an artifact that emits no directive (dead permission grant)', () => {
        const dead = emitted
            .filter((e) => OWNERSHIP[artifactKey(e.artifact)] !== undefined)
            .filter((e) => extractTargets(e.text).length === 0)
            .map((e) => artifactKey(e.artifact))
        expect(dead).toEqual([])
    })
})

describe('no artifact opts out of the rule', () => {
    it('every emitting artifact is actually checked (no silent-pass class)', () => {
        // The guard's failure mode is an artifact that emits directives yet
        // is exempted from checking — the `skill:quick` exemption this test
        // shipped with did exactly that. Assert the property directly: every
        // emitting artifact resolves to a class the loop below evaluates.
        const unchecked = emitted
            .filter((e) => extractTargets(e.text).length > 0)
            .filter((e) => {
                const key = artifactKey(e.artifact)
                if (MODES_THAT_MUST_NOT_ADVANCE.includes(key)) return false
                if (e.artifact.kind === 'subagent') return false
                const spec = ownershipFor(e.artifact)
                // `undefined` is not an opt-out — it is a hard failure in
                // `checkArtifact`. Only a class that returns early would be.
                return (
                    spec !== undefined &&
                    spec.kind !== 'owner' &&
                    spec.kind !== 'orchestrator'
                )
            })
            .map((e) => artifactKey(e.artifact))
        expect(unchecked).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// Mutation test — proves the guard bites on the real compile path
// ---------------------------------------------------------------------------

describe('guard bites', () => {
    /**
     * Verbatim prose from `modes/execute.ts` at cd7ba96ff^ — the shipped
     * defect wave 1 removed. `execute`'s only legal successor is `checks`, so
     * both targets on this line were illegal. Replaying the historical bytes
     * is the closest available substitute for running this test on the
     * pre-fix tree.
     */
    const PRE_FIX_EXECUTE_LINE =
        'After all waves: `luca state advance --to-step verify` → ' +
        '`luca state advance --to-step review` per the pipeline-transitions table.\n'

    it('fails the historical execute → verify / review defect', async () => {
        const rogue = defineAgent({
            id: 'rogue-execute',
            name: 'Rogue Execute',
            description: 'Synthetic mode replaying the pre-wave-1 execute defect.',
            stage: 'execute',
            instructions: PRE_FIX_EXECUTE_LINE,
        })

        const [compiled] = await compileAndRead([rogue])
        expect(compiled).toBeDefined()
        if (compiled === undefined) return

        // The illegal literals must survive compilation into the emitted bytes.
        expect(compiled.text).toContain('--to-step verify')
        expect(compiled.text).toContain('--to-step review')

        const violations = checkArtifact(
            compiled.artifact,
            compiled.path,
            compiled.text
        )
        expect(violations.map((v) => v.message).join('\n')).toContain(
            'agent:rogue-execute'
        )
        expect(violations.length).toBe(2)
        expect(violations[0]?.message).toContain('--to-step verify')
        expect(violations[0]?.message).toContain('owns `execute`')
        expect(violations[1]?.message).toContain('--to-step review')
    })

    it('fails an owner-class SKILL that advances outside its step', async () => {
        // Reuses the `skill:phase-plan` ownership entry (owns `plan`), so this
        // exercises the owner rule through `emitSkill` rather than
        // `emitAgent` — the three surfaces have separate emitters and the
        // guard has to bite on all of them.
        const rogue = defineSkill({
            name: 'phase-plan',
            description: 'Synthetic phase-plan body with an illegal advance.',
            body: 'Then run `luca state advance --to-step execute`.\n',
        })

        const [compiled] = await compileAndRead([rogue])
        expect(compiled).toBeDefined()
        if (compiled === undefined) return

        expect(compiled.path).toBe(join('skills', 'phase-plan', 'SKILL.md'))
        expect(compiled.text).toContain('--to-step execute')

        const violations = checkArtifact(
            compiled.artifact,
            compiled.path,
            compiled.text
        )
        expect(violations.length).toBe(1)
        expect(violations[0]?.message).toContain('skill:phase-plan')
        expect(violations[0]?.message).toContain('--to-step execute')
        expect(violations[0]?.message).toContain('owns `plan`')
    })

    it('fails a body that emits a directive with no ownership entry', async () => {
        const rogue = defineAgent({
            id: 'rogue-standalone',
            name: 'Rogue Standalone',
            description: 'Synthetic standalone mode with an unvetted advance.',
            stage: 'standalone',
            instructions: 'Run `luca state advance --to-step plan` at the end.\n',
        })

        const [compiled] = await compileAndRead([rogue])
        expect(compiled).toBeDefined()
        if (compiled === undefined) return

        const violations = checkArtifact(
            compiled.artifact,
            compiled.path,
            compiled.text
        )
        expect(violations.length).toBe(1)
        expect(violations[0]?.message).toContain('no OWNERSHIP entry')
    })

    it('catches the bare positional form the long-flag scan cannot see', async () => {
        const rogue = defineAgent({
            id: 'rogue-positional',
            name: 'Rogue Positional',
            description: 'Synthetic mode using the positional advance form.',
            stage: 'execute',
            instructions: '```bash\nluca state advance review\n```\n',
        })

        const [compiled] = await compileAndRead([rogue])
        expect(compiled).toBeDefined()
        if (compiled === undefined) return

        expect(compiled.text).not.toContain('--to-step')
        expect(extractTargets(compiled.text)).toEqual(['review'])

        const violations = checkArtifact(
            compiled.artifact,
            compiled.path,
            compiled.text
        )
        expect(violations.length).toBe(1)
        expect(violations[0]?.message).toContain('--to-step review')
    })
})
