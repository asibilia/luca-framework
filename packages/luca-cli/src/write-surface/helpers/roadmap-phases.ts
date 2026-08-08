/**
 * Shared roadmap-phase mechanics for the `luca roadmap add-phase` /
 * `remove-phase` write verbs.
 *
 * These verbs exist so phase registration is a deterministic CLI operation
 * instead of LLM prose that `mkdir -p`s a directory and hand-edits
 * `.luca/roadmap.md`. Both of those were contract violations: `roadmap.md`
 * is declared GENERATED ("treat as build output") by LUCA_DIR_CONTRACT, and a
 * raw `mkdir` bypasses the `<NN>-<slug>` validator entirely.
 *
 * Slug derivation deliberately routes through luca-core's
 * {@link resolveActiveSlug} rather than re-implementing kebab-casing here:
 * the pipeline resolves the active phase directory through that exact
 * function, so any local copy would eventually drift and hand the agent a
 * directory the pipeline never looks in.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import {
    lucaRootPaths,
    phasePathFor,
    resolveActiveSlug,
    type LucaState,
    type RoadmapPhase,
} from '@alecsibilia/luca-core'

import { writeAtomicFile } from './write-atomic.ts'

/** A phase-directory rename produced by a renumbering roadmap mutation. */
export interface PhaseDirMove {
    /** Old directory basename under `.luca/phases/`, e.g. `02-profile-page`. */
    from: string
    /** New directory basename under `.luca/phases/`, e.g. `03-profile-page`. */
    to: string
}

export interface SlugOk {
    ok: true
    NN: string
    slug: string
}
export interface SlugFail {
    ok: false
    error: string
}

/**
 * Derive `{ NN, slug }` for the 1-based position `nn` within `roadmap`.
 *
 * @param state - Any workflow state; only used as the base object so the
 *   call is fully typed. `roadmap` and `currentPhase` are overridden.
 * @param roadmap - The roadmap array to resolve against.
 * @param nn - 1-based phase position.
 * @returns The resolved `{ NN, slug }`, or a failure with a caller-safe
 *   message when the entry name does not slugify to a contract-valid slug.
 */
export function slugAt(
    state: LucaState,
    roadmap: RoadmapPhase[],
    nn: number
): SlugOk | SlugFail {
    const resolved = resolveActiveSlug({ ...state, roadmap, currentPhase: nn })
    if (!resolved.ok) return { ok: false, error: resolved.error }
    return { ok: true, NN: resolved.NN, slug: resolved.slug }
}

function escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * Render `.luca/roadmap.md` from workflow state.
 *
 * `roadmap.md` is a GENERATED view over `state.roadmap` — the reason these
 * verbs exist is so nothing hand-edits it. The rendering is a pure function
 * of state so re-running any roadmap verb reproduces the file byte-for-byte.
 *
 * @param state - The post-mutation workflow state.
 * @returns The full markdown document, newline-terminated.
 */
export function renderRoadmapMd(state: LucaState): string {
    const lines: string[] = [
        '# Roadmap',
        '',
        '<!-- GENERATED FILE — do not hand-edit.',
        '     Rendered from `.luca/state.json` by `luca roadmap add-phase` /',
        '     `luca roadmap remove-phase`. Hand edits are lost on the next',
        '     roadmap mutation. -->',
        '',
    ]

    if (state.roadmap.length === 0) {
        lines.push('_No phases yet. Add one with `luca roadmap add-phase`._', '')
        return lines.join('\n')
    }

    const active =
        state.currentPhase >= 1 && state.currentPhase <= state.roadmap.length
            ? slugAt(state, state.roadmap, state.currentPhase)
            : undefined
    const activeLabel =
        active?.ok === true
            ? `${state.currentPhase} (\`${active.slug}\`)`
            : 'none'

    lines.push(
        `**Phases:** ${state.roadmap.length} · **Active:** ${activeLabel}`,
        '',
        '| # | Phase | Slug | Complexity | Depends on | Status |',
        '| --- | --- | --- | --- | --- | --- |'
    )

    state.roadmap.forEach((phase, index) => {
        const resolved = slugAt(state, state.roadmap, index + 1)
        const NN = String(index + 1).padStart(2, '0')
        const slug = resolved.ok ? `\`${resolved.slug}\`` : '— (invalid name)'
        const deps = phase.deps.length > 0 ? phase.deps.join(', ') : '—'
        lines.push(
            `| ${NN} | ${escapeCell(phase.name)} | ${slug} | ${
                phase.complexity ?? '—'
            } | ${escapeCell(deps)} | ${phase.status} |`
        )
    })

    lines.push('')
    return lines.join('\n')
}

/**
 * Write the regenerated `.luca/roadmap.md` for `state`.
 *
 * @param cwd - Project root.
 * @param state - The post-mutation workflow state.
 * @returns The project-relative path that was written.
 */
export async function writeRoadmapMd(
    cwd: string,
    state: LucaState
): Promise<string> {
    await writeAtomicFile(
        join(cwd, lucaRootPaths.roadmap),
        renderRoadmapMd(state)
    )
    return lucaRootPaths.roadmap
}

/**
 * Apply phase-directory renames on disk, skipping moves whose source does
 * not exist (a phase may be registered in the roadmap long before its
 * directory holds anything).
 *
 * The caller is responsible for ORDERING: when phase numbers shift UP the
 * moves must be applied highest-first, and when they shift DOWN lowest-first,
 * so a rename never lands on an occupied destination.
 *
 * @param cwd - Project root.
 * @param moves - Ordered directory renames.
 * @returns The subset of `moves` that were actually applied.
 * @throws If a destination directory already exists (a slug collision the
 *   caller should have rejected).
 */
export async function applyPhaseDirMoves(
    cwd: string,
    moves: PhaseDirMove[]
): Promise<PhaseDirMove[]> {
    const applied: PhaseDirMove[] = []
    for (const move of moves) {
        const fromAbs = join(cwd, phasePathFor(move.from))
        const toAbs = join(cwd, phasePathFor(move.to))
        if (!existsSync(fromAbs)) continue
        if (existsSync(toAbs)) {
            throw new Error(
                `cannot renumber phase directory '${move.from}' → '${move.to}': destination already exists`
            )
        }
        await rename(fromAbs, toAbs)
        applied.push(move)
    }
    return applied
}

/**
 * Create the phase directory for `slug` if it is absent.
 *
 * @param cwd - Project root.
 * @param slug - Contract-valid phase slug (`<NN>-<kebab>`).
 * @returns The project-relative directory path.
 */
export async function ensurePhaseDir(
    cwd: string,
    slug: string
): Promise<string> {
    const rel = phasePathFor(slug)
    await mkdir(join(cwd, rel), { recursive: true })
    return rel
}

/**
 * Remove a phase directory ONLY when it is empty.
 *
 * A future phase registered by `add-phase` has an empty directory, so the
 * common case cleans up. A directory holding artifacts is left in place
 * rather than destroyed — `remove-phase` is a roadmap operation, not a
 * delete-my-work operation.
 *
 * @param cwd - Project root.
 * @param slug - Contract-valid phase slug.
 * @returns The removed project-relative path, or `null` when the directory
 *   was absent or non-empty (and therefore preserved).
 */
export async function removePhaseDirIfEmpty(
    cwd: string,
    slug: string
): Promise<string | null> {
    const rel = phasePathFor(slug)
    const abs = join(cwd, rel)
    if (!existsSync(abs)) return null
    const entries = await readdir(abs)
    if (entries.length > 0) return null
    await rm(abs, { recursive: true, force: true })
    return rel
}
