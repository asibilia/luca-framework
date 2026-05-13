/**
 * CLI command: luca retro
 *
 * Inspect the most recent Luca pipeline postmortem. Prints the cached
 * `.planning/POSTMORTEM.md` if it exists. With `--list`, enumerates
 * archived runs across both `.planning/phases/<slug>/runs/` (current
 * layout per issue #220) and the legacy `.planning/runs/` location.
 * Generating a fresh postmortem for the live run is done from inside
 * the harness via `runPostmortem`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'

import { defineCommand } from 'citty'
import { join, resolve } from 'pathe'

import { logger } from '../utils/logger'

/**
 * Yield directories that may hold archived run subdirectories, in priority
 * order: every `phases/<slug>/runs/` directory on disk, followed by the
 * legacy `.planning/runs/` root. Mirrors the lookup used by
 * `luca-mastracode`'s `listArchivedRuns()` so the CLI stays consistent
 * with postmortem/recurrence analysis after issue #220.
 */
function candidateArchiveRoots(planningDir: string): string[] {
    const roots: string[] = []
    const phasesRoot = join(planningDir, 'phases')
    if (existsSync(phasesRoot)) {
        try {
            for (const entry of readdirSync(phasesRoot, {
                withFileTypes: true,
            })) {
                if (!entry.isDirectory()) continue
                roots.push(join(phasesRoot, entry.name, 'runs'))
            }
        } catch {
            // ignore unreadable phases/ root
        }
    }
    roots.push(join(planningDir, 'runs'))
    return roots
}

function listArchivedRunIds(planningDir: string): string[] {
    const seen = new Set<string>()
    for (const archiveRoot of candidateArchiveRoots(planningDir)) {
        if (!existsSync(archiveRoot)) continue
        try {
            for (const name of readdirSync(archiveRoot)) {
                try {
                    if (statSync(join(archiveRoot, name)).isDirectory()) {
                        seen.add(name)
                    }
                } catch {
                    // ignore unreadable entries
                }
            }
        } catch {
            // ignore unreadable archive root
        }
    }
    return Array.from(seen)
}

export const retroCommand = defineCommand({
    meta: {
        name: 'retro',
        description:
            'Show the latest Luca pipeline postmortem from .planning/POSTMORTEM.md',
    },
    args: {
        list: {
            type: 'boolean',
            description:
                'List archived runs under .planning/phases/<slug>/runs/ and .planning/runs/',
            required: false,
        },
    },
    async run({ args }) {
        const planningDir = resolve(process.cwd(), '.planning')

        if (args.list) {
            const runIds = listArchivedRunIds(planningDir)
            if (runIds.length === 0) {
                logger.info('No archived runs found.')
                return
            }
            for (const runId of runIds) {
                logger.info(runId)
            }
            return
        }

        const postmortemPath = join(planningDir, 'POSTMORTEM.md')
        if (!existsSync(postmortemPath)) {
            logger.warn(
                'No .planning/POSTMORTEM.md found. Run `luca run` and let finalize emit one, or call runPostmortem(action: "render") inside the harness.'
            )
            return
        }
        process.stdout.write(readFileSync(postmortemPath, 'utf8'))
    },
})
