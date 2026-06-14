/**
 * CLI command group: `luca state`
 *
 * Structured/operational mutations of the workflow state machine in
 * `.luca/state.json`. Part of the v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `state read`              — read the full workflow state (pure read)
 *   - `state advance`           — atomically advance the pipelineStep
 *   - `state claim-owner`       — record the session_id that owns the run
 *   - `state set-current-phase` — position currentPhase (recovery primitive)
 */
import { defineCommand } from 'citty'

import {
    lucaStateAdvanceTool,
    lucaStateClaimOwnerTool,
    lucaStateReadTool,
    lucaStateSetCurrentPhaseTool,
} from '../../write-surface/index.ts'
import { rejectUnknownFlags, runWriteHandler } from './__helpers/run-handler.ts'

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            'Read the current workflow state from .luca/state.json — ' +
            'pipelineStep, currentPhase, iteration counters, and roadmap. ' +
            'Pure read; allowed in every pipelineStep.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('state read', cmd, rawArgs)
        await runWriteHandler('state read', lucaStateReadTool, {})
    },
})

const advanceCommand = defineCommand({
    meta: {
        name: 'advance',
        description:
            'Atomically advance the workflow pipelineStep. The transition ' +
            'is validated against the pipeline-transitions table; illegal ' +
            'jumps are rejected.',
    },
    args: {
        'to-step': {
            type: 'string',
            required: true,
            description:
                'Target pipelineStep (e.g. research, plan, execute). Must ' +
                'be a legal transition from the current step.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('state advance', cmd, rawArgs)
        await runWriteHandler('state advance', lucaStateAdvanceTool, {
            toStep: args['to-step'],
        })
    },
})

const claimOwnerCommand = defineCommand({
    meta: {
        name: 'claim-owner',
        description:
            'Record the Claude Code session that owns the current run ' +
            '(state.ownerSessionId). Idempotent and phase-agnostic — the ' +
            'stage-gate hook uses it to scope phase enforcement to the ' +
            'owning session.',
    },
    args: {
        'session-id': {
            type: 'string',
            required: true,
            description:
                'Claude Code session_id of the session driving the run.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('state claim-owner', cmd, rawArgs)
        await runWriteHandler('state claim-owner', lucaStateClaimOwnerTool, {
            sessionId: args['session-id'],
        })
    },
})

const setCurrentPhaseCommand = defineCommand({
    meta: {
        name: 'set-current-phase',
        description:
            'Set currentPhase directly to a 1-based phase number and mark ' +
            'that phase in-progress. Recovery primitive for restoring ' +
            'position after a roadmap reset/wipe.',
    },
    args: {
        'phase-number': {
            type: 'string',
            required: true,
            description:
                'Target phase number (1-based); must be within 1..totalPhases.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('state set-current-phase', cmd, rawArgs)
        await runWriteHandler(
            'state set-current-phase',
            lucaStateSetCurrentPhaseTool,
            { currentPhase: Number(args['phase-number']) }
        )
    },
})

export const stateCommand = defineCommand({
    meta: {
        name: 'state',
        description: 'Read and advance the Luca workflow state machine',
    },
    subCommands: {
        read: readCommand,
        advance: advanceCommand,
        'claim-owner': claimOwnerCommand,
        'set-current-phase': setCurrentPhaseCommand,
    },
})
