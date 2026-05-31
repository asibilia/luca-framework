/**
 * CLI command group: `luca phase`
 *
 * Read-only inspection of the active phase. Part of the v13 `luca` write
 * surface (Phase B).
 *
 * The 9 freeform phase artifact writes (research, context, plan,
 * plan-review, summary, wave, verify, audit, learn) intentionally have NO
 * CLI command — they are written with the agent's native `Write` tool to
 * the canonical path (v13 plan, Phase C). Only the read leaf lives here.
 *
 * Leaves:
 *   - `phase current` — info about the active phase (pure read)
 */
import { defineCommand } from 'citty'

import { lucaPhaseCurrentTool } from '../../write-surface/index.ts'
import { runWriteHandler } from './__helpers/run-handler.ts'

const currentCommand = defineCommand({
    meta: {
        name: 'current',
        description:
            'Report the currently active phase: { active, NN, slug, dir }. ' +
            'Returns { active: false } when no phase is active. Use the ' +
            '`dir` field as the base for native Write-tool artifact paths. ' +
            'Pure read; allowed in every pipelineStep.',
    },
    async run() {
        await runWriteHandler('phase current', lucaPhaseCurrentTool, {})
    },
})

export const phaseCommand = defineCommand({
    meta: {
        name: 'phase',
        description: 'Inspect the active Luca workflow phase',
    },
    subCommands: {
        current: currentCommand,
    },
})
