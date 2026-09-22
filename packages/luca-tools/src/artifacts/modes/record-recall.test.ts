/**
 * Regression guard for the `record-recall` telemetry directive.
 *
 * ## Why this suite compiles the whole manifest instead of reading `.ts` files
 *
 * The previous version of this guard `readFileSync`'d the mode SOURCE files and
 * asserted they *contained* certain tokens. That passes on text sitting in a
 * comment, in a dead constant, or in a block no artifact ships — a test seam,
 * not the real path. It duly stayed green while all five directives shipped
 * WITHOUT the `--slug`/`--wave` flags that `trace-insights` Stage A5 joins on,
 * so the retained telemetry sink was live-but-unjoinable and nothing failed.
 *
 * This suite runs the real compiler (`compile(ARTIFACTS, tmp)`) over the FULL
 * artifact manifest — modes, subagents, skills, commands, hooks — and asserts
 * against the emitted markdown bytes. If a directive is deleted, moved into a
 * comment, or loses a flag, the shipped `.md` changes and this fails.
 *
 * ## The invariant
 *
 * Stage A5's `(runId, pipelineStep, phase slug, wave)` tuple sources `slug` and
 * `wave` from telemetry records ONLY (the ledger has neither), and
 * `luca telemetry emit` populates them from CLI flags ONLY. So: every
 * `recall.*` emit line in the compiled corpus must carry `--slug`, except the
 * sites on `UNATTRIBUTED_SITES` — which must *document* why in the same body.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

import { ARTIFACTS } from '../index.ts'

import { compile } from '../../compile/index.ts'

/**
 * Compiled artifacts allowed to emit a recall record with no `--slug`, and the
 * reason each is exempt. An entry here is a deliberate decision, not an
 * oversight: triage recalls at Step 1.5, before Step 2 classifies complexity
 * and while `currentPhase` is still 0, so no slug exists to stamp.
 */
const UNATTRIBUTED_SITES: Record<string, string> = {
    'triage.md': 'recall runs pre-classification, before any phase is active',
}

/** Every emit line must carry these — the Stage A5 + report join keys. */
const ATTRIBUTION_FLAGS = ['--slug', '--complexity', '--oversight'] as const

let outputRoot: string
/** Compiled `.md` bodies keyed by file basename. */
const compiled = new Map<string, string>()

/** Recursively collect every emitted markdown file under `dir`. */
function collectMarkdown(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) collectMarkdown(full, acc)
        else if (entry.endsWith('.md')) acc.push(full)
    }
    return acc
}

/**
 * Every RUNNABLE `luca telemetry emit --kind recall.*` line in a body.
 *
 * Anchored to the start of the line so prose that merely *names* the command
 * (e.g. the `/lu` command body's "reuse it as `--run-id` on every `luca
 * telemetry emit --kind recall.*`") is not mistaken for an emit site — those
 * carry no flags by design and are not what Stage A5 reads.
 */
function recallEmitLines(body: string): string[] {
    return body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('luca telemetry emit --kind recall.'))
}

beforeAll(async () => {
    outputRoot = mkdtempSync(join(tmpdir(), 'luca-record-recall-'))
    await compile(ARTIFACTS, outputRoot)
    for (const path of collectMarkdown(outputRoot)) {
        compiled.set(path.slice(outputRoot.length + 1), readFileSync(path, 'utf8'))
    }
})

afterAll(() => {
    if (outputRoot) rmSync(outputRoot, { recursive: true, force: true })
})

