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
 *   - `phase advance` — move currentPhase → currentPhase+1 at a phase boundary
 *   - `phase archive` — move .luca/phases/* → .luca/archive/* at milestone close
 */
import { defineCommand } from 'citty'

import {
    lucaPhaseAdvanceTool,
    lucaPhaseArchiveTool,
    lucaPhaseCurrentTool,
} from '../../write-surface/index.ts'
import { rejectUnknownFlags, runWriteHandler } from './__helpers/run-handler.ts'

const currentCommand = defineCommand({
    meta: {
        name: 'current',
        description:
            'Report the currently active phase: { active, NN, slug, dir }. ' +
            'Returns { active: false } when no phase is active. Use the ' +
            '`dir` field as the base for native Write-tool artifact paths. ' +
            'Pure read; allowed in every pipelineStep.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('phase current', cmd, rawArgs)
        await runWriteHandler('phase current', lucaPhaseCurrentTool, {})
    },
})

const advanceCommand = defineCommand({
    meta: {
        name: 'advance',
        description:
            'Advance the active roadmap phase by one (currentPhase → ' +
            'currentPhase+1), marking the completed phase done and the next ' +
            'in-progress. Call at the phase boundary (learn step) when more ' +
            'phases remain; the final phase routes to the finalize step.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('phase advance', cmd, rawArgs)
        await runWriteHandler('phase advance', lucaPhaseAdvanceTool, {})
    },
})

const archiveCommand = defineCommand({
    meta: {
        name: 'archive',
        description:
            'Archive all active phase directories (.luca/phases/<slug>/ → ' +
            '.luca/archive/<slug>/) at milestone close, so the next milestone ' +
            'starts from an empty phases/ dir. Idempotent; skips slugs already ' +
            'archived. Allowed only in the finalize step.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('phase archive', cmd, rawArgs)
        await runWriteHandler('phase archive', lucaPhaseArchiveTool, {})
    },
})

export const phaseCommand = defineCommand({
    meta: {
        name: 'phase',
        description: 'Inspect, advance, and archive Luca workflow phases',
    },
    subCommands: {
        current: currentCommand,
        advance: advanceCommand,
        archive: archiveCommand,
    },
})
