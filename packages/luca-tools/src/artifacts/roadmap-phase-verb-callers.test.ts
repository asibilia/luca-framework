/**
 * Guard: phase registration and removal go through the `luca roadmap
 * add-phase` / `luca roadmap remove-phase` verbs, never through prose.
 *
 * ## Why this exists
 *
 * Four skills (`note`, `phase-add`, `milestone-gaps`, `milestone-new`) used
 * to register a phase by shelling out to `mkdir -p .luca/phases/<NN>-<slug>`
 * and hand-editing `.luca/roadmap.md`. Both are contract violations:
 * `LUCA_DIR_CONTRACT` declares `roadmap.md` GENERATED output, and a raw
 * `mkdir` bypasses `PHASE_SLUG_RE` — which is precisely how the (now
 * retired) `phase-insert` skill shipped decimal directories the stage gate
 * rejected. The verbs landed first with ZERO callers migrated; this file is
 * the tripwire for that migration, and for the next body that tries to
 * reintroduce the prose.
 *
 * ## What it actually checks
 *
 * The artifact manifest is run through the REAL compiler (`compile()`) into
 * a temp dir and every emitted file is re-read from disk. Assertions are
 * made against those emitted BYTES — the same markdown `luca init`
 * materializes into the harness home — never against the TypeScript source.
 * An assertion over a `BODY` constant would pass for a body that never
 * reaches disk, which is worth nothing.
 *
 * The corpus-wide bans (`mkdir` into `.luca/phases`, imperative edits of
 * `.luca/roadmap.md`) deliberately scan EVERY artifact rather than the three
 * migrated skills, so a new skill cannot reintroduce the pattern under a
 * different name.
 *
 * The `milestone-gaps` / `milestone-new` assertions run the other way: they
 * pin the JUDGMENT halves (gap grouping, requirement scoping) in place, so a
 * future collapse that mistakes those skills for thin CLI wrappers and
 * deletes them fails here.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { ARTIFACTS } from './index.ts'

import { compile } from '../compile/index.ts'

interface Emitted {
    /** Path relative to the compile root, e.g. `skills/note/SKILL.md`. */
    path: string
    text: string
}

let emitted: Emitted[] = []
let root = ''

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-roadmap-verb-'))
    const report = await compile(ARTIFACTS, root)
    const out: Emitted[] = []
    for (const result of report.paths) {
        // Hooks are executable slices, not instruction bodies.
        if (result.kind === 'hook') continue
        out.push({
            path: relative(root, result.path),
            text: await readFile(result.path, 'utf-8'),
        })
    }
    emitted = out
    expect(emitted.length).toBeGreaterThan(0)
})

afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
})

/** The emitted `skills/<name>/SKILL.md` bytes, or a loud failure. */
const skill = (name: string): string => {
    const wanted = join('skills', name, 'SKILL.md')
    const hit = emitted.find((e) => e.path === wanted)
    if (hit === undefined) {
        throw new Error(
            `no emitted artifact at ${wanted} — the skill is unregistered or renamed`
        )
    }
    return hit.text
}

/** Paths of every emitted artifact whose bytes match `re`. */
const offenders = (re: RegExp): string[] =>
    emitted.filter((e) => re.test(e.text)).map((e) => e.path)

describe('the collapse actually happened', () => {
    it('no longer emits the phase-add skill', () => {
        // `note`'s default mode was a verbatim duplicate of `phase-add`.
        // Deleting the source without dropping the registration would still
        // emit the artifact, so assert over what the compiler produced.
        const paths = emitted.filter((e) =>
            e.path.startsWith(join('skills', 'phase-add'))
        )
        expect(paths).toEqual([])
    })

    it('emits no artifact that references the retired /phase-add', () => {
        expect(offenders(/\/phase-add\b/)).toEqual([])
    })
})

describe('phase directories are created by the verb, never by prose', () => {
    it('no emitted artifact mkdirs a path under .luca/phases', () => {
        // A raw mkdir bypasses PHASE_SLUG_RE. `luca roadmap add-phase`
        // validates the slug and prints `dir` back, so the caller never
        // picks a path.
        expect(offenders(/mkdir[^\n]*\.luca\/phases/)).toEqual([])
    })

    it('note registers the phase through `luca roadmap add-phase`', () => {
        expect(skill('note')).toContain('luca roadmap add-phase')
    })

    it('milestone-gaps registers gap phases through the same verb', () => {
        expect(skill('milestone-gaps')).toContain('luca roadmap add-phase')
    })

    it('milestone-new registers phases through a roadmap verb', () => {
        expect(skill('milestone-new')).toMatch(
            /luca roadmap (?:create|add-phase)/
        )
    })

    it('phase-remove removes through `luca roadmap remove-phase`', () => {
        expect(skill('phase-remove')).toContain('luca roadmap remove-phase')
    })
})

describe('roadmap.md is treated as generated output', () => {
    it('no emitted artifact instructs a direct edit of .luca/roadmap.md', () => {
        // Verb-first, path-second: matches "edit .luca/roadmap.md" and
        // "update the `.luca/roadmap.md`" while leaving read-shaped prose
        // ("Read `.luca/roadmap.md`", "`.luca/roadmap.md` updated") alone.
        expect(
            offenders(
                /\b(?:edit|editing|rewrite|write to|append to|insert into)\s+(?:the\s+)?[`"']?\.luca\/roadmap\.md/i
            )
        ).toEqual([])
    })

    it('note no longer carries the hand-edit fallback', () => {
        expect(skill('note')).not.toContain('roadmap.md directly')
    })
})

describe('the todo modes still route to `luca todo add`', () => {
    const note = (): string => skill('note')

    it('--next queues a high-priority todo', () => {
        expect(note()).toContain('luca todo add')
        expect(note()).toContain('--priority high')
    })

    it('--whenever queues a low-priority todo', () => {
        expect(note()).toContain('--priority low')
    })
})

describe('the judgment surfaces survive the collapse', () => {
    it('milestone-gaps still owns gap grouping', () => {
        const body = skill('milestone-gaps')
        expect(body).toMatch(/group/i)
        expect(body).toMatch(/coherent phase/i)
    })

    it('milestone-new still owns requirement scoping', () => {
        const body = skill('milestone-new')
        expect(body).toMatch(/requirement/i)
        expect(body.length).toBeGreaterThan(2000)
    })
})