describe('compiled corpus carries recall emit directives', () => {
    test('the compile produced markdown to inspect', () => {
        expect(compiled.size).toBeGreaterThan(20)
    })

    test('at least one compiled artifact emits recall telemetry', () => {
        const emitters = [...compiled].filter(
            ([, body]) => recallEmitLines(body).length > 0
        )
        // Guards against a vacuous pass if the directive is deleted outright.
        expect(emitters.length).toBeGreaterThanOrEqual(5)
    })

    test('the corpus ships every known emit site', () => {
        // 7 today: triage 1, architect 1, execute 1, review 2 (hit +
        // utilization), finalize 2. A fence/format change that stops the
        // anchored matcher from seeing them fails HERE rather than making the
        // flag assertions below pass over an empty set.
        const total = [...compiled].reduce(
            (n, [, body]) => n + recallEmitLines(body).length,
            0
        )
        expect(total).toBeGreaterThanOrEqual(7)
    })

    for (const mode of [
        'triage',
        'architect',
        'execute',
        'review',
        'finalize',
    ] as const) {
        test(`${mode} mode ships a runnable recall emit`, () => {
            const body = compiled.get(join('.claude', 'agents', `${mode}.md`))
            expect(body).toBeDefined()
            expect(recallEmitLines(body ?? '').length).toBeGreaterThan(0)
        })
    }
})

describe('every compiled recall emit is Stage A5 joinable', () => {
    test('no emit line omits the attribution flags outside the exemption list', () => {
        const offenders: string[] = []
        for (const [name, body] of compiled) {
            const basename = name.split('/').pop() ?? name
            if (basename in UNATTRIBUTED_SITES) continue
            for (const line of recallEmitLines(body)) {
                for (const flag of ATTRIBUTION_FLAGS) {
                    if (!line.includes(flag)) offenders.push(`${name}: ${flag}`)
                }
            }
        }
        // Named offenders, not a bare count — a failure says which file lost
        // which flag.
        expect(offenders).toEqual([])
    })

    test('execute stamps --wave, the second half of the A5 tuple', () => {
        const body = compiled.get(join('.claude', 'agents', 'execute.md')) ?? ''
        const lines = recallEmitLines(body)
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) expect(line).toContain('--wave')
    })

    test('recall.utilization is attributed like the hit/miss family', () => {
        const utilization = [...compiled].flatMap(([name, body]) =>
            recallEmitLines(body)
                .filter((line) => line.includes('--kind recall.utilization'))
                .map((line) => [name, line] as const)
        )
        expect(utilization.length).toBeGreaterThan(0)
        for (const [, line] of utilization) {
            for (const flag of ATTRIBUTION_FLAGS) expect(line).toContain(flag)
        }
    })

    test('recall.utilization ships its outcome-valence derivation', () => {
        // `meta.outcome` is the join key of the Recall Utilization report
        // section. The valence rule used to live only in the retired
        // `signal.satisfaction` block; without it inlined, `outcome` degrades
        // to free LLM judgment.
        const body = compiled.get(join('.claude', 'agents', 'review.md')) ?? ''
        expect(body).toContain('derive it, never guess it')
        expect(body).toContain('all reviewers approve with no blocking findings')
    })
})

describe('unattributed emit sites are deliberate and documented', () => {
    for (const [basename, reason] of Object.entries(UNATTRIBUTED_SITES)) {
        test(`${basename} states why it cannot stamp a slug`, () => {
            const entry = [...compiled].find(([name]) =>
                name.endsWith(`/${basename}`)
            )
            expect(entry).toBeDefined()
            const body = entry?.[1] ?? ''
            expect(recallEmitLines(body).length).toBeGreaterThan(0)
            // The body must SAY it is unflagged on purpose, so the next reader
            // does not "fix" it by inventing a placeholder slug.
            expect(body).toContain(
                '**No attribution flags here — deliberately.**'
            )
            expect(reason.length).toBeGreaterThan(0)
        })
    }
})

describe('recall meta payload contract', () => {
    const META_KEYS = [
        'query',
        'resultCount',
        'verifiedCount',
        'vault',
        'callerMode',
        'durationMs',
        'recalledIds',
    ] as const

    for (const mode of [
        'triage',
        'architect',
        'execute',
        'review',
        'finalize',
    ] as const) {
        test(`${mode} recall.hit meta carries every key incl. recalledIds`, () => {
            const body = compiled.get(join('.claude', 'agents', `${mode}.md`)) ?? ''
            const hit = recallEmitLines(body).find((line) =>
                line.includes('--kind recall.hit')
            )
            expect(hit).toBeDefined()
            for (const key of META_KEYS) expect(hit).toContain(key)
            expect(hit).toContain('--run-id')
        })
    }
})
