import { existsSync } from 'node:fs'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

import { archivedPhasePathFor } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

const inputSchema = z.object({})

/**
 * Archive every active phase directory: move `.luca/phases/<slug>/` →
 * `.luca/archive/<slug>/`. Called at milestone close so the next milestone's
 * roadmap starts from an empty `phases/` directory.
 *
 * Without this, `milestone-complete` only snapshotted the roadmap/audit/backlog
 * files to `.luca/milestones/` and left the phase dirs in place. They then
 * pile up across milestones and collide on phase number (e.g. several `01-*`
 * dirs), violating the planning-structure contract ("archive/<NN-slug>/ —
 * phase directories closed at milestone — frozen, never resurfaces").
 *
 * Idempotent and non-destructive: a phase whose archive destination already
 * exists is skipped (the archive is frozen and must never be overwritten),
 * and the move is a same-filesystem rename. Restricted to milestone-close
 * steps so an in-progress phase is never archived out from under the pipeline.
 */
export const lucaPhaseArchiveTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_phase_archive',
        description:
            'Archive all active phase directories (.luca/phases/<slug>/ → .luca/archive/<slug>/) at milestone close, so the next milestone starts from an empty phases/ dir. Idempotent: a slug already present under archive/ is skipped, not overwritten. Allowed only in the finalize step.',
        inputSchema,
        allowedPhases: ['finalize'],
        async handler(_args, ctx) {
            const phasesDir = join(ctx.cwd, '.luca', 'phases')
            if (!existsSync(phasesDir)) {
                return ok('no .luca/phases/ directory — nothing to archive.')
            }

            const entries = await readdir(phasesDir, { withFileTypes: true })
            const archived: string[] = []
            const skipped: string[] = []
            const invalid: string[] = []

            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                const slug = entry.name

                // `archivedPhasePathFor` validates the slug against the
                // contract and THROWS on a non-conforming name. A stray or
                // corrupted directory must not crash the whole archive (and
                // block milestone close) — skip it and report instead.
                let to: string
                try {
                    to = join(ctx.cwd, archivedPhasePathFor(slug))
                } catch {
                    invalid.push(slug)
                    continue
                }
                const from = join(phasesDir, slug)

                // Never overwrite a frozen archive entry. A collision means the
                // slug was already archived in a prior milestone — leave both
                // in place and report so the operator can resolve it.
                if (existsSync(to)) {
                    skipped.push(slug)
                    continue
                }

                await mkdir(join(ctx.cwd, '.luca', 'archive'), {
                    recursive: true,
                })
                await rename(from, to)
                archived.push(slug)
            }

            const parts = [`archived ${archived.length} phase(s) → .luca/archive/`]
            if (archived.length > 0) parts.push(`moved: ${archived.join(', ')}`)
            if (skipped.length > 0) {
                parts.push(
                    `skipped (archive entry already exists): ${skipped.join(', ')}`
                )
            }
            if (invalid.length > 0) {
                parts.push(
                    `skipped (not a valid phase slug): ${invalid.join(', ')}`
                )
            }
            return ok(parts.join('. '))
        },
    }

function ok(text: string) {
    return { content: [{ type: 'text' as const, text }] }
}
