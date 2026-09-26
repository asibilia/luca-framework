import { defineRpc } from '@getpaseo/plugin'
import { z } from 'zod'

import {
    BoardStateSchema,
    EngineEndedSchema,
    RunSummarySchema,
} from './board-state'

/**
 * The plugin's RPCs. Payload keys are snake_case (API convention).
 *
 * - `run.start`: the `/luca-run` slash command asks the daemon to launch a run.
 * - `engine.event`: the engine sends its journal records to the board.
 * - `board.read`: the side panel polls the runs of one workspace.
 */

/**
 * API Request: start a run from a chat. `args` is what followed `/luca-run`.
 */
export const RunStartInputSchema = z.object({
    agent_id: z.string().min(1),
    workspace_id: z.string().min(1),
    /** The chat's working directory: the repo the run builds in. */
    cwd: z.string().min(1),
    args: z.string(),
})

/** API Response: whether the engine was launched, and the run's id. */
export const RunStartOutputSchema = z.object({
    ok: z.boolean(),
    message: z.string(),
    run_id: z.string().nullable(),
})

export const runStartRpc = defineRpc({
    name: 'run.start',
    input: RunStartInputSchema,
    output: RunStartOutputSchema,
})

export type RunStartInput = z.infer<typeof RunStartInputSchema>
export type RunStartOutput = z.infer<typeof RunStartOutputSchema>

/**
 * One journal record, verbatim. The envelope is checked here; `content` is
 * read loosely by the board, per kind, and unknown kinds are ignored.
 */
export const EngineRecordSchema = z.object({
    seq: z.number().int().min(1),
    time: z.string(),
    kind: z.string().min(1),
    ticket: z.number().nullable(),
    role: z.string().nullable(),
    content: z.unknown(),
})

export type EngineRecord = z.infer<typeof EngineRecordSchema>

/**
 * API Request: the engine's journal records for one run, in seq order, plus
 * `ended` once the engine has finished (ok or failed).
 */
export const EngineEventInputSchema = z.object({
    run_id: z.string().min(1),
    token: z.string().min(1),
    records: z.array(EngineRecordSchema),
    ended: EngineEndedSchema.nullable(),
})

/**
 * API Response: `next_seq` is the next seq the board wants. The engine resends
 * from there. `ok: false` means the run is unknown or the token is wrong, and
 * nothing was applied.
 */
export const EngineEventOutputSchema = z.object({
    ok: z.boolean(),
    next_seq: z.number().int().min(0),
    message: z.string(),
})

export const engineEventRpc = defineRpc({
    name: 'engine.event',
    input: EngineEventInputSchema,
    output: EngineEventOutputSchema,
})

export type EngineEventInput = z.infer<typeof EngineEventInputSchema>
export type EngineEventOutput = z.infer<typeof EngineEventOutputSchema>

/** API Request: the runs of one workspace. */
export const BoardReadInputSchema = z.object({
    workspace_id: z.string().min(1),
    /**
     * The workspace's folder: runs the plugin didn't start show only in the
     * workspace whose folder is their repo, and nowhere when `null`.
     */
    directory: z.string().nullable().default(null),
    /** The run to show in full; the newest one when `null`. */
    run_id: z.string().nullable().default(null),
})

/** API Response: run summaries (newest first) and one run in full. */
export const BoardReadOutputSchema = z.object({
    runs: z.array(RunSummarySchema),
    selected: BoardStateSchema.nullable(),
})

export const boardReadRpc = defineRpc({
    name: 'board.read',
    input: BoardReadInputSchema,
    output: BoardReadOutputSchema,
})

export type BoardReadInput = z.input<typeof BoardReadInputSchema>
export type BoardReadOutput = z.infer<typeof BoardReadOutputSchema>
