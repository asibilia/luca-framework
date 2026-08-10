/**
 * Regression guard for the workflow-authoring skill body.
 *
 * The acceptance contract for this skill is unusual: most of it is about what
 * the body CLAIMS about other files. So the load-bearing test is the citation
 * resolver — every `path:line` the body cites is parsed out, the file is
 * opened, and the line is required to exist. A citation that rots (file moved,
 * file shrank) fails here rather than misleading a reader.
 *
 * The remaining blocks assert the four techniques are each present with a
 * citation, that the `full-auto` yield limitation is stated rather than
 * papered over, and that the skill never instructs rewiring the verification
 * cluster (convergence.ts / claim-verifier / the deferred-criterion rule),
 * which is explicitly out of scope.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'bun:test'

import { workflowAuthoringSkill } from './index.ts'

import { SKILLS } from '../index.ts'

const body = workflowAuthoringSkill.body

/** Repo root — walk up from this file until package.json says luca root. */
function repoRoot(): string {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 20; i += 1) {
        if (existsSync(join(dir, 'bun.lock'))) return dir
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    throw new Error('could not locate repo root')
}

const ROOT = repoRoot()

/**
 * Pull every `path/to/file.ext:NNN` citation out of the body. Matches inside
 * backticks or bare. Line ranges (`:12-30`) collapse to the max line so the
 * whole range is required to exist.
 */
function extractCitations(text: string): Array<{ path: string; line: number }> {
    const re = /([A-Za-z0-9_./-]+\.(?:ts|tsx|md|json|jsonl)):(\d+)(?:-(\d+))?/g
    const out: Array<{ path: string; line: number }> = []
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        const path = m[1]!
        const end = m[3] ?? m[2]!
        out.push({ path, line: Number(end) })
    }
    return out
}

describe('registration', () => {
    it('is a kebab-case skill named workflow-authoring', () => {
        expect(workflowAuthoringSkill.kind).toBe('skill')
        expect(workflowAuthoringSkill.name).toBe('workflow-authoring')
        expect(workflowAuthoringSkill.description.length).toBeGreaterThan(80)
    })

    it('is registered in the skills barrel', () => {
        expect(SKILLS).toContain(workflowAuthoringSkill)
    })
})

describe('citation resolution', () => {
    it('cites at least four distinct source files', () => {
        const paths = new Set(extractCitations(body).map((c) => c.path))
        expect(paths.size).toBeGreaterThanOrEqual(4)
    })

    it('every cited path:line resolves on this base', () => {
        const citations = extractCitations(body)
        expect(citations.length).toBeGreaterThan(0)
        const broken: string[] = []
        for (const c of citations) {
            const abs = resolve(ROOT, c.path)
            if (!existsSync(abs)) {
                broken.push(`${c.path}:${c.line} — file does not exist`)
                continue
            }
            const lines = readFileSync(abs, 'utf-8').split('\n').length
            if (c.line > lines) {
                broken.push(
                    `${c.path}:${c.line} — file has only ${lines} lines`
                )
            }
        }
        if (broken.length > 0) {
            throw new Error(`unresolvable citations:\n${broken.join('\n')}`)
        }
    })
})

describe('the four techniques', () => {
    const cited = (needle: string): boolean =>
        extractCitations(body).some((c) => c.path.includes(needle))

    it('documents convergence promotion, citing convergence.ts', () => {
        expect(body).toContain('Convergence promotion')
        // The rule itself, not just the name: >=2 lenses, blocking regardless
        // of the severity the individual lens assigned.
        expect(body).toContain('two or more')
        expect(body).toContain('regardless of the severity')
        expect(cited('review-analysis/convergence.ts')).toBe(true)
    })

    it('documents perspective diversity, citing the reviewer subagent', () => {
        expect(body).toContain('Perspective-diverse')
        expect(body).toContain('redundant')
        expect(cited('subagents/reviewer.ts')).toBe(true)
    })

    it('documents bounded iteration + hard stop, citing the budget matrix', () => {
        expect(body).toContain('Bounded iteration')
        expect(body).toContain('hard stop')
        expect(cited('configs/budget-matrix.ts')).toBe(true)
        expect(cited('configs/fix-loop-edges.ts')).toBe(true)
    })

    it('documents orchestrator output pruning, citing the decision record', () => {
        expect(body).toContain('Orchestrator output pruning')
        expect(body).toContain('status')
        expect(body).toContain('discard')
        expect(cited('orchestrator-context-pruning.md')).toBe(true)
    })
})

describe('full-auto yield limitation', () => {
    it('states the limitation rather than presenting the yield as universal', () => {
        expect(body).toContain('full-auto')
        expect(body).toContain('no autonomous re-invoker')
        // The per-phase envelope win DOES land everywhere; only the
        // cross-turn yield is conditional. Both halves must be stated.
        expect(body).toContain('checkpoint')
        expect(body).toContain('human-in-loop')
    })
})

describe('scope guard', () => {
    it('marks the verification cluster read-only', () => {
        expect(body).toContain('convergence.ts')
        expect(body).toContain('claim-verifier')
        expect(body).toContain('deferred-criterion')
        expect(body).toMatch(/do not (rewire|modify|edit)/i)
    })

    it('never instructs editing the verification cluster', () => {
        for (const bad of [
            'edit `convergence.ts`',
            'modify `convergence.ts`',
            'rewire `convergence.ts`',
            'wire convergence detection into',
        ]) {
            expect(body.toLowerCase()).not.toContain(bad.toLowerCase())
        }
    })

    it('states that nothing ships in the repo for this', () => {
        expect(body).toContain('defineWorkflow')
        expect(body).toMatch(/no .{0,40}dependency/i)
    })
})

describe('workflow-script framing', () => {
    it('names the harness Workflow tool primitives', () => {
        expect(body).toContain('pipeline(')
        expect(body).toContain('parallel(')
        expect(body).toContain('agent(')
    })

    it('places control flow in JS, not prose', () => {
        expect(body).toContain('await')
    })
})

describe('shared skill-validation invariants', () => {
    // Mirrors the FORBIDDEN_TOKENS list enforced across bundled skills by
    // luca-cli/src/init/helpers/skill-validation.test.ts, checked here at the
    // source so a violation fails without needing a build.
    const FORBIDDEN = [
        'workflowState(',
        'writePlanningFile(',
        'manageRoadmap(',
        'manageTodos(',
        'runChecks(',
        'claimVerifier(',
        '.planning/',
        'switch-mode',
        're-enter-pipeline',
    ]
    it('contains no forbidden legacy tokens', () => {
        const hits = FORBIDDEN.filter((t) => body.includes(t))
        expect(hits).toEqual([])
    })
})

describe('phase-execute 5.2 cleanup', () => {
    const peBody = readFileSync(
        join(
            ROOT,
            'packages/luca-tools/src/artifacts/skills/phase-execute/index.ts'
        ),
        'utf-8'
    )

    it('no longer claims a structured system "will replace" manual pruning', () => {
        expect(peBody).not.toContain('will replace this manual pruning')
    })

    it('still points at the accepted decision record', () => {
        expect(peBody).toContain(
            'docs/decisions/orchestrator-context-pruning.md'
        )
    })
})
