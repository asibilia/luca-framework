/**
 * Write-surface handler: `luca pr-outcome`.
 *
 * Appends a single `pr.outcome` telemetry record to the fixed synthetic-runId
 * log `.luca/telemetry/pr-outcomes.jsonl`. The merge/revert event happens
 * outside the originating session (a human merges the PR later), so this record
 * cannot ride the originating run's telemetry file. Instead it lands in a
 * stable, fixed log keyed by the literal runId `'pr-outcomes'`, and carries the
 * originating run via `meta.originRunId` for correlation back to the `pr.created`
 * run→PR map (join key `meta.prNumber`).
 *
 * Telemetry-only: this handler NEVER reads or writes workflow state — the runId
 * is the fixed literal `'pr-outcomes'`, so no active-slug / state lookup is
 * required. All inputs arrive as explicit, validated flags (no `gh pr view`
 * derivation anywhere on the path), making the command deterministic and fully
 * unit-testable.
 */
import { appendTelemetry } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

/**
 * Input schema for `luca_pr_outcome` — mirrors the advisory
 * `PrOutcomeMetaSchema` exported from `@alecsibilia/luca-core/telemetry`.
 *
 *   - `prNumber`: the PR number (join key back to the `pr.created` map).
 *   - `result`: terminal outcome — `merged` or `reverted`.
 *   - `reviewRounds`: how many review iterations the PR went through.
 *   - `timeToMergeMs`: wall-clock from PR open to merge/revert, in ms.
 *   - `branch?`: the feature branch the PR was opened from.
 *   - `issue?`: the tracker issue number the PR closes.
 *   - `originRunId?`: the originating session's runId, for correlation.
 */
const inputSchema = z.object({
    prNumber: z
        .number()
        .describe('The PR number (join key to the pr.created map).'),
    result: z
        .enum(['merged', 'reverted'])
        .describe('Terminal PR outcome: merged | reverted.'),
    reviewRounds: z
        .number()
        .describe('How many review iterations the PR went through.'),
    timeToMergeMs: z
        .number()
        .describe('Wall-clock from PR open to merge/revert, in milliseconds.'),
    branch: z
        .string()
        .optional()
        .describe('The feature branch the PR was opened from.'),
    issue: z
        .number()
        .optional()
        .describe('The tracker issue number the PR closes.'),
    originRunId: z
        .string()
        .optional()
        .describe("The originating session's runId, for correlation."),
})

/**
 * Append a `pr.outcome` telemetry record to
 * `.luca/telemetry/pr-outcomes.jsonl` (the fixed synthetic-runId log).
 *
 * Telemetry-only: no workflow state is read or written. The runId is the fixed
 * literal `'pr-outcomes'`, so there is no active-phase lookup; the handler is
 * callable in any pipelineStep.
 */
export const lucaPrOutcomeTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_pr_outcome',
    description:
        'Append a pr.outcome telemetry record to the fixed pr-outcomes.jsonl log. Explicit flags only (no gh pr view). Payload: prNumber, result (merged|reverted), reviewRounds, timeToMergeMs, branch?, issue?, originRunId?.',
    inputSchema,
    async handler(args, ctx) {
        appendTelemetry({
            cwd: ctx.cwd,
            kind: 'pr.outcome',
            ctx: {
                runId: 'pr-outcomes',
                phase: null,
                slug: null,
                wave: null,
                complexity: null,
                oversight: null,
            },
            meta: {
                prNumber: args.prNumber,
                result: args.result,
                reviewRounds: args.reviewRounds,
                timeToMergeMs: args.timeToMergeMs,
                ...(args.branch !== undefined ? { branch: args.branch } : {}),
                ...(args.issue !== undefined ? { issue: args.issue } : {}),
                ...(args.originRunId !== undefined
                    ? { originRunId: args.originRunId }
                    : {}),
            },
        })

        return {
            content: [
                {
                    type: 'text',
                    text: `appended pr.outcome (#${args.prNumber}, ${args.result}) to pr-outcomes.jsonl`,
                },
            ],
        }
    },
}
