/**
 * CLI command: luca retro
 *
 * Inspect the most recent Luca pipeline postmortem. Prints the cached
 * `.planning/POSTMORTEM.md` if it exists. With `--list`, enumerates
 * archived runs under `.planning/runs/`. Generating a fresh postmortem
 * for the live run is done from inside the harness via `runPostmortem`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'

import { defineCommand } from 'citty'
import { join, resolve } from 'pathe'

import { logger } from '../utils/logger'

export const retroCommand = defineCommand({
    meta: {
        name: 'retro',
        description:
            'Show the latest Luca pipeline postmortem from .planning/POSTMORTEM.md',
    },
    args: {
        list: {
            type: 'boolean',
            description: 'List archived runs under .planning/runs/',
            required: false,
        },
    },
    async run({ args }) {
        const planningDir = resolve(process.cwd(), '.planning')
        const runsDir = join(planningDir, 'runs')

        if (args.list) {
            if (!existsSync(runsDir)) {
                logger.info('No archived runs found in .planning/runs/')
                return
            }
            const entries = readdirSync(runsDir).filter((name) => {
                try {
                    return statSync(join(runsDir, name)).isDirectory()
                } catch {
                    return false
                }
            })
            if (entries.length === 0) {
                logger.info('No archived runs found in .planning/runs/')
                return
            }
            for (const runId of entries) {
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
